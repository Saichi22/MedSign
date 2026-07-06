/**
 * useSignTranslator.ts
 *
 * Custom hook managing camera permissions, TFLite model loading,
 * image preprocessing, and the real-time inference loop.
 *
 * Perf notes vs the previous version (both hot paths run every
 * THROTTLE_MS on the JS thread, so they matter a lot):
 *
 * - `findBestDetection` swapped its loop order. The original iterated
 *   predictions outer / classes inner, so each inner read jumped
 *   NUM_PREDICTIONS (8400) floats in memory — a cache miss on nearly
 *   every access. Classes-outer / predictions-inner makes inner reads
 *   sequential and also removes 8400x redundant offset multiplications
 *   (the per-class offset is now computed once, not once per (c, j)).
 *
 * - `resizeToFloat32` no longer recomputes the rotation/mirror
 *   transform for all 640*640 output pixels. px/py each depend on only
 *   one of the two output axes (true for every rotation case), so the
 *   transform is now precomputed into two 640-length lookup tables and
 *   the hot loop is just array reads + a divide-by-255 copy.
 *
 * - Both functions reuse a module-level output buffer instead of
 *   allocating a multi-MB Float32Array on every single frame. Safe
 *   because `model.model.runSync` is synchronous — by the time the
 *   next frame's resize/detect call happens, the previous buffer
 *   contents have already been consumed.
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

// Exported so consumers (e.g. the screen component) don't have to
// duplicate this constant and re-derive their own "is this a medical
// sign" check — a second copy of this index is a drift risk.
export const MEDICAL_TERMS_START_INDEX = 48;

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

  if (orientation && orientation in ROTATION_MAP) {
    claimed = ROTATION_MAP[orientation];
  } else if (exifOrientation !== undefined && exifOrientation in EXIF_ROTATION_MAP) {
    claimed = EXIF_ROTATION_MAP[exifOrientation];
  }

  const bufferIsLandscape = srcW > srcH;
  const claimedNoSwap = claimed === 0 || claimed === 180 || claimed === null;
  const dimensionsDisagreeWithClaim = bufferIsLandscape === claimedNoSwap;

  if (dimensionsDisagreeWithClaim) {
    return bufferIsLandscape ? ASSUMED_LANDSCAPE_DIRECTION : (claimed ?? 0);
  }
  return claimed ?? (bufferIsLandscape ? ASSUMED_LANDSCAPE_DIRECTION : 0);
}

// Reused across calls to avoid allocating a ~4.9MB Float32Array
// (INPUT_SIZE * INPUT_SIZE * 3) every ~400ms. Safe because the buffer's
// contents are fully consumed synchronously by model.runSync() before
// the next frame's resize call can happen.
let resizeOutputBuffer: Float32Array | null = null;

function resizeToFloat32(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  channels: 3 | 4,
  rotationDeg: 0 | 90 | 180 | 270 = 0,
  mirror: boolean = false,
): Float32Array {
  const swapped = rotationDeg === 90 || rotationDeg === 270;
  const logW = swapped ? srcH : srcW;
  const logH = swapped ? srcW : srcH;
  const cropSize = Math.min(logW, logH);
  const cropX0 = Math.floor((logW - cropSize) / 2);
  const cropY0 = Math.floor((logH - cropSize) / 2);
  const scale = cropSize / INPUT_SIZE;

  // lx/ly: pre-rotation logical source coordinates for each output
  // column/row. Each depends only on x or only on y — never both — so
  // compute them once per column and once per row instead of redoing
  // floor/min/mirror for all 409,600 output pixels.
  const lxTable = new Int32Array(INPUT_SIZE);
  for (let x = 0; x < INPUT_SIZE; x++) {
    let lx = Math.min(Math.floor(x * scale) + cropX0, logW - 1);
    if (mirror) lx = logW - 1 - lx;
    lxTable[x] = lx;
  }
  const lyTable = new Int32Array(INPUT_SIZE);
  for (let y = 0; y < INPUT_SIZE; y++) {
    lyTable[y] = Math.min(Math.floor(y * scale) + cropY0, logH - 1);
  }

  // Fold the rotation transform into two final lookup tables so the hot
  // loop below is nothing but array reads + a divide-by-255 copy — no
  // per-pixel branching on rotationDeg.
  const pxTable = new Int32Array(INPUT_SIZE);
  const pyTable = new Int32Array(INPUT_SIZE);

  if (rotationDeg === 90) {
    // px depends on the output ROW (y), py depends on the output COLUMN (x).
    for (let y = 0; y < INPUT_SIZE; y++) pxTable[y] = srcW - 1 - lyTable[y];
    for (let x = 0; x < INPUT_SIZE; x++) pyTable[x] = lxTable[x];
  } else if (rotationDeg === 270) {
    for (let y = 0; y < INPUT_SIZE; y++) pxTable[y] = lyTable[y];
    for (let x = 0; x < INPUT_SIZE; x++) pyTable[x] = srcH - 1 - lxTable[x];
  } else if (rotationDeg === 180) {
    for (let x = 0; x < INPUT_SIZE; x++) pxTable[x] = srcW - 1 - lxTable[x];
    for (let y = 0; y < INPUT_SIZE; y++) pyTable[y] = srcH - 1 - lyTable[y];
  } else {
    for (let x = 0; x < INPUT_SIZE; x++) pxTable[x] = lxTable[x];
    for (let y = 0; y < INPUT_SIZE; y++) pyTable[y] = lyTable[y];
  }

  if (!resizeOutputBuffer) {
    resizeOutputBuffer = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  }
  const out = resizeOutputBuffer;

  if (swapped) {
    // rotationDeg 90/270: px is indexed by output row, py by output column.
    for (let y = 0; y < INPUT_SIZE; y++) {
      const px = pxTable[y];
      const rowBase = y * INPUT_SIZE;
      for (let x = 0; x < INPUT_SIZE; x++) {
        const py = pyTable[x];
        const srcIdx = (py * srcW + px) * channels;
        const dstIdx = (rowBase + x) * 3;
        out[dstIdx]     = pixels[srcIdx]     / 255;
        out[dstIdx + 1] = pixels[srcIdx + 1] / 255;
        out[dstIdx + 2] = pixels[srcIdx + 2] / 255;
      }
    }
  } else {
    // rotationDeg 0/180: px is indexed by output column, py by output row.
    for (let y = 0; y < INPUT_SIZE; y++) {
      const py = pyTable[y];
      const rowBase = y * INPUT_SIZE;
      const srcRowBase = py * srcW;
      for (let x = 0; x < INPUT_SIZE; x++) {
        const px = pxTable[x];
        const srcIdx = (srcRowBase + px) * channels;
        const dstIdx = (rowBase + x) * 3;
        out[dstIdx]     = pixels[srcIdx]     / 255;
        out[dstIdx + 1] = pixels[srcIdx + 1] / 255;
        out[dstIdx + 2] = pixels[srcIdx + 2] / 255;
      }
    }
  }

  return out;
}

// Reused across calls — same rationale as resizeOutputBuffer above.
let maxScoreBuffer: Float32Array | null = null;
let maxClassBuffer: Int8Array | null = null;

function findBestDetection(output: Float32Array): { classIdx: number; score: number } | null {
  if (!maxScoreBuffer || !maxClassBuffer) {
    maxScoreBuffer = new Float32Array(NUM_PREDICTIONS);
    maxClassBuffer = new Int8Array(NUM_PREDICTIONS);
  }
  const maxScores = maxScoreBuffer;
  const maxClasses = maxClassBuffer;
  maxScores.fill(0);
  maxClasses.fill(-1);

  // Classes outer / predictions inner: each inner-loop read is
  // sequential in memory (stride 1), and the per-class offset
  // (c + 4) * NUM_PREDICTIONS is computed once per class instead of
  // once per (class, prediction) pair — versus the original
  // predictions-outer / classes-inner order, where every inner read
  // jumped NUM_PREDICTIONS (8400) floats ahead.
  for (let c = 0; c < NUM_CLASSES; c++) {
    const classOffset = (c + 4) * NUM_PREDICTIONS;
    for (let j = 0; j < NUM_PREDICTIONS; j++) {
      const score = output[classOffset + j];
      if (score > maxScores[j]) {
        maxScores[j] = score;
        maxClasses[j] = c;
      }
    }
  }

  let bestScore = CONF_THRESHOLD;
  let bestClass = -1;
  for (let j = 0; j < NUM_PREDICTIONS; j++) {
    if (maxScores[j] > bestScore) {
      bestScore = maxScores[j];
      bestClass = maxClasses[j];
    }
  }

  return bestClass >= 0 ? { classIdx: bestClass, score: bestScore } : null;
}

// Ai Voice
function toSpeechText(label: string): string {
  // "I_love_you" -> "I love you", "I_hate_you" -> "I hate you"
  return label.replace(/_/g, ' ');
}
export function isMedicalLabel(label: string): boolean {
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
    isVoiceEnabled,
    toggleVoice,
  };
          }
