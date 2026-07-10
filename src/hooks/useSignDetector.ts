import { useState, useRef, useEffect, useCallback } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import RNFS from 'react-native-fs';
import { Images } from 'react-native-nitro-image';
import Speech from '@mhpdev/react-native-speech';
import { autocorrectSpelledWord, SpellLanguage } from '../utils/spellAutocorrect';

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

export const MEDICAL_TERMS_START_INDEX = 48;

const LETTER_PATTERN = /^[A-Z]$/;
function isLetterLabel(label: string): boolean {
  return LETTER_PATTERN.test(label);
}

const SPELL_TIMEOUT_MS = 3000;

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

  const pxTable = new Int32Array(INPUT_SIZE);
  const pyTable = new Int32Array(INPUT_SIZE);

  if (rotationDeg === 90) {
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

function toSpeechText(label: string): string {
  return label.replace(/_/g, ' ').toLowerCase();
}
export function isMedicalLabel(label: string): boolean {
  return SIGN_LABELS.indexOf(label) >= MEDICAL_TERMS_START_INDEX;
}

// ─── Hook Implementation ─────────────────────────────────────────────────────
export function useSignTranslator() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const format = useCameraFormat(device, [
    { photoResolution: { width: INPUT_SIZE, height: INPUT_SIZE } },
  ]);

  const [isDetecting, setIsDetecting] = useState(false);
  const [detection, setDetection] = useState<SignDetection | null>(null);

  const cameraRef = useRef<Camera>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const historyRef = useRef<number[]>([]);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;

  // ─── Spelling mode ───────────────────────────────────────────────────
  const spellBufferRef = useRef<string[]>([]);
  const spellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSpelling, setIsSpelling] = useState(false);
  const [spellBuffer, setSpellBuffer] = useState<string>('');

  const [spellLanguage, setSpellLanguage] = useState<SpellLanguage>('en');
  const spellLanguageRef = useRef<SpellLanguage>(spellLanguage);
  useEffect(() => {
    spellLanguageRef.current = spellLanguage;
  }, [spellLanguage]);

  const toggleSpellLanguage = useCallback(() => {
    setSpellLanguage(prev => (prev === 'en' ? 'fil' : 'en'));
  }, []);

  const [spellSuggestions, setSpellSuggestions] = useState<string[] | null>(null);
  const [spellPendingWord, setSpellPendingWord] = useState<string | null>(null);

  const flushSpellBuffer = useCallback(() => {
    if (spellTimerRef.current) {
      clearTimeout(spellTimerRef.current);
      spellTimerRef.current = null;
    }
    const letters = spellBufferRef.current;
    if (letters.length === 0) {
      setIsSpelling(false);
      setSpellBuffer('');
      return;
    }

    // Clear any stale suggestions from a previous word now that a new
    // word is actually flushing — this only happens here (not in
    // pushLetter), so a stray letter detected right after a flush can't
    // wipe suggestions before the user has a chance to see/tap them.
    setSpellSuggestions(null);
    setSpellPendingWord(null);

    const spelled = letters.join('');
    spellBufferRef.current = [];
    setIsSpelling(false);
    setSpellBuffer('');

    // Only ever runs on the letter buffer (A-Z detections) — never
    // touches whole-word or Filipino-medical-term detections, which take
    // a completely separate path in runOnce() and never reach here.
    const result = autocorrectSpelledWord(spelled, spellLanguageRef.current);

    if (result.suggestions && result.suggestions.length > 0) {
      // Ambiguous tie — don't speak anything yet, wait for the user to pick.
      setSpellPendingWord(spelled);
      setSpellSuggestions(result.suggestions);
      return;
    }

    setDetection({ label: result.word, confidence: 1 });
  }, []);

  // User tapped a suggestion chip (or the "keep as spelled" option).
  const resolveSpellSuggestion = useCallback((chosen: string) => {
    setSpellSuggestions(null);
    setSpellPendingWord(null);
    setDetection({ label: chosen, confidence: 1 });
  }, []);

  // Discard the pending choice without picking anything.
  const dismissSpellSuggestions = useCallback(() => {
    setSpellSuggestions(null);
    setSpellPendingWord(null);
  }, []);

  const pushLetter = useCallback((letter: string) => {
    // Note: this intentionally does NOT clear spellSuggestions/
    // spellPendingWord anymore. Clearing happened here previously, which
    // meant a stray letter detected right after a flush (the hand
    // doesn't vanish from frame instantly) could wipe suggestions within
    // one detection tick (~400ms) — faster than a user could see or tap
    // them. Suggestions now only clear when a new word actually flushes
    // (in flushSpellBuffer), or via explicit resolve/dismiss/stop.
    spellBufferRef.current.push(letter);
    setIsSpelling(true);
    setSpellBuffer(spellBufferRef.current.join(''));

    if (spellTimerRef.current) clearTimeout(spellTimerRef.current);
    spellTimerRef.current = setTimeout(flushSpellBuffer, SPELL_TIMEOUT_MS);
  }, [flushSpellBuffer]);

  useEffect(() => {
    return () => {
      if (spellTimerRef.current) clearTimeout(spellTimerRef.current);
    };
  }, []);
  // ─── end spelling mode ──────────────────────────────────────────────

  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [modelState, setModelState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [modelError, setModelError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setModelState('loading');

        const localPath = `${RNFS.CachesDirectoryPath}/besta_float16.tflite`;
        const alreadyCached = await RNFS.exists(localPath);

        if (!alreadyCached) {
          await RNFS.copyFileAssets('besta_float16.tflite', localPath);
        }

        const loaded = await loadTensorflowModel({ url: `file://${localPath}` }, []);

        if (!cancelled) {
          setModel(loaded);
          setModelState('loaded');
        }
      } catch (e) {
        if (!cancelled) {
          setModelError(e);
          setModelState('error');
          console.warn('[SignTranslator] model load error:', e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const isModelReady = modelState === 'loaded';

  const lastSpokenLabelRef = useRef<string | null>(null);
  const supportsFilipinoRef = useRef<boolean>(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);

  useEffect(() => {
    Speech.getAvailableVoices('fil')
      .then(voices => { supportsFilipinoRef.current = voices.length > 0; })
      .catch(() => { supportsFilipinoRef.current = false; });
  }, []);

  useEffect(() => {
    Speech.configure({ rate: 0.85, pitch: 1.0, ducking: true });
    return () => { Speech.stop(); };
  }, []);

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

  const runOnce = useCallback(async () => {
    if (busyRef.current || !cameraRef.current || !model) return;
    busyRef.current = true;

    let photoPath: string | null = null;

    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      photoPath = photo.path;
      const filePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;

      const rawOrientation = (photo as any).orientation;
      const exifOrientation = (photo as any).metadata?.Orientation ?? (photo as any).metadata?.orientation;

      const image = await Images.loadFromFileAsync(filePath);
      const rawPixelData = await image.toRawPixelData();
      const srcW = image.width;
      const srcH = image.height;

      const srcPixels = new Uint8Array(rawPixelData.buffer);
      const inferredChannels = Math.round(srcPixels.length / (srcW * srcH)) as 3 | 4;

      const rotationDeg = getRotationDeg(rawOrientation, exifOrientation, srcW, srcH);
      const float32Input = resizeToFloat32(srcPixels, srcW, srcH, inferredChannels, rotationDeg, MIRROR_FRONT_CAMERA);

      if (!model) return;
      const outputs = model.runSync([float32Input.buffer as ArrayBuffer]);
      const output = new Float32Array(outputs[0]);

      const result = findBestDetection(output);
      const history = historyRef.current;

      if (result) {
        history.push(result.classIdx);
        if (history.length > CONFIRM_FRAMES) history.shift();

        const allSame = history.length === CONFIRM_FRAMES && history.every(c => c === history[0]);
        if (allSame) {
          const label = SIGN_LABELS[result.classIdx] ?? `Class_${result.classIdx}`;

          if (isLetterLabel(label)) {
            pushLetter(label);
          } else if (spellBufferRef.current.length > 0) {
            // ignore full-word signs while letters are buffered
          } else {
            setDetection({ label, confidence: result.score });
          }
        }
      } else {
        historyRef.current = [];
        if (spellBufferRef.current.length === 0) {
          setDetection(null);
        }
      }
    } catch (e) {
      console.warn('[SignTranslator] inference error:', e);
    } finally {
      if (photoPath) {
        await RNFS.unlink(photoPath).catch(e => console.warn('[SignTranslator] unlink failed:', e));
      }
      busyRef.current = false;
    }
  }, [model, pushLetter]);

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

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const toggleDetection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDetecting(prev => {
      if (prev) {
        setDetection(null);
        Speech.stop();
        spellBufferRef.current = [];
        if (spellTimerRef.current) clearTimeout(spellTimerRef.current);
        setIsSpelling(false);
        setSpellBuffer('');
        setSpellSuggestions(null);
        setSpellPendingWord(null);
      }
      return !prev;
    });
  }, []);

  return {
    hasPermission,
    requestPermission,
    device,
    format,
    isDetecting,
    detection,
    isModelReady,
    modelState,
    cameraRef,
    cardOpacity,
    cardScale,
    toggleDetection,
    isVoiceEnabled,
    toggleVoice,
    isSpelling,
    spellBuffer,
    spellLanguage,
    toggleSpellLanguage,
    spellSuggestions,
    spellPendingWord,
    resolveSpellSuggestion,
    dismissSpellSuggestions,
  };
}