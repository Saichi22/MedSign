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
  UIManager,
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

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

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

interface SignDetection { label: string; confidence: number; }

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
const ASSUMED_LANDSCAPE_DIRECTION: 90 | 270 = 270;

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
  } else if (claimed !== null) {
    return claimed;
  } else {
    return bufferIsLandscape ? ASSUMED_LANDSCAPE_DIRECTION : 0;
  }
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
  const cropX0   = Math.floor((logW - cropSize) / 2);
  const cropY0   = Math.floor((logH - cropSize) / 2);
  const scale    = cropSize / INPUT_SIZE;

  const out = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);

  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      let lx = Math.min(Math.floor(x * scale) + cropX0, logW - 1);
      const ly = Math.min(Math.floor(y * scale) + cropY0, logH - 1);

      if (mirror) {
        lx = logW - 1 - lx;
      }

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

  const [isDetecting, setIsDetecting]   = useState(false);
  const [detection, setDetection]       = useState<SignDetection | null>(null);

  const cameraRef      = useRef<Camera>(null);
  const loopRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef        = useRef(false);
  const historyRef     = useRef<number[]>([]);
  const HISTORY_SIZE   = CONFIRM_FRAMES;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale   = useRef(new Animated.Value(0.95)).current;

  const model        = useTensorflowModel(require('../../../../assets/besta_float16.tflite'), []);
  const isModelReady = model.state === 'loaded';

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

    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const filePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;

      const rawOrientation: string | undefined = (photo as any).orientation;
      const exifOrientation: number | undefined =
        (photo as any).metadata?.Orientation ?? (photo as any).metadata?.orientation;

      const image = await Images.loadFromFileAsync(filePath);
      const rawPixelData = await image.toRawPixelData();
      const srcW = image.width;
      const srcH = image.height;
      await RNFS.unlink(photo.path).catch(e => console.warn('[SignTranslator] unlink failed:', e));

      const srcPixels = new Uint8Array(rawPixelData.buffer);
      const totalPixels = srcW * srcH;
      const inferredChannels = Math.round(srcPixels.length / totalPixels) as 3 | 4;

      const rotationDeg = getRotationDeg(rawOrientation, exifOrientation, srcW, srcH);
      const float32Input = resizeToFloat32(
        srcPixels, srcW, srcH, inferredChannels, rotationDeg, MIRROR_FRONT_CAMERA
      );

      if (!model.model) return;
      const outputs = model.model.runSync([float32Input.buffer as ArrayBuffer]);
      const output  = new Float32Array(outputs[0]);

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
      busyRef.current = false;
    }
  }, [model.model]);

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
    setIsDetecting(prev => {
      if (prev) setDetection(null);
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

  // Detect whether to apply alternate layout tags for specialized medical signs
  const isMedicalSign = detection && SIGN_LABELS.indexOf(detection.label) >= 48;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* Background soft blob decorations */}
      <View style={styles.bgLayer} pointerEvents="none">
        <View style={styles.bgBlobTopRight} />
        <View style={styles.bgBlobMidLeft} />
      </View>

      {/* Header */}
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
        {/* Model status alert */}
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

        {/* Viewfinder block layout */}
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

        {/* Translation Output Matrix */}
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

        {/* Action Trigger */}
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