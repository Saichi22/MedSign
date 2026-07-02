/**
 * SignTranslatorScreen.tsx
 *
 * Sign language translation — JS-thread inference approach.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import RNFS from 'react-native-fs';
import { Images } from 'react-native-nitro-image';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/TranslatorScreenStyle';

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
// Bumped from 400 -> 700ms. Full photo capture + decode + 640x640 resize +
// inference is heavy; giving more breathing room per cycle reduces sustained
// pressure on the device and lowers odds of a tick overlapping the next one.
const THROTTLE_MS     = 700;
const CONFIRM_FRAMES  = 1;
const INPUT_SIZE      = 640;
// If a single tick hasn't finished within this long, something is stuck
// (hung native call). Force busyRef back open so the loop can't wedge itself
// forever — better to skip a frame than freeze the whole feature.
const WATCHDOG_MS     = 5000;

interface SignDetection { label: string; confidence: number; }

// ── Rotation override: set to a number during per-device testing, null in prod
const FRONT_CAM_ROTATION_OVERRIDE: 0 | 90 | 180 | 270 | null = null;

const ROTATION_MAP: Record<string, 0 | 90 | 180 | 270> = {
  'portrait':             0,
  'landscape-left':       90,
  'landscape-right':      270,
  'portrait-upside-down': 180,
};

const EXIF_ROTATION_MAP: Record<number, 0 | 90 | 180 | 270> = {
  1: 0, 3: 180, 6: 90, 8: 270,
};

const MIRROR_FRONT_CAMERA = true;

// Set to 270 (confirmed for Samsung; raw sensor buffer is 90° CCW from upright).
// If a device still looks rotated after auto-correction, flip this to 90.
const ASSUMED_LANDSCAPE_DIRECTION: 90 | 270 = 270;

function getRotationDeg(
  orientation: string | undefined,
  exifOrientation: number | undefined,
  srcW: number,
  srcH: number,
): 0 | 90 | 180 | 270 {
  if (FRONT_CAM_ROTATION_OVERRIDE !== null) {
    console.log(`[SignTranslator] OVERRIDE active: rotationDeg=${FRONT_CAM_ROTATION_OVERRIDE}`);
    return FRONT_CAM_ROTATION_OVERRIDE;
  }

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

  let resolved: 0 | 90 | 180 | 270;

  if (dimensionsDisagreeWithClaim) {
    resolved = bufferIsLandscape ? ASSUMED_LANDSCAPE_DIRECTION : (claimed ?? 0);
    console.warn(
      `[SignTranslator] orientation mismatch — source="${source}" claimed=${claimed}°, ` +
      `buffer=${srcW}x${srcH} (${bufferIsLandscape ? 'landscape' : 'portrait'}). ` +
      `Overriding to ${resolved}°. If still wrong, flip ASSUMED_LANDSCAPE_DIRECTION to ` +
      `${ASSUMED_LANDSCAPE_DIRECTION === 270 ? 90 : 270}.`
    );
  } else if (claimed !== null) {
    resolved = claimed;
    console.log(`[SignTranslator] rotation=${resolved}° (${source}), buffer=${srcW}x${srcH}, consistent`);
  } else {
    resolved = bufferIsLandscape ? ASSUMED_LANDSCAPE_DIRECTION : 0;
    console.warn(
      `[SignTranslator] no orientation source — inferred rotation=${resolved}° from buffer ${srcW}x${srcH}`
    );
  }

  return resolved;
}

// ── Reusable output buffer: allocated once, reused every frame to avoid
// creating a new ~5 MB Float32Array on each inference tick.
const float32Pool = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);

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
  const cropX0   = Math.floor((logW - cropSize) / 2);
  const cropY0   = Math.floor((logH - cropSize) / 2);
  const scale    = cropSize / INPUT_SIZE;

  const out = float32Pool;

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

function findBestDetection(
  output: Float32Array,
): { classIdx: number; score: number } | null {
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

export default function SignTranslatorScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const [isDetecting, setIsDetecting] = useState(false);
  const [detection, setDetection]     = useState<SignDetection | null>(null);

  const cameraRef    = useRef<Camera>(null);
  const loopRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef      = useRef(false);
  const historyRef   = useRef<number[]>([]);
  const mountedRef   = useRef(true);
  const HISTORY_SIZE = CONFIRM_FRAMES;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale   = useRef(new Animated.Value(0.95)).current;

  const model        = useTensorflowModel(require('../../../../assets/besta_float16.tflite'), []);
  const isModelReady = model.state === 'loaded';

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (detection) {
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.spring(cardScale, {
          toValue: 1, useNativeDriver: true, bounciness: 4,
        }),
      ]).start();
    } else {
      Animated.timing(cardOpacity, {
        toValue: 0, duration: 150, useNativeDriver: true,
      }).start();
      cardScale.setValue(0.95);
    }
  }, [detection]);

  const runOnce = useCallback(async () => {
    if (busyRef.current || !cameraRef.current || !model.model) return;
    busyRef.current = true;

    let photoPath: string | null = null;

    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      photoPath = photo.path;
      const capturedPath = photoPath;
      const filePath = capturedPath.startsWith('file://') ? capturedPath : `file://${capturedPath}`;

      const rawOrientation: string | undefined = (photo as any).orientation;
      const exifOrientation: number | undefined =
        (photo as any).metadata?.Orientation ?? (photo as any).metadata?.orientation;

      // Decode. `image` is a local const that naturally falls out of scope
      // and becomes GC-eligible once this function returns — Nitro
      // HybridObjects don't need/have a manual dispose() call, they're
      // reference-counted natively, so nothing extra to release here.
      let image = await Images.loadFromFileAsync(filePath);
      const rawPixelData = await image.toRawPixelData();
      const srcW = image.width;
      const srcH = image.height;

      // Drop the reference proactively rather than waiting for function exit —
      // keeps it eligible for collection before the heavier work below runs.
      image = null as any;

      await RNFS.unlink(photoPath).catch((e: unknown) =>
        console.warn('[SignTranslator] unlink failed:', e)
      );
      photoPath = null;

      const srcPixels = new Uint8Array(rawPixelData.buffer);
      const inferredChannels = Math.round(srcPixels.length / (srcW * srcH)) as 3 | 4;

      const rotationDeg = getRotationDeg(rawOrientation, exifOrientation, srcW, srcH);
      const float32Input = resizeToFloat32(
        srcPixels, srcW, srcH, inferredChannels, rotationDeg, MIRROR_FRONT_CAMERA
      );

      if (!model.model) return;
      const outputs = model.model.runSync([float32Input.buffer as ArrayBuffer]);
      const output  = new Float32Array(outputs[0]);

      if (!mountedRef.current) return;

      const result = findBestDetection(output);
      const history = historyRef.current;

      if (result) {
        history.push(result.classIdx);
        if (history.length > HISTORY_SIZE) history.shift();

        const allSame = history.length === HISTORY_SIZE &&
          history.every(c => c === history[0]);

        if (allSame) {
          setDetection({
            label:      SIGN_LABELS[result.classIdx] ?? `Class_${result.classIdx}`,
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
      const remainingPath = photoPath;
      if (remainingPath) {
        await RNFS.unlink(remainingPath).catch((e: unknown) =>
          console.warn('[SignTranslator] finally-unlink failed:', e)
        );
      }
      busyRef.current = false;
    }
  }, [model.model]);

  // ── Inference loop: sequential (waits for previous tick before scheduling
  // the next) + watchdog so a stuck native call can't wedge it permanently.
  useEffect(() => {
    if (!isDetecting || !isModelReady) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      const watchdog = setTimeout(() => {
        // If runOnce hasn't returned by now, force the flag open so the
        // loop can still schedule its next attempt instead of hanging forever.
        busyRef.current = false;
      }, WATCHDOG_MS);

      await runOnce();
      clearTimeout(watchdog);

      if (!cancelled) {
        loopRef.current = setTimeout(tick, THROTTLE_MS);
      }
    };

    loopRef.current = setTimeout(tick, 0);

    return () => {
      cancelled = true;
      if (loopRef.current) clearTimeout(loopRef.current);
    };
  }, [isDetecting, isModelReady, runOnce]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const toggleDetection = useCallback(() => {
    setIsDetecting(prev => {
      if (prev) {
        setDetection(null);
        historyRef.current = [];
      }
      return !prev;
    });
  }, []);

  if (!hasPermission) {
    return (
      <View style={styles.centeredFill}>
        <View style={styles.emptyIconWrap}>
          <MaterialCommunityIcons name="camera-off" size={28} color={COLOR.tealBright} />
        </View>
        <Text style={styles.emptyTitle}>Camera Access Needed</Text>
        <Text style={styles.emptyBody}>
          Sign detection requires access to your camera to read hand gestures in real time.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centeredFill}>
        <View style={styles.emptyIconWrap}>
          <MaterialCommunityIcons name="camera-off" size={28} color={COLOR.tealBright} />
        </View>
        <Text style={styles.emptyTitle}>No Camera Found</Text>
        <Text style={styles.emptyBody}>A front-facing camera is required for sign detection.</Text>
      </View>
    );
  }

  const isMedicalSign = detection && SIGN_LABELS.indexOf(detection.label) >= 48;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <View style={styles.bgLayer} pointerEvents="none">
        <View style={styles.bgBlobTopRight} />
        <View style={styles.bgBlobMidLeft} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerBlob} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>LIVE TRANSLATION</Text>
            <Text style={styles.headerTitle}>Sign Language</Text>
          </View>
          <View style={[styles.liveBadge, isDetecting && styles.liveBadgeActive]}>
            <View style={[styles.liveDot, isDetecting && styles.liveDotActive]} />
            <Text style={[styles.liveText, isDetecting && styles.liveTextActive]}>
              {isDetecting ? 'LIVE' : 'IDLE'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isModelReady && (
          <View style={[styles.bannerCard, model.state === 'error' && styles.bannerCardError]}>
            <View style={[styles.bannerIconWrap, model.state === 'error' && styles.bannerIconWrapError]}>
              <MaterialCommunityIcons
                name={model.state === 'error' ? 'alert-circle' : 'circle-slice-2'}
                size={16}
                color={model.state === 'error' ? COLOR.red : COLOR.amber}
              />
            </View>
            <Text style={[styles.bannerText, model.state === 'error' && styles.bannerTextError]}>
              {model.state === 'error' ? 'Model setup failed' : 'Optimizing translation engine…'}
            </Text>
          </View>
        )}

        <View style={[styles.card, isMedicalSign && styles.cardMedical]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={styles.historyIconWrap}>
                <MaterialCommunityIcons name="video" size={20} color={COLOR.tealDeep} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Camera Input</Text>
                <Text style={styles.cardSub}>Keep hands clearly within the boundaries</Text>
              </View>
            </View>
            {isDetecting && (
              <View style={styles.cardHeaderChip}>
                <Text style={styles.cardHeaderChipText}>SCANNING</Text>
              </View>
            )}
          </View>

          <View style={styles.viewfinderWrap}>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              photo={true}
              pixelFormat="yuv"
            />
            <View style={styles.scanlineOverlay} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
          </View>
        </View>

        <View style={styles.card}>
          {!detection ? (
            <View style={styles.outputBox}>
              <View style={styles.outputIconWrap}>
                <MaterialCommunityIcons name="text-to-speech" size={20} color={COLOR.tealDeep} />
              </View>
              <Text style={styles.outputTextMuted}>
                {isDetecting ? 'Awaiting sign inputs…' : 'Start session to begin translations'}
              </Text>
            </View>
          ) : (
            <Animated.View style={{ opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
              <Text style={styles.sectionLabel}>DETECTED SIGN</Text>
              <Text style={styles.predictionLabel}>{detection.label}</Text>

              {isMedicalSign && (
                <View style={styles.medicalTag}>
                  <MaterialCommunityIcons name="heart-pulse" size={12} color={COLOR.amber} />
                  <Text style={styles.medicalTagText}>Medical Terminology</Text>
                </View>
              )}

              <View style={styles.predictionMeta}>
                <Text style={styles.predictionConf}>
                  Confidence: {Math.round(detection.confidence * 100)}%
                </Text>
                <View style={styles.confidenceTrack}>
                  <View style={[styles.confidenceFill, { width: `${detection.confidence * 100}%` }]} />
                </View>
              </View>
            </Animated.View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isDetecting && styles.stopBtn]}
          onPress={toggleDetection}
          disabled={!isModelReady}
          activeOpacity={0.88}
        >
          <MaterialCommunityIcons
            name={isDetecting ? 'stop' : 'play'}
            size={22}
            color={isDetecting ? COLOR.red : COLOR.tealDeep}
          />
          <Text style={[styles.primaryBtnText, isDetecting && styles.stopBtnText]}>
            {isDetecting ? 'End Translation' : 'Start Translation'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}