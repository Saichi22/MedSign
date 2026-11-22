// hooks/useMotionSignDetector.ts
// Sign detection with the FSL16 TCN (spec v2.0, "FSL16 TCN - Android Integration Specification").
//
//   camera frame (upright, NOT mirrored)
//     -> native plugin `detectLandmarks`: MediaPipe Pose + Hand landmarks of the same frame
//     -> resultsToFrame: [59 x 3] array (pose 0-16, signer-LEFT hand, signer-RIGHT hand), NaN = missing
//     -> SignSegmenter: starts when a hand rises, ends ~0.45 s after the hands drop
//     -> preprocess: fill gaps, trim, resample to 40 frames, 272 body-relative features
//     -> fsl16_tcn_model.tflite  [1,40,272] -> [1,N] softmax
//     -> decision rule: p1 >= 0.55 and (p1 - p2) >= 0.15, otherwise UNSURE; OTHER is never shown
//
// All the maths lives in utils/fslPreprocess.ts (pure TS, verified against fsl16_test_vectors.json).
// The model contains its own standardisation layer: features go in raw.
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
import { useAslSoundEnabled } from '../utils/audioSettings';
import {
  decide,
  FEATURE_DIM,
  L_OFF,
  LandmarkResult,
  preprocess,
  R_OFF,
  resultsToFrame,
  SignSegmenter,
  T_FRAMES,
} from '../utils/fslPreprocess';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Assets (android/app/src/main/assets) ────────────────────────────────────
const MODEL_ASSET = 'fsl16_tcn_model.tflite';
const LABELS_ASSET = 'FSL16_labels.txt'; // output index order; load it, never hard-code (spec 3)

// Fallback ONLY if the labels asset can't be read. Must match FSL16_labels.txt.
const FALLBACK_LABELS = [
  'GOOD MORNING', 'GOOD AFTERNOON', 'GOOD EVENING', 'HOW ARE YOU',
  'THANK YOU', 'KNOW', 'SUNDAY', 'YES',
  'TOMORROW', 'YESTERDAY', 'FATHER', 'MOTHER',
  'NICE TO MEET YOU', 'SEE YOU TOMORROW', "DON'T KNOW", 'CORRECT',
];

// Kept so any screen that still imports FSL16_LABELS keeps compiling (now the v2.0 list).
export const FSL16_LABELS: string[] = FALLBACK_LABELS;

// ─── Constants ───────────────────────────────────────────────────────────────
// Spec: 15-30 fps works because every segment is resampled to 40 frames.
const PROCESS_FPS = 20; // only the quick bitmap copy runs per call; the plugin skips frames while it is busy
const DEBUG_TCN = true; // logs top-3 for every sign and shows a debug line on screen

// Rotation (degrees clockwise) applied to the camera frame before MediaPipe so it is UPRIGHT.
// 'auto' = use the camera's own orientation. Cycle it on screen if the debug line says the
// body is not UPRIGHT. Never mirror the analysis image (spec 4.2).
export type RotationSetting = 'auto' | 0 | 90 | 180 | 270;
const ROTATION_CYCLE: RotationSetting[] = ['auto', 0, 90, 180, 270];

export type CameraPosition = 'front' | 'back';
// idle = not started | waiting = started, no sign yet | recording = hands are up
// unsure = last sign was below the confidence/margin rule | ready = a sign was recognised
export type MotionStatus = 'idle' | 'waiting' | 'recording' | 'unsure' | 'ready';
export type SignDetection = { label: string; confidence: number };

// Native plugin (PoseHandLandmarkerPlugin.kt). Null if it isn't registered in this build.
const landmarkPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectLandmarks', {});
export const HAND_PLUGIN_AVAILABLE = landmarkPlugin != null;

function toSpeechText(label: string): string {
  return label.toLowerCase();
}

async function loadLabels(): Promise<string[]> {
  try {
    const txt = await RNFS.readFileAssets(LABELS_ASSET, 'utf8');
    const labels = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (labels.length > 0) return labels;
  } catch (e) {
    console.warn('[MotionTranslator] could not read labels asset, using fallback:', e);
  }
  return FALLBACK_LABELS;
}

// Debug helper (spec 4.2): is the signer upright?  nose must be above the shoulder line.
// Returns U (upright) / S (sideways) / D (upside-down) / '-' (no pose) for ONE frame.
function orientationCode(res: LandmarkResult): 'U' | 'S' | 'D' | '-' {
  const p = res.pose;
  if (!p || p.length < 34) return '-';
  const noseY = p[1];
  const shY = (p[11 * 2 + 1] + p[12 * 2 + 1]) / 2;
  const dx = Math.abs(p[11 * 2] - p[12 * 2]);
  const dy = Math.abs(p[11 * 2 + 1] - p[12 * 2 + 1]);
  if (dy > dx) return 'S';
  return noseY < shY ? 'U' : 'D';
}

const ORIENT_WINDOW = 20; // frames used for the on-screen majority vote
// AUTO rotation: starts here, then steps through 0/90/180/270 until the pose reads UPRIGHT.
const AUTO_START_ROTATION = 270;
const AUTO_MIN_POSE_FRAMES = 15; // pose frames needed before judging a rotation
const AUTO_LOCK_FRACTION = 0.75; // this share of UPRIGHT frames locks the rotation
function orientationSummary(hist: string[]): string {
  const n = (c: string) => hist.filter(h => h === c).length;
  const U = n('U'), S = n('S'), D = n('D');
  const best = Math.max(U, S, D);
  if (best === 0) return 'no pose';
  const word = best === U ? 'UPRIGHT' : best === S ? 'SIDEWAYS' : 'UPSIDE-DOWN';
  return `${word} (U${U} S${S} D${D} of ${hist.length})`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useMotionSignTranslator() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');

  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('front');
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
  const [recordingMs, setRecordingMs] = useState(0);
  const [topGuesses, setTopGuesses] = useState<{ label: string; p: number }[]>([]);
  const [debugText, setDebugText] = useState('');

  const statusRef = useRef<MotionStatus>('idle');
  const setStatus = useCallback((s: MotionStatus) => {
    if (statusRef.current !== s) {
      statusRef.current = s;
      setStatusState(s);
    }
  }, []);

  const isDetectingRef = useRef(false);
  const detectingSV = useSharedValue(false); // read inside the frame processor worklet
  const rotationSV = useSharedValue(AUTO_START_ROTATION); // always an explicit 0/90/180/270
  const segmenterRef = useRef(new SignSegmenter());
  const lastUiMsRef = useRef(0);
  const lastDebugMsRef = useRef(0);
  const lastTopRef = useRef('');
  const orientHistRef = useRef<string[]>([]);

  const [rotation, setRotation] = useState<RotationSetting>('auto');
  const rotationRef = useRef<RotationSetting>('auto');
  const autoRotRef = useRef<number>(AUTO_START_ROTATION); // rotation AUTO is currently trying
  const autoLockedRef = useRef(false);
  const [autoRot, setAutoRot] = useState<number>(AUTO_START_ROTATION);
  const [autoLocked, setAutoLocked] = useState(false);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;

  // ─── Model + labels ────────────────────────────────────────────────
  const [model, setModel] = useState<TensorflowModel | null>(null);
  const modelRef = useRef<TensorflowModel | null>(null);
  const labelsRef = useRef<string[]>(FALLBACK_LABELS);
  const [modelState, setModelState] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setModelState('loading');
        const labels = await loadLabels();

        const localPath = `${RNFS.CachesDirectoryPath}/${MODEL_ASSET}`;
        // Always re-copy so an updated model in the APK is never shadowed by a stale cache
        if (await RNFS.exists(localPath)) await RNFS.unlink(localPath);
        await RNFS.copyFileAssets(MODEL_ASSET, localPath);

        const loaded = await loadTensorflowModel({ url: `file://${localPath}` }, []);
        if (cancelled) return;

        // Spec 9.2: input [1,40,272] Float32, output [1,N] Float32, N == number of labels.
        const inShape = loaded.inputs?.[0]?.shape;
        const outShape = loaded.outputs?.[0]?.shape;
        if (inShape && (inShape[1] !== T_FRAMES || inShape[2] !== FEATURE_DIM)) {
          throw new Error(`unexpected model input shape ${JSON.stringify(inShape)}`);
        }
        if (outShape && outShape[outShape.length - 1] !== labels.length) {
          throw new Error(`model has ${outShape[outShape.length - 1]} outputs but ${labels.length} labels`);
        }

        labelsRef.current = labels;
        modelRef.current = loaded;
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

  // ─── Classify one finished sign ────────────────────────────────────
  const classify = useCallback(
    (frames: Float32Array[]) => {
      const m = modelRef.current;
      if (!m) return;
      try {
        const feats = preprocess(frames); // Float32Array(40 * 272)
        const outputs = m.runSync([feats.buffer as ArrayBuffer]);
        const probs = new Float32Array(outputs[0]);
        const result = decide(probs, labelsRef.current);

        if (DEBUG_TCN) {
          const ranked = Array.from(probs).map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p).slice(0, 3);
          lastTopRef.current =
            'top: ' + ranked.map(r => `${labelsRef.current[r.i]} ${Math.round(r.p * 100)}`).join(' | ');
          console.log('[TCN]', lastTopRef.current, '| frames', frames.length);
        }

        if (result.kind === 'sign') {
          setDetection({ label: result.label, confidence: result.confidence });
          setTopGuesses([]);
          setStatus('ready');
        } else if (result.kind === 'other') {
          // movement that is not a sign: show nothing (spec 7)
          setDetection(null);
          setTopGuesses([]);
          setStatus('waiting');
        } else {
          setDetection(null);
          setTopGuesses(result.top);
          setStatus('unsure');
        }
      } catch (e) {
        console.warn('[MotionTranslator] inference error:', e);
        setStatus('waiting');
      }
    },
    [setStatus],
  );

  // ─── Called (JS thread) with each landmark result ──────────────────
  const handleLandmarks = useCallback(
    (res: LandmarkResult | null) => {
      if (!isDetectingRef.current || !modelRef.current || !res) return;

      const seg = segmenterRef.current;
      const frame = resultsToFrame(res);
      const oh = orientHistRef.current;
      oh.push(orientationCode(res));
      if (oh.length > ORIENT_WINDOW) oh.shift();

      // ── AUTO rotation: find the rotation at which the pose reads UPRIGHT, then lock it.
      // Until then frames are NOT fed to the segmenter (a wrong rotation gives garbage geometry).
      if (rotationRef.current === 'auto' && !autoLockedRef.current) {
        const valid = oh.filter(c => c !== '-');
        if (valid.length >= AUTO_MIN_POSE_FRAMES) {
          const cnt = (c: string) => valid.filter(x => x === c).length;
          const U = cnt('U'), S = cnt('S'), D = cnt('D');
          if (U / valid.length >= AUTO_LOCK_FRACTION) {
            autoLockedRef.current = true;
            setAutoLocked(true);
          } else {
            // upside-down -> half a turn; sideways -> quarter turn
            const next = (autoRotRef.current + (D > S ? 180 : 90)) % 360;
            autoRotRef.current = next;
            rotationSV.value = next;
            setAutoRot(next);
          }
          oh.length = 0;
        }
        setDebugText(
          `calibrating rotation… trying ${autoRotRef.current} | ${orientationSummary(oh)}\n` +
            'sit so head + both shoulders are in view',
        );
        return;
      }
      const ts = res.ts > 0 ? res.ts : Date.now();
      const ev = seg.push(frame, ts);

      if (ev.type === 'started') {
        // a new sign starting does NOT clear the last result; it stays until replaced
        setStatus('recording');
      } else if (ev.type === 'segment') {
        setRecordingMs(0);
        classify(ev.frames);
      } else if (ev.type === 'discarded') {
        setRecordingMs(0);
        setStatus('waiting');
      }

      if (seg.state === 'recording') {
        // throttle UI updates to ~5 per second
        const now = Date.now();
        if (now - lastUiMsRef.current > 200) {
          lastUiMsRef.current = now;
          setRecordingMs(Math.min(seg.recordingMs, seg.maxMs));
        }
      }

      if (DEBUG_TCN) {
        const now = Date.now();
        if (now - lastDebugMsRef.current > 600 || ev.type !== 'none') {
          lastDebugMsRef.current = now;
          const hasL = !Number.isNaN(frame[L_OFF * 3]);
          const hasR = !Number.isNaN(frame[R_OFF * 3]);
          let sideCheck = '';
          if (hasL !== hasR) {
            // spec 4.2: a raised RIGHT hand must appear on the image LEFT and land in the RIGHT slot
            const x = (hasR ? frame[R_OFF * 3] : frame[L_OFF * 3]) / (res.w / res.h);
            sideCheck = ` | ${hasR ? 'R' : 'L'} hand on image-${x < 0.5 ? 'left' : 'right'}`;
          }
          setDebugText(
            `${orientationSummary(orientHistRef.current)} | hands L${hasL ? '✓' : '-'} R${hasR ? '✓' : '-'}${sideCheck}` +
              `\nfps ${seg.fps.toFixed(0)} | ${seg.state} ${seg.segmentLength}f | ${res.w}x${res.h}` +
              `\n${lastTopRef.current}`,
          );
        }
      }
    },
    [classify, setStatus, rotationSV],
  );

  const handleLandmarksJS = useMemo(() => Worklets.createRunOnJS(handleLandmarks), [handleLandmarks]);

  // ─── Frame processor (worklet thread) ──────────────────────────────
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (!detectingSV.value || landmarkPlugin == null) return;
      runAtTargetFps(PROCESS_FPS, () => {
        'worklet';
        const res = landmarkPlugin.call(frame, { rotation: rotationSV.value }) as unknown as LandmarkResult | null;
        if (res) handleLandmarksJS(res);
      });
    },
    [handleLandmarksJS, detectingSV, rotationSV],
  );

  // Clears the sign in progress (start/stop, camera switch, rotation change).
  const resetCapture = useCallback(() => {
    segmenterRef.current.reset();
    orientHistRef.current = [];
    setRecordingMs(0);
    setTopGuesses([]);
  }, []);

  // ─── Camera switching ──────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!backDevice || !frontDevice) return;
    resetCapture();
    if (rotationRef.current === 'auto') { autoLockedRef.current = false; setAutoLocked(false); }
    setDetection(null);
    setStatus(isDetectingRef.current ? 'waiting' : 'idle');
    setCameraPosition(prev => (prev === 'front' ? 'back' : 'front'));
  }, [backDevice, frontDevice, resetCapture, setStatus]);

  // ─── Voice ─────────────────────────────────────────────────────────
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [aslSound] = useAslSoundEnabled(); // Settings > ASL Audio Output
  const lastSpokenRef = useRef<SignDetection | null>(null);

  useEffect(() => {
    Speech.configure({ rate: 0.85, pitch: 1.0, ducking: true });
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (!isVoiceEnabled || !aslSound) return;
    if (!detection) {
      lastSpokenRef.current = null;
      return;
    }
    // Speak every NEW result (even the same word twice in a row), but not the same result again.
    if (detection === lastSpokenRef.current) return;
    lastSpokenRef.current = detection;

    Speech.stop()
      .catch(() => {})
      .finally(() => {
        Speech.speak(toSpeechText(detection.label), { language: 'en-US' }).catch(e =>
          console.warn('[MotionTranslator] speech error:', e),
        );
      });
  }, [detection, isVoiceEnabled, aslSound]);

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

    resetCapture();
    setDetection(null);
    setStatus(next ? 'waiting' : 'idle');
    setIsDetecting(next);
    if (!next) Speech.stop();
  }, [detectingSV, resetCapture, setStatus]);

  // ─── Rotation (debug aid; 'auto' should normally be right) ─────────
  const toggleRotation = useCallback(() => {
    const next = ROTATION_CYCLE[(ROTATION_CYCLE.indexOf(rotation) + 1) % ROTATION_CYCLE.length];
    rotationRef.current = next;
    if (next === 'auto') {
      autoLockedRef.current = false;
      autoRotRef.current = AUTO_START_ROTATION;
      rotationSV.value = AUTO_START_ROTATION;
      setAutoLocked(false);
      setAutoRot(AUTO_START_ROTATION);
    } else {
      rotationSV.value = next;
    }
    setRotation(next);
    resetCapture();
    setDetection(null);
  }, [rotation, rotationSV, resetCapture]);

  return {
    rotation,
    autoRot,
    autoLocked,
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
    topGuesses,
    status,
    recordingMs,
    maxRecordingMs: segmenterRef.current.maxMs,
    isModelReady,
    modelState,
    pluginAvailable: HAND_PLUGIN_AVAILABLE,
    frameProcessor,
    cameraRef,
    cardOpacity,
    cardScale,
    toggleDetection,
    isVoiceEnabled: isVoiceEnabled && aslSound, // header icon shows muted when Settings has audio off
    toggleVoice,
  };
}