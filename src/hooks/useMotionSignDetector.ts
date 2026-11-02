// hooks/useMotionSignDetector.ts
// Sign detection with the FSL16 GRU, following the model README (FSL16 GRU - Android Integration Spec):
//   MediaPipe hand landmarks (native plugin) -> wrist-relative per hand (slot = detection order,
//   missing hand = zeros) -> samples taken every ~133 ms -> when the hand leaves, the finished sign is
//   placed in the MIDDLE of a 30-sample (~4 s) window padded with zeros -> [1,30,126] -> [1,16] softmax.
//
// Verified offline on 10 labelled clips with the SAME .tflite: this method (mirror OFF) got 9/10 right
// (47/50 across start offsets). The old "record the sign, stretch it to 30 frames, mirror ON" method got 4/10.
// The sign is NOT stretched to fill 30 frames: it sits inside a 4 s window and the rest is zeros.
// Classifying only after the hand leaves matters: the first half of MOTHER looks like KNOW, so answering
// while the sign is still in progress gave KNOW for MOTHER. Live simulation: 37/40 this way vs 30/40.
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';
import {
  Camera,
  runAtTargetFps,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
  VisionCameraProxy,
} from 'react-native-vision-camera';
import { Worklets, useSharedValue } from 'react-native-worklets-core';
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import RNFS from 'react-native-fs';
import Speech from '@mhpdev/react-native-speech';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Labels: order MUST match the model output (see FSL16_labels.txt) ────────
export const FSL16_LABELS: string[] = [
  'GOOD MORNING', 'GOOD AFTERNOON', 'GOOD EVENING', 'HOW ARE YOU',
  'THANK YOU', 'UNDERSTAND', 'KNOW', 'NO',
  'YES', 'MONDAY', 'SUNDAY', 'TODAY',
  'TOMORROW', 'YESTERDAY', 'FATHER', 'MOTHER',
];

// ─── Constants ───────────────────────────────────────────────────────────────
const MODEL_ASSET = 'fsl16_gru_model.tflite';
const SEQ_LEN = 30;
const LANDMARKS = 21;
const HAND_FEATURES = LANDMARKS * 3; // 63
const FEATURES = HAND_FEATURES * 2; // 126

// README: ~133 ms between samples (~7.5 per second) -> 30 samples ~ 4 seconds.
const PROCESS_FPS = 7.5;           // frame-processor rate = model's training sample rate
const SAMPLE_INTERVAL_MS = 90;     // just drops duplicate ticks; real spacing comes from PROCESS_FPS

const CONF_THRESHOLD = 0.7;        // README: starting value, tune with real testing
const MIN_MARGIN = 0.25;           // top1 must beat top2 by at least this much
const MIN_HAND_FRAMES = 4;         // fewer hand samples than this is a blip, not a sign
const END_GAP_SAMPLES = 3;         // hand gone this many samples (~0.4 s) = sign finished

// Set true while tuning: logs top-3 scores for every prediction.
const DEBUG_GRU = true;

// Landmark rotation (degrees clockwise) that makes hands come out upright.
// Verify on the phone: with a hand held fingers-up the debug line must say UPRIGHT.
const DEFAULT_ROTATION = 270;

// README tests (10 clips, same model) were best with mirror OFF (raw camera view of the signer).
// Toggle on screen to compare on the phone.
const MIRROR_FRONT_CAMERA = false;
const MIRROR_BACK_CAMERA = false;

export type CameraPosition = 'front' | 'back';
export type MotionStatus = 'idle' | 'noHand' | 'collecting' | 'still' | 'unknown' | 'ready';
export type SignDetection = { label: string; confidence: number };
type Prediction = SignDetection & { idx: number; margin: number };
type Sample = { f: Float32Array; h: boolean };

// Native plugin (HandLandmarkerPlugin.kt). Null if it isn't registered in this build.
const handsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {});
export const HAND_PLUGIN_AVAILABLE = handsPlugin != null;

// Raw normalized deltas (README 4.2).
const X_SCALE = 1;
const Y_SCALE = 1;
const Z_SCALE = 1;

// ─── Preprocessing ───────────────────────────────────────────────────────────
// hands: up to 2 arrays of 63 raw floats, in MediaPipe detection order.
// Each hand is made wrist-relative on its own; a missing 2nd hand stays zeros.
// Rotate a (dx, dy) delta clockwise in image coords (y down) by 0/90/180/270.
function rotDelta(dx: number, dy: number, rot: number): [number, number] {
  if (rot === 90) return [-dy, dx];
  if (rot === 180) return [-dx, -dy];
  if (rot === 270) return [dy, -dx];
  return [dx, dy];
}

// Is a hand with fingers pointing up reported as upright? (wrist -> middle fingertip)
function orientOf(lm: number[] | undefined, rot: number): string {
  if (!lm || lm.length < HAND_FEATURES) return '-';
  const [dx, dy] = rotDelta(lm[36] - lm[0], lm[37] - lm[1], rot);
  const tag =
    Math.abs(dy) < Math.abs(dx) ? 'SIDEWAYS' : dy < 0 ? 'UPRIGHT' : 'UPSIDE-DOWN';
  return `${tag} (dx ${dx.toFixed(2)}, dy ${dy.toFixed(2)})`;
}

function buildFrame(hands: number[][], mirror: boolean, rot: number): Float32Array {
  const frame = new Float32Array(FEATURES);
  const count = Math.min(hands.length, 2);
  for (let h = 0; h < count; h++) {
    const lm = hands[h];
    if (!lm || lm.length < HAND_FEATURES) continue;
    const wx = lm[0];
    const wy = lm[1];
    const wz = lm[2];
    const base = h * HAND_FEATURES;
    for (let i = 0; i < LANDMARKS; i++) {
      const [rx, ry] = rotDelta(lm[i * 3] - wx, lm[i * 3 + 1] - wy, rot);
      const dx = rx * X_SCALE;
      frame[base + i * 3] = mirror ? -dx : dx;
      frame[base + i * 3 + 1] = ry * Y_SCALE;
      frame[base + i * 3 + 2] = (lm[i * 3 + 2] - wz) * Z_SCALE;
    }
  }
  return frame;
}

function toSpeechText(label: string): string {
  return label.toLowerCase();
}

// Put the finished sign in the middle of a 30-sample window; the rest is zeros ("no hand"),
// like the idle time around a sign in the training clips.
function centreWindow(sign: Sample[]): Sample[] {
  const body = sign.slice(0, SEQ_LEN);
  const pad = SEQ_LEN - body.length;
  const before = Math.floor(pad / 2);
  const blank = (): Sample => ({ f: new Float32Array(FEATURES), h: false });
  return [
    ...Array.from({ length: before }, blank),
    ...body,
    ...Array.from({ length: pad - before }, blank),
  ];
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useMotionSignTranslator() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');

  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('front');
  const cameraPositionRef = useRef<CameraPosition>('front');
  useEffect(() => {
    cameraPositionRef.current = cameraPosition;
  }, [cameraPosition]);

  const hasBackCamera = !!backDevice;
  const device =
    cameraPosition === 'back' ? (backDevice ?? frontDevice) : (frontDevice ?? backDevice);

  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: 30 },
  ]);

  const cameraRef = useRef<Camera>(null);

  // ─── State ─────────────────────────────────────────────────────────
  const [isDetecting, setIsDetecting] = useState(false);
  const [detection, setDetection] = useState<SignDetection | null>(null);
  const [status, setStatusState] = useState<MotionStatus>('idle');
  const [progress, setProgress] = useState(0); // hand samples currently in the 4 s window

  const statusRef = useRef<MotionStatus>('idle');
  const setStatus = useCallback((s: MotionStatus) => {
    if (statusRef.current !== s) {
      statusRef.current = s;
      setStatusState(s);
    }
  }, []);

  const isDetectingRef = useRef(false);
  const detectingSV = useSharedValue(false); // read inside the frame processor worklet
  const lastSampleRef = useRef(0);
  const signRef = useRef<Sample[]>([]);           // samples of the sign in progress (hand first seen -> now)
  const missRef = useRef(0);                      // consecutive samples with no hand
  const topRef = useRef('');
  const selfTestRef = useRef('');
  const [debugText, setDebugText] = useState('');
  // 270 was found by testing: it makes a hand pointing up read as UPRIGHT.
  const [rotDeg, setRotDeg] = useState(DEFAULT_ROTATION);
  const rotRef = useRef(DEFAULT_ROTATION);

  // Runtime mirror override (null = use per-camera default)
  const [mirrorOverride, setMirrorOverride] = useState<boolean | null>(null);
  const mirrorOverrideRef = useRef<boolean | null>(null);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;

  // ─── Model ─────────────────────────────────────────────────────────
  const [model, setModel] = useState<TensorflowModel | null>(null);
  const modelRef = useRef<TensorflowModel | null>(null);
  const [modelState, setModelState] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setModelState('loading');
        const localPath = `${RNFS.CachesDirectoryPath}/${MODEL_ASSET}`;
        // Always re-copy so an updated model in the APK is never shadowed by a stale cache
        if (await RNFS.exists(localPath)) await RNFS.unlink(localPath);
        await RNFS.copyFileAssets(MODEL_ASSET, localPath);

        const loaded = await loadTensorflowModel({ url: `file://${localPath}` }, []);
        if (cancelled) return;
        modelRef.current = loaded;
        if (DEBUG_GRU) {
          try {
            const top = (arr: Float32Array) => {
              let b = 0;
              for (let i = 1; i < arr.length; i++) if (arr[i] > arr[b]) b = i;
              return `${FSL16_LABELS[b]} ${Math.round(arr[b] * 100)}`;
            };
            const zeros = new Float32Array(SEQ_LEN * FEATURES);
            const z = new Float32Array(loaded.runSync([zeros.buffer as ArrayBuffer])[0]);
            // Note: the model has no "no sign" class (zeros -> YES). Empty windows are never sent to it.
            selfTestRef.current = `\nself-test: zeros->${top(z)} (never used)`;
            console.log('[GRU selftest]', selfTestRef.current);
          } catch (e) {
            console.warn('[GRU selftest] failed', e);
          }
        }
        setModel(loaded);
        setModelState('loaded');
      } catch (e) {
        if (!cancelled) {
          setModelState('error');
          console.warn('[MotionTranslator] model load error:', e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isModelReady = modelState === 'loaded' && !!model;

  // ─── Inference on the current 30-sample window ─────────────────────
  const predict = useCallback((win: Sample[]): Prediction | null => {
    const m = modelRef.current;
    if (!m || win.length !== SEQ_LEN) return null;

    const input = new Float32Array(SEQ_LEN * FEATURES);
    for (let t = 0; t < SEQ_LEN; t++) input.set(win[t].f, t * FEATURES);

    const outputs = m.runSync([input.buffer as ArrayBuffer]);
    const scores = new Float32Array(outputs[0]);
    const ranked = Array.from(scores)
      .map((s, i) => ({ i, s }))
      .sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const second = ranked[1];

    if (DEBUG_GRU) {
      topRef.current = 'top: ' + ranked.slice(0, 3).map(r => `${FSL16_LABELS[r.i]} ${Math.round(r.s * 100)}`).join(' | ');
      console.log('[GRU]', topRef.current);
    }

    return {
      idx: best.i,
      label: FSL16_LABELS[best.i] ?? `Class_${best.i}`,
      confidence: best.s,
      margin: best.s - (second?.s ?? 0),
    };
  }, []);

  // Clears the sign in progress (used on start/stop, camera switch, mirror/rotation change).
  const resetRecording = useCallback(() => {
    signRef.current = [];
    missRef.current = 0;
    setProgress(0);
  }, []);

  // ─── Called (on the JS thread) with each landmarker result ─────────
  // Hand appears -> collect samples (~133 ms apart). Hand gone ~0.4 s (or 30 samples) -> classify once.
  const handleHands = useCallback(
    (hands: number[][] | null) => {
      if (!isDetectingRef.current || !modelRef.current) return;

      const now = Date.now();
      const prevSample = lastSampleRef.current;
      if (now - prevSample < SAMPLE_INTERVAL_MS) return;
      lastSampleRef.current = now;
      const dt = prevSample ? now - prevSample : 0;

      const has = !!hands && hands.length > 0;
      const mirror =
        mirrorOverrideRef.current ??
        (cameraPositionRef.current === 'front' ? MIRROR_FRONT_CAMERA : MIRROR_BACK_CAMERA);
      const sign = signRef.current;

      // Nothing in progress and no hand: idle. Keep a finished result on screen.
      if (!has && sign.length === 0) {
        setStatus(statusRef.current === 'collecting' || statusRef.current === 'idle' ? 'noHand' : statusRef.current);
        return;
      }

      const frame = has ? buildFrame(hands as number[][], mirror, rotRef.current) : new Float32Array(FEATURES);

      if (sign.length === 0) {
        setDetection(null); // a new sign starts: clear the last result
      }
      sign.push({ f: frame, h: has });
      missRef.current = has ? 0 : missRef.current + 1;

      let handCount = 0;
      for (let i = 0; i < sign.length; i++) if (sign[i].h) handCount++;
      setProgress(Math.min(sign.length, SEQ_LEN));
      setStatus('collecting');

      if (DEBUG_GRU) {
        setDebugText(
          `hands ${has ? hands!.length : 0} | ${has ? orientOf(hands![0], rotRef.current) : '-'} | dt ${dt}ms | sign ${sign.length}/${SEQ_LEN} (hand samples ${handCount}) | mirror ${mirror ? 'ON' : 'OFF'}\n${topRef.current}${selfTestRef.current}`,
        );
      }

      const ended = !has && missRef.current >= END_GAP_SAMPLES;
      const full = sign.length >= SEQ_LEN;
      if (!ended && !full) return;

      // The sign is over: drop the trailing "no hand" samples, centre it in a 30-sample window, classify once.
      const finished = ended ? sign.slice(0, sign.length - missRef.current) : sign.slice();
      signRef.current = [];
      missRef.current = 0;
      setProgress(0);

      let hc = 0;
      for (let i = 0; i < finished.length; i++) if (finished[i].h) hc++;
      if (hc < MIN_HAND_FRAMES) {
        setStatus('noHand'); // just a blip
        return;
      }

      try {
        const result = predict(centreWindow(finished));
        if (result && result.confidence >= CONF_THRESHOLD && result.margin >= MIN_MARGIN) {
          if (DEBUG_GRU) {
            console.log('[sign]', result.label, 'conf', result.confidence.toFixed(2), 'margin', result.margin.toFixed(2), 'samples', finished.length);
          }
          setDetection({ label: result.label, confidence: result.confidence });
          setStatus('ready');
        } else {
          setDetection(null);
          setStatus('unknown');
        }
      } catch (e) {
        console.warn('[MotionTranslator] inference error:', e);
      }
    },
    [predict, setStatus],
  );

  const handleHandsJS = useMemo(() => Worklets.createRunOnJS(handleHands), [handleHands]);

  // ─── Frame processor (worklet thread) ──────────────────────────────
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (!detectingSV.value || handsPlugin == null) return;
      runAtTargetFps(PROCESS_FPS, () => {
        'worklet';
        const hands = handsPlugin.call(frame) as number[][] | null;
        handleHandsJS(hands ?? null);
      });
    },
    [handleHandsJS, detectingSV],
  );

  // ─── Camera switching ──────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!backDevice || !frontDevice) return;
    resetRecording();
    setDetection(null);
    setStatus(isDetectingRef.current ? 'still' : 'idle');
    setCameraPosition(prev => (prev === 'front' ? 'back' : 'front'));
  }, [backDevice, frontDevice, resetRecording, setStatus]);

  // ─── Voice ─────────────────────────────────────────────────────────
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const lastSpokenLabelRef = useRef<string | null>(null);

  useEffect(() => {
    Speech.configure({ rate: 0.85, pitch: 1.0, ducking: true });
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (!isVoiceEnabled) return;
    if (!detection) {
      lastSpokenLabelRef.current = null;
      return;
    }
    if (detection.label === lastSpokenLabelRef.current) return;
    lastSpokenLabelRef.current = detection.label;

    Speech.stop()
      .catch(() => {})
      .finally(() => {
        Speech.speak(toSpeechText(detection.label), { language: 'en-US' }).catch(e =>
          console.warn('[MotionTranslator] speech error:', e),
        );
      });
  }, [detection, isVoiceEnabled]);

  const toggleVoice = useCallback(() => {
    setIsVoiceEnabled(prev => {
      if (prev) Speech.stop();
      return !prev;
    });
  }, []);

  // ─── Result card animation ─────────────────────────────────────────
  useEffect(() => {
    if (detection) {
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, bounciness: 6 }),
      ]).start();
    } else {
      Animated.timing(cardOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      cardScale.setValue(0.85);
    }
  }, [detection, cardOpacity, cardScale]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // ─── Start / stop ──────────────────────────────────────────────────
  const toggleDetection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !isDetectingRef.current;
    isDetectingRef.current = next;
    detectingSV.value = next;

    resetRecording();
    lastSampleRef.current = 0;
    setDetection(null);
    setStatus(next ? 'still' : 'idle'); // 'still' = "Waiting for a sign…"
    setIsDetecting(next);
    if (!next) Speech.stop();
  }, [detectingSV, resetRecording, setStatus]);

  // ─── Mirror toggle ─────────────────────────────────────────────────
  const toggleMirror = useCallback(() => {
    const defaultMirror =
      cameraPositionRef.current === 'front' ? MIRROR_FRONT_CAMERA : MIRROR_BACK_CAMERA;
    const current = mirrorOverrideRef.current ?? defaultMirror;
    const next = !current;
    mirrorOverrideRef.current = next;
    setMirrorOverride(next);
    resetRecording();
    setDetection(null);
  }, [resetRecording]);

  const toggleRotation = useCallback(() => {
    const next = (rotRef.current + 90) % 360;
    rotRef.current = next;
    setRotDeg(next);
    resetRecording();
    setDetection(null);
  }, [resetRecording]);

  const isMirrored =
    mirrorOverride ?? (cameraPosition === 'front' ? MIRROR_FRONT_CAMERA : MIRROR_BACK_CAMERA);

  return {
    isMirrored,
    toggleMirror,
    rotDeg,
    toggleRotation,
    debugText,
    hasPermission,
    requestPermission,
    device,
    format,
    cameraPosition,
    hasBackCamera,
    toggleCamera,
    isDetecting,
    detection,
    status,
    progress,
    seqLen: SEQ_LEN,
    isModelReady,
    modelState,
    pluginAvailable: HAND_PLUGIN_AVAILABLE,
    frameProcessor,
    cameraRef,
    cardOpacity,
    cardScale,
    toggleDetection,
    isVoiceEnabled,
    toggleVoice,
  };
}