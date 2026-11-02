// hooks/useMotionSignDetector.ts
// Motion-based sign detection: MediaPipe hand landmarks (native frame processor plugin)
// -> wrist-relative normalization -> RECORD the whole sign (hand appears -> hand leaves)
// -> resample to 30 frames -> FSL16 GRU (.tflite) -> one result per sign.
// Spec: [1, 30, 126] float32 in, [1, 16] float32 softmax out.
//
// Checked offline against a labelled FATHER training clip: the model needs mirrored
// landmarks (mirror ON), raw x/y scale (1,1) and the hand in slot 0. With those, the sign
// stretched over 30 frames gives FATHER ~91%. With mirror OFF the same clip gives KNOW 100%.
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
const PROCESS_FPS = 20;            // frame-processor rate (was 7.5: too slow for a ~1s sign)
const SAMPLE_INTERVAL_MS = 40;     // min gap between recorded frames (~20-25 fps max)
const CONF_THRESHOLD = 0.7;        // tune with real testing
const MIN_MARGIN = 0.25;           // top1 must beat top2 by at least this much

// Record-then-classify
const END_GAP_MS = 400;            // hand gone this long = sign finished
const MIN_RECORD_FRAMES = 6;       // shorter than this is a blip, not a sign
const MAX_RECORD_FRAMES = 45;      // ~2.2s safety cap, then classify what we have (signs are ~1-2s)
// A sign also ends when the hand PAUSES (stays in view but stops moving) - otherwise a hand
// resting in frame would record forever and never produce a result.
// Hysteresis: MOVE_START is well above STILL_STEP so landmark jitter can't re-trigger a recording.
// Steps are smoothed (EMA) before being compared. Tune STILL_STEP from the on-screen debug "step"
// value while holding your hand still: set it ~30% above that.
const MOVE_START = 0.03;           // per-step movement that starts a recording
const STILL_STEP = 0.015;          // below this a step counts as "not moving"
const STILL_END_MS = 500;          // not moving this long = sign finished
const REARM_CALM_FRAMES = 4;       // after a result, hand must be calm this many frames before a new sign can start
const PRE_ROLL = 3;                // frames kept from just before the movement started
const MOTION_MIN = 0.012;          // resting hand ~0.004, a real sign ~0.03 (whole-sign average)

// Set true while tuning: logs top-3 scores, margin and recording length for every sign.
const DEBUG_GRU = true;

// Landmark rotation (degrees clockwise) that makes hands come out upright.
// Verify on the phone: with a hand held fingers-up the debug line must say UPRIGHT.
const DEFAULT_ROTATION = 270;

// The model was trained on mirrored (selfie-style) landmarks. A plain camera view of a
// signer (front or back camera buffer) needs mirror ON to match. Toggle on screen to compare.
const MIRROR_FRONT_CAMERA = true;
const MIRROR_BACK_CAMERA = true;

export type CameraPosition = 'front' | 'back';
export type MotionStatus = 'idle' | 'noHand' | 'collecting' | 'still' | 'unknown' | 'ready';
export type SignDetection = { label: string; confidence: number };
type Prediction = SignDetection & { idx: number; margin: number };

// Native plugin (HandLandmarkerPlugin.kt). Null if it isn't registered in this build.
const handsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {});
export const HAND_PLUGIN_AVAILABLE = handsPlugin != null;

// Raw normalized deltas. The old 0.75 / 1.333 factors lowered FATHER 91% -> 59% on the test clip.
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

// Average per-step movement over the whole resampled sign: wrist travel + finger/shape change.
function motionScore(seq: Float32Array[], wrists: number[][]): number {
  const n = Math.min(seq.length, wrists.length);
  if (n < 2) return 0;
  let sum = 0;
  for (let t = 1; t < n; t++) {
    let d = 0;
    for (let k = 0; k < FEATURES; k++) d += Math.abs(seq[t][k] - seq[t - 1][k]);
    d /= FEATURES;
    const wd = Math.hypot(wrists[t][0] - wrists[t - 1][0], wrists[t][1] - wrists[t - 1][1]);
    sum += d + wd;
  }
  return sum / (n - 1);
}

// Stretch/shrink a recording of any length to exactly SEQ_LEN frames (evenly spaced).
function resampleTo<T>(items: T[], n: number): T[] {
  const out: T[] = [];
  const last = items.length - 1;
  for (let i = 0; i < n; i++) out.push(items[Math.round((i * last) / (n - 1))]);
  return out;
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
  const [status, setStatus] = useState<MotionStatus>('idle');
  const [progress, setProgress] = useState(0); // frames recorded so far (bar fills toward MAX_RECORD_FRAMES)

  const isDetectingRef = useRef(false);
  const detectingSV = useSharedValue(false); // read inside the frame processor worklet
  const recordRef = useRef<Float32Array[]>([]); // frames of the sign being recorded
  const wristRef = useRef<number[][]>([]);       // wrist x/y per recorded frame (for the motion check)
  const lastSampleRef = useRef(0);
  const lastHandMsRef = useRef(0);               // when a hand was last seen
  const prevFrameRef = useRef<Float32Array | null>(null);
  const prevWristRef = useRef<number[] | null>(null);
  const preRollRef = useRef<{ f: Float32Array; w: number[] }[]>([]);
  const stillSinceRef = useRef(0);               // when the hand stopped moving (0 = moving)
  const stillCountRef = useRef(0);               // recorded frames since it stopped
  const smoothStepRef = useRef(0);               // EMA of per-frame movement
  const rearmRef = useRef(false);                // true after a result: wait for a calm hand before the next sign
  const calmRef = useRef(0);                     // consecutive calm frames while waiting to re-arm
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
            const noise = new Float32Array(SEQ_LEN * FEATURES).map(() => (Math.random() - 0.5) * 0.4);
            const z = new Float32Array(loaded.runSync([zeros.buffer as ArrayBuffer])[0]);
            const n = new Float32Array(loaded.runSync([noise.buffer as ArrayBuffer])[0]);
            selfTestRef.current = `\nself-test: zeros->${top(z)} | noise->${top(n)}`;
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

  // ─── Inference on one resampled 30-frame sign ──────────────────────
  const predict = useCallback((seq: Float32Array[]): Prediction | null => {
    const m = modelRef.current;
    if (!m || seq.length !== SEQ_LEN) return null;

    const input = new Float32Array(SEQ_LEN * FEATURES);
    for (let t = 0; t < SEQ_LEN; t++) input.set(seq[t], t * FEATURES);

    const outputs = m.runSync([input.buffer as ArrayBuffer]);
    const scores = new Float32Array(outputs[0]);
    const ranked = Array.from(scores)
      .map((s, i) => ({ i, s }))
      .sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const second = ranked[1];

    if (DEBUG_GRU) {
      topRef.current = 'top: ' + ranked.slice(0, 3).map(r => `${FSL16_LABELS[r.i]} ${Math.round(r.s * 100)}`).join(' | ');
      console.log(
        '[GRU]',
        ranked.slice(0, 3).map(r => `${FSL16_LABELS[r.i]} ${Math.round(r.s * 100)}`).join(' | '),
      );
    }

    return {
      idx: best.i,
      label: FSL16_LABELS[best.i] ?? `Class_${best.i}`,
      confidence: best.s,
      margin: best.s - (second?.s ?? 0),
    };
  }, []);

  // Clears the in-progress recording (used on stop, camera switch, mirror/rotation change).
  const resetRecording = useCallback(() => {
    recordRef.current = [];
    wristRef.current = [];
    prevFrameRef.current = null;
    prevWristRef.current = null;
    preRollRef.current = [];
    stillSinceRef.current = 0;
    stillCountRef.current = 0;
    smoothStepRef.current = 0;
    rearmRef.current = false;
    calmRef.current = 0;
    setProgress(0);
  }, []);

  // The sign is over: resample the recording to 30 frames and classify it once.
  const finalizeRecording = useCallback(() => {
    let rec = recordRef.current;
    let wr = wristRef.current;
    // Drop the trailing "hand not moving" frames (keep 2) so they don't dilute the sign.
    const trim = stillCountRef.current - 2;
    if (trim > 0 && rec.length - trim >= MIN_RECORD_FRAMES) {
      rec = rec.slice(0, rec.length - trim);
      wr = wr.slice(0, wr.length - trim);
    }
    recordRef.current = [];
    wristRef.current = [];
    stillSinceRef.current = 0;
    stillCountRef.current = 0;
    smoothStepRef.current = 0;
    // Don't start a new recording until the hand calms down or leaves the frame,
    // otherwise a moving hand re-triggers instantly and the UI looks stuck.
    rearmRef.current = true;
    calmRef.current = 0;
    setProgress(0);

    if (rec.length < MIN_RECORD_FRAMES) {
      setStatus('noHand'); // just a blip
      return;
    }

    const seq = resampleTo(rec, SEQ_LEN);
    const wrists = resampleTo(wr, SEQ_LEN);

    const motion = motionScore(seq, wrists);
    if (DEBUG_GRU) console.log('[motion]', motion.toFixed(4), 'frames', rec.length);
    if (motion < MOTION_MIN) {
      setDetection(null);
      setStatus('still');
      return;
    }

    try {
      const result = predict(seq);
      if (DEBUG_GRU && result) {
        console.log('[sign]', result.label, 'conf', result.confidence.toFixed(2), 'margin', result.margin.toFixed(2), 'frames', rec.length);
      }
      if (result && result.confidence >= CONF_THRESHOLD && result.margin >= MIN_MARGIN) {
        setDetection({ label: result.label, confidence: result.confidence });
        setStatus('ready');
      } else {
        setDetection(null);
        setStatus('unknown');
      }
    } catch (e) {
      console.warn('[MotionTranslator] inference error:', e);
    }
  }, [predict]);

  // ─── Called (on the JS thread) with each landmarker result ─────────
  // Hand appears -> start recording. Hand gone for END_GAP_MS -> classify the recording.
  const handleHands = useCallback(
    (hands: number[][] | null) => {
      if (!isDetectingRef.current || !modelRef.current) return;

      const now = Date.now();
      const prevSample = lastSampleRef.current;
      if (now - prevSample < SAMPLE_INTERVAL_MS) return;
      lastSampleRef.current = now;
      const dt = prevSample ? now - prevSample : 0;

      // No hands
      if (!hands || hands.length === 0) {
        prevFrameRef.current = null;
        prevWristRef.current = null;
        preRollRef.current = [];
        if (recordRef.current.length > 0) {
          // Mid-sign dropouts are normal; only finish after a real gap.
          if (now - lastHandMsRef.current >= END_GAP_MS) finalizeRecording();
        } else {
          // Hand left the frame: ready for the next sign.
          rearmRef.current = false;
          calmRef.current = 0;
          // Keep a finished result's status ('ready' / 'unknown' / 'still') on screen.
          setStatus(prev => (prev === 'collecting' || prev === 'idle' ? 'noHand' : prev));
        }
        return;
      }
      lastHandMsRef.current = now;

      const mirror =
        mirrorOverrideRef.current ??
        (cameraPositionRef.current === 'front' ? MIRROR_FRONT_CAMERA : MIRROR_BACK_CAMERA);

      const frame = buildFrame(hands, mirror, rotRef.current);
      const wrist = [hands[0][0], hands[0][1]];

      // How far the hand moved since the previous frame (same measure as motionScore),
      // smoothed so single-frame landmark jitter doesn't count as movement.
      let step = 0;
      const pf = prevFrameRef.current;
      const pw = prevWristRef.current;
      if (pf && pw) {
        let d = 0;
        for (let k = 0; k < FEATURES; k++) d += Math.abs(frame[k] - pf[k]);
        const raw = d / FEATURES + Math.hypot(wrist[0] - pw[0], wrist[1] - pw[1]);
        smoothStepRef.current = 0.5 * smoothStepRef.current + 0.5 * raw;
        step = smoothStepRef.current;
      }
      prevFrameRef.current = frame;
      prevWristRef.current = wrist;

      const rec = recordRef.current;

      if (rec.length === 0) {
        // Idle: only start recording when the hand actually moves. A hand resting in view
        // does nothing, and the last result stays on screen.
        const pre = preRollRef.current;
        pre.push({ f: frame, w: wrist });
        if (pre.length > PRE_ROLL) pre.shift();
        if (DEBUG_GRU) {
          setDebugText(
            `hands ${hands.length} | ${orientOf(hands[0], rotRef.current)} | dt ${dt}ms | idle step ${step.toFixed(3)} (start>${MOVE_START}, still<${STILL_STEP})${rearmRef.current ? ' | WAIT: calm hand to re-arm' : ''}\n${topRef.current}${selfTestRef.current}`,
          );
        }
        // After a result, wait until the hand is calm before allowing a new sign.
        if (rearmRef.current) {
          if (step < STILL_STEP) {
            calmRef.current += 1;
            if (calmRef.current >= REARM_CALM_FRAMES) rearmRef.current = false;
          } else {
            calmRef.current = 0;
          }
          return;
        }
        if (step < MOVE_START) return;
        setDetection(null); // new sign starts: clear the last result
        for (const p of pre) {
          rec.push(p.f);
          wristRef.current.push(p.w);
        }
        preRollRef.current = [];
        stillSinceRef.current = 0;
        stillCountRef.current = 0;
      } else {
        rec.push(frame);
        wristRef.current.push(wrist);
        // Pause = sign finished.
        if (step < STILL_STEP) {
          if (stillSinceRef.current === 0) stillSinceRef.current = now;
          stillCountRef.current += 1;
          if (now - stillSinceRef.current >= STILL_END_MS) {
            finalizeRecording();
            return;
          }
        } else {
          stillSinceRef.current = 0;
          stillCountRef.current = 0;
        }
      }

      setProgress(Math.min(rec.length, MAX_RECORD_FRAMES));
      setStatus('collecting');

      if (DEBUG_GRU) {
        setDebugText(
          `hands ${hands.length} | ${orientOf(hands[0], rotRef.current)} | dt ${dt}ms | rec ${rec.length} step ${step.toFixed(3)} still ${stillCountRef.current}\n${topRef.current}${selfTestRef.current}`,
        );
      }

      if (rec.length >= MAX_RECORD_FRAMES) finalizeRecording();
    },
    [finalizeRecording],
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
  }, [backDevice, frontDevice, resetRecording]);

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
    lastHandMsRef.current = 0;
    setDetection(null);
    setStatus(next ? 'still' : 'idle'); // 'still' = "Waiting for a sign…"
    setIsDetecting(next);
    if (!next) Speech.stop();
  }, [detectingSV, resetRecording]);

  // ─── Mirror toggle (for finding out how the model was trained) ─────
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
    seqLen: MAX_RECORD_FRAMES, // progress bar fills toward the recording cap (model input is still SEQ_LEN)
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