/**
 * useSignTranslator.ts
 *
 * Custom hook managing camera permissions, TFLite model loading,
 * image preprocessing, and the real-time inference loop.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import RNFS from 'react-native-fs';
import { Images } from 'react-native-nitro-image';
import Speech from '@mhpdev/react-native-speech';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Class labels & Constants ────────────────────────────────────────────────
export const SIGN_LABELS: string[] = [
  'A', 'B', 'C', 'D', 'E', 'Eight', 'F', 'Family', 'Fine', 'Five',
  'Four', 'G', 'H', 'Help', 'Home', 'Hungry', 'I', 'I_hate_you', 'I_love_you', 'K',
  'L', 'M', 'N', 'Nine', 'No', 'O', 'Okay', 'One', 'P', 'Pray',
  'Q', 'R', 'S', 'Seven', 'Six', 'Sorry', 'T', 'Three', 'Time', 'Two',
  'U', 'V', 'W', 'X', 'Y', 'Zero', 'J', 'Z',
  'LALAMUNAN', 'MAHIRAP', 'MASAKIT', 'NAGSUSUKA', 'NAGTATAE', 'NAHIHILO', 'NAIIHI', 'NAMAMANAS', 'NANGHIHINA', 'TUMUTUSOK'
];

const NUM_CLASSES     = 58;
const NUM_PREDICTIONS = 8400;
const CONF_THRESHOLD  = 0.40;
const THROTTLE_MS     = 400;
const CONFIRM_FRAMES  = 1;
const INPUT_SIZE      = 640;
const MEDICAL_TERMS_START_INDEX = 48;

interface SignDetection { label: string; confidence: number; }

const FRONT_CAM_ROTATION_OVERRIDE: 0 | 90 | 180 | 270 | null = null;
const ROTATION_MAP: Record<string, 0 | 90 | 180 | 270> = {
  'portrait': 0,
  'landscape-left': 90,
  'landscape-right': 270,
  'portrait-upside-down': 180,
};
const EXIF_ROTATION_MAP: Record<number, 0 | 90 | 180 | 270> = { 1: 0, 3: 180, 6: 90, 8: 270 };
const MIRROR_FRONT_CAMERA = true;
const ASSUMED_LANDSCAPE_DIRECTION: 90 | 270 = 90;

// ─── Helper Functions ────────────────────────────────────────────────────────
function getRotationDeg(
  orientation: string | undefined,
  exifOrientation: number | undefined,
  srcW: number,
  srcH: number,
): 0 | 90 | 180 | 270 {
  if (FRONT_CAM_ROTATION_OVERRIDE !== null) return FRONT_CAM_ROTATION_OVERRIDE;

  let claimed: 0 | 90 | 180 | 270 | null = null;
  let source = 'none';

  if (orientation && orientation in ROTATION_MAP) {
    claimed = ROTATION_MAP[orientation];
    source = 'photo.orientation';
  } else if (exifOrientation !== undefined && exifOrientation in EXIF_ROTATION_MAP) {
    claimed = EXIF_ROTATION_MAP[exifOrientation];
    source = 'EXIF';
  }

  const bufferIsLandscape = srcW > srcH;
  const claimedNoSwap = claimed === 0 || claimed === 180 || claimed === null;
  const dimensionsDisagreeWithClaim = bufferIsLandscape === claimedNoSwap;

  if (dimensionsDisagreeWithClaim) {
    return bufferIsLandscape ? ASSUMED_LANDSCAPE_DIRECTION : (claimed ?? 0);
  }
  return claimed ?? (bufferIsLandscape ? ASSUMED_LANDSCAPE_DIRECTION : 0);
}

function resizeToFloat32(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  channels: 3 | 4,
  rotationDeg: 0 | 90 | 180 | 270 = 0,
  mirror: boolean = false,
): Float32Array {
  const logW = (rotationDeg === 90 || rotationDeg === 270) ? srcH : srcW;
  const logH = (rotationDeg === 90 || rotationDeg === 270) ? srcW : srcH;
  const cropSize = Math.min(logW, logH);
  const cropX0 = Math.floor((logW - cropSize) / 2);
  const cropY0 = Math.floor((logH - cropSize) / 2);
  const scale = cropSize / INPUT_SIZE;
  const out = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);

  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      let lx = Math.min(Math.floor(x * scale) + cropX0, logW - 1);
      const ly = Math.min(Math.floor(y * scale) + cropY0, logH - 1);

      if (mirror) lx = logW - 1 - lx;

      let px: number, py: number;
      if (rotationDeg === 90) {
        px = srcW - 1 - ly; py = lx;
      } else if (rotationDeg === 270) {
        px = ly; py = srcH - 1 - lx;
      } else if (rotationDeg === 180) {
        px = srcW - 1 - lx; py = srcH - 1 - ly;
      } else {
        px = lx; py = ly;
      }

      const srcIdx = (py * srcW + px) * channels;
      const dstIdx = (y * INPUT_SIZE + x) * 3;
      out[dstIdx]     = pixels[srcIdx]     / 255;
      out[dstIdx + 1] = pixels[srcIdx + 1] / 255;
      out[dstIdx + 2] = pixels[srcIdx + 2] / 255;
    }
  }
  return out;
}

function findBestDetection(output: Float32Array): { classIdx: number; score: number } | null {
  let bestScore = CONF_THRESHOLD;
  let bestClass = -1;

  for (let j = 0; j < NUM_PREDICTIONS; j++) {
    let maxScore = 0;
    let maxClass = -1;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const score = output[(c + 4) * NUM_PREDICTIONS + j];
      if (score > maxScore) { maxScore = score; maxClass = c; }
    }
    if (maxScore > bestScore) { bestScore = maxScore; bestClass = maxClass; }
  }
  return bestClass >= 0 ? { classIdx: bestClass, score: bestScore } : null;
}

// Ai Voice
function toSpeechText(label: string): string {
  // "I_love_you" -> "I love you", "I_hate_you" -> "I hate you"
  return label.replace(/_/g, ' ');
}
function isMedicalLabel(label: string): boolean {
  return SIGN_LABELS.indexOf(label) >= MEDICAL_TERMS_START_INDEX;
}

// ─── Hook Implementation ─────────────────────────────────────────────────────
export function useSignTranslator() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const [isDetecting, setIsDetecting] = useState(false);
  const [detection, setDetection] = useState<SignDetection | null>(null);

  const cameraRef = useRef<Camera>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const historyRef = useRef<number[]>([]);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;

  const model = useTensorflowModel(require('../assets/besta_float16.tflite'), []);
  const isModelReady = model.state === 'loaded';

  const lastSpokenLabelRef = useRef<string | null>(null);
  const supportsFilipinoRef = useRef<boolean>(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);

  // Detect once whether the device actually has a Filipino voice installed.
// Falls back to English pronunciation for medical terms if not — better
// than silently failing or crashing on speak().
useEffect(() => {
  Speech.getAvailableVoices('fil')
    .then(voices => { supportsFilipinoRef.current = voices.length > 0; })
    .catch(() => { supportsFilipinoRef.current = false; });
}, []);

useEffect(() => {
  Speech.configure({
    rate: 0.85,
    pitch: 1.0,
    ducking: true, // lowers other app audio while speaking
  });
  return () => { Speech.stop(); };
}, []);

// Speak exactly once per newly confirmed sign
useEffect(() => {
  if (!isVoiceEnabled) return;

  if (!detection) {
    lastSpokenLabelRef.current = null;
    return;
  }
  if (detection.label === lastSpokenLabelRef.current) return;
  lastSpokenLabelRef.current = detection.label;

  const language = isMedicalLabel(detection.label) && supportsFilipinoRef.current
    ? 'fil-PH'
    : 'en-US';

  Speech.stop()
    .catch(() => {})
    .finally(() => {
      Speech.speak(toSpeechText(detection.label), { language }).catch(e =>
        console.warn('[SignTranslator] speech error:', e)
      );
    });
}, [detection, isVoiceEnabled]);

const toggleVoice = useCallback(() => {
  setIsVoiceEnabled(prev => {
    if (prev) Speech.stop();
    return !prev;
  });
}, []);

  useEffect(() => {
    console.log('[SignTranslator] model state:', model.state, (model as any).error ?? '');
  }, [model.state]);

  // Card animation
  useEffect(() => {
    if (detection) {
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.quad),
        }),
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, bounciness: 6 }),
      ]).start();
    } else {
      Animated.timing(cardOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      cardScale.setValue(0.85);
    }
  }, [detection, cardOpacity, cardScale]);

  // Inference Step
  const runOnce = useCallback(async () => {
    if (busyRef.current || !cameraRef.current || !model.model) return;
    busyRef.current = true;

    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const filePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;

      const rawOrientation = (photo as any).orientation;
      const exifOrientation = (photo as any).metadata?.Orientation ?? (photo as any).metadata?.orientation;

      const image = await Images.loadFromFileAsync(filePath);
      const rawPixelData = await image.toRawPixelData();
      const srcW = image.width;
      const srcH = image.height;
      await RNFS.unlink(photo.path).catch(e => console.warn('[SignTranslator] unlink failed:', e));

      const srcPixels = new Uint8Array(rawPixelData.buffer);
      const inferredChannels = Math.round(srcPixels.length / (srcW * srcH)) as 3 | 4;

      const rotationDeg = getRotationDeg(rawOrientation, exifOrientation, srcW, srcH);
      const float32Input = resizeToFloat32(srcPixels, srcW, srcH, inferredChannels, rotationDeg, MIRROR_FRONT_CAMERA);

      if (!model.model) return;
      const outputs = model.model.runSync([float32Input.buffer as ArrayBuffer]);
      const output = new Float32Array(outputs[0]);

      const result = findBestDetection(output);
      const history = historyRef.current;

      if (result) {
        history.push(result.classIdx);
        if (history.length > CONFIRM_FRAMES) history.shift();

        const allSame = history.length === CONFIRM_FRAMES && history.every(c => c === history[0]);
        if (allSame) {
          setDetection({
            label: SIGN_LABELS[result.classIdx] ?? `Class_${result.classIdx}`,
            confidence: result.score,
          });
        }
      } else {
        historyRef.current = [];
        setDetection(null);
      }
    } catch (e) {
      console.warn('[SignTranslator] inference error:', e);
    } finally {
      busyRef.current = false;
    }
  }, [model.model]);

  // Inference loop control
  useEffect(() => {
    if (!isDetecting || !isModelReady) return;

    const tick = () => {
      runOnce();
      loopRef.current = setTimeout(tick, THROTTLE_MS);
    };
    loopRef.current = setTimeout(tick, 0);

    return () => {
      if (loopRef.current) clearTimeout(loopRef.current);
    };
  }, [isDetecting, isModelReady, runOnce]);

  // Permissions Check
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // UI Handlers
  const toggleDetection = useCallback(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setIsDetecting(prev => {
    if (prev) {
      setDetection(null);
      Speech.stop();
    }
    return !prev;
  });
}, []);
  return {
    hasPermission,
    requestPermission,
    device,
    isDetecting,
    detection,
    isModelReady,
    modelState: model.state,
    cameraRef,
    cardOpacity,
    cardScale,
    toggleDetection,
     isVoiceEnabled,   // add
  toggleVoice,   
  };
}