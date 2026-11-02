// hooks/useMotionSignDetector.ts
// Motion-based sign detection: MediaPipe hand landmarks (native frame processor plugin)
// -> wrist-relative normalization -> 30-frame rolling buffer -> FSL16 GRU (.tflite).
// Spec: [1, 30, 126] float32 in, [1, 16] float32 softmax out.
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

// ─── Constants (from the integration spec) ───────────────────────────────────
const MODEL_ASSET = 'fsl16_gru_model.tflite';
const SEQ_LEN = 30;
const LANDMARKS = 21;
const HAND_FEATURES = LANDMARKS * 3; // 63
const FEATURES = HAND_FEATURES * 2; // 126
const SAMPLE_INTERVAL_MS = 100;
const CONF_THRESHOLD = 0.7; // starting value from the spec, tune with real testing
const CLEAR_AFTER_MISSES = 8; // ~1s of no hands wipes the buffer
const PROCESS_FPS = 7.5;    

// The Python prototype probably used a mirrored (selfie) webcam. If front-camera
// predictions look flipped/poor, toggle this first.
const MIRROR_FRONT_CAMERA = false;
const MIRROR_BACK_CAMERA = false;

export type CameraPosition = 'front' | 'back';
export type MotionStatus = 'idle' | 'noHand' | 'collecting' | 'unknown' | 'ready';
export type SignDetection = { label: string; confidence: number };

// Native plugin (HandLandmarkerPlugin.kt). Null if it isn't registered in this build.
const handsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {});
export const HAND_PLUGIN_AVAILABLE = handsPlugin != null;

const X_SCALE = 0.75;
const Y_SCALE = 1.333;

// ─── Preprocessing ───────────────────────────────────────────────────────────
// hands: up to 2 arrays of 63 raw floats, in MediaPipe detection order.
// Each hand is made wrist-relative on its own; a missing 2nd hand stays zeros.
function buildFrame(hands: number[][], mirror: boolean): Float32Array {
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
      const dx = (lm[i * 3] - wx) * X_SCALE;
      frame[base + i * 3] = mirror ? -dx : dx;
      frame[base + i * 3 + 1] = (lm[i * 3 + 1] - wy) * Y_SCALE;
      frame[base + i * 3 + 2] = (lm[i * 3 + 2] - wz) * X_SCALE;
    }
  }
  return frame;
}

function toSpeechText(label: string): string {
  return label.toLowerCase();
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
  const [progress, setProgress] = useState(0); // frames in buffer, 0..30

  const isDetectingRef = useRef(false);
  const detectingSV = useSharedValue(false); // read inside the frame processor worklet
  const bufferRef = useRef<Float32Array[]>([]);
  const lastSampleRef = useRef(0);
  const missRef = useRef(0);

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

  // ─── Inference on a full 30-frame window ───────────────────────────
  const predict = useCallback((): SignDetection | null => {
    const m = modelRef.current;
    const buf = bufferRef.current;
    if (!m || buf.length < SEQ_LEN) return null;

    const input = new Float32Array(SEQ_LEN * FEATURES);
    for (let t = 0; t < SEQ_LEN; t++) input.set(buf[t], t * FEATURES);

    const outputs = m.runSync([input.buffer as ArrayBuffer]);
    const scores = new Float32Array(outputs[0]);
    const top = Array.from(scores)
      .map((s, i) => ({ l: FSL16_LABELS[i], s: Math.round(s * 100) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    console.log('[GRU]', JSON.stringify(top), 'hands/frames', buf.length);


    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    return { label: FSL16_LABELS[best] ?? `Class_${best}`, confidence: scores[best] };
    
  }, []);

  // ─── Called (on the JS thread) with each landmarker result ─────────
  const handleHands = useCallback(
    (hands: number[][] | null) => {
      if (!isDetectingRef.current || !modelRef.current) return;

      const now = Date.now();
      if (now - lastSampleRef.current < SAMPLE_INTERVAL_MS) return;
      lastSampleRef.current = now;

      // No hands: don't push zeros, don't classify.
      if (!hands || hands.length === 0) {
        missRef.current += 1;
        setStatus('noHand');
        if (missRef.current >= CLEAR_AFTER_MISSES && bufferRef.current.length > 0) {
          bufferRef.current = [];
          setProgress(0);
          setDetection(null);
        }
        return;
      }
      missRef.current = 0;

      const mirror =
        cameraPositionRef.current === 'front' ? MIRROR_FRONT_CAMERA : MIRROR_BACK_CAMERA;
      const buf = bufferRef.current;
      buf.push(buildFrame(hands, mirror));
      if (buf.length > SEQ_LEN) buf.shift();
      setProgress(buf.length);

      if (buf.length < SEQ_LEN) {
        setStatus('collecting');
        return;
      }

      try {
        const result = predict();
        if (result && result.confidence >= CONF_THRESHOLD) {
          setDetection(result);
          setStatus('ready');
        } else {
          setDetection(null);
          setStatus('unknown');
        }
      } catch (e) {
        console.warn('[MotionTranslator] inference error:', e);
      }
    },
    [predict],
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
    bufferRef.current = [];
    missRef.current = 0;
    setProgress(0);
    setDetection(null);
    setStatus(isDetectingRef.current ? 'collecting' : 'idle');
    setCameraPosition(prev => (prev === 'front' ? 'back' : 'front'));
  }, [backDevice, frontDevice]);

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

    bufferRef.current = [];
    missRef.current = 0;
    lastSampleRef.current = 0;
    setProgress(0);
    setDetection(null);
    setStatus(next ? 'collecting' : 'idle');
    setIsDetecting(next);
    if (!next) Speech.stop();
  }, [detectingSV]);

  return {
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
