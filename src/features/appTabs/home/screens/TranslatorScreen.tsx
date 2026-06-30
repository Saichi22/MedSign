/**
 * SignTranslatorScreen.tsx
 *
 * Sign language translation — JS-thread inference approach.
 *
 * Updated for best__6__float16.tflite
 *   Output tensor: [1, 62, 8400]  →  4 box coords + 58 classes
 *
 * Dependencies:
 *   react-native-vision-camera    ^4.7.3
 *   react-native-fast-tflite      ^3.0.1
 *   react-native-fs               ^2.20.0
 *   react-native-worklets-core    ^1.6.3   (kept for other screens)
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutAnimation,
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

// ─── Enable LayoutAnimation on Android ───────────────────────────────────────
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Class labels (58 total — extracted directly from best__6_.pt) ───────────
// Order matches the model's internal names dict (keys 0–57).
// ─── Class labels (58 total — from best__6_.pt model.names, keys 0–57) ──────
const SIGN_LABELS: string[] = [
  'A',          // 0
  'B',          // 1
  'C',          // 2
  'D',          // 3
  'E',          // 4  ← was 'Eight' in old code (off-by-one from here)
  'Eight',      // 5
  'F',          // 6
  'Family',     // 7
  'Fine',       // 8
  'Five',       // 9
  'Four',       // 10
  'G',          // 11
  'H',          // 12
  'Help',       // 13
  'Home',       // 14
  'Hungry',     // 15
  'I',          // 16
  'I_hate_you', // 17
  'I_love_you', // 18
  'K',          // 19  ← 'J' is at 46, not here
  'L',          // 20
  'M',          // 21
  'N',          // 22
  'Nine',       // 23
  'No',         // 24
  'O',          // 25
  'Okay',       // 26
  'One',        // 27
  'P',          // 28
  'Pray',       // 29
  'Q',          // 30
  'R',          // 31
  'S',          // 32
  'Seven',      // 33
  'Six',        // 34
  'Sorry',      // 35
  'T',          // 36
  'Three',      // 37
  'Time',       // 38
  'Two',        // 39
  'U',          // 40
  'V',          // 41
  'W',          // 42
  'X',          // 43
  'Y',          // 44
  'Zero',       // 45
  'J',          // 46
  'Z',          // 47
  'LALAMUNAN',  // 48
  'MAHIRAP',    // 49
  'MASAKIT',    // 50
  'NAGSUSUKA',  // 51
  'NAGTATAE',   // 52
  'NAHIHILO',   // 53
  'NAIIHI',     // 54
  'NAMAMANAS',  // 55
  'NANGHIHINA', // 56
  'TUMUTUSOK',  // 57
];

// ─── Constants ────────────────────────────────────────────────────────────────
const NUM_CLASSES     = 58;   // updated: 62 output rows − 4 box coords = 58
const NUM_PREDICTIONS = 8400;
const CONF_THRESHOLD  = 0.40;
const THROTTLE_MS     = 400;
const CONFIRM_FRAMES  = 1;
const INPUT_SIZE      = 640;

interface SignDetection { label: string; confidence: number; }

// ─── Map VisionCamera orientation string → degrees needed to correct it ───────
const ROTATION_MAP: Record<string, 0 | 90 | 180 | 270> = {
  'portrait':             0,
  'landscape-left':       90,   // Samsung front cam typical case
  'landscape-right':      270,
  'portrait-upside-down': 180,
};

// ─── Center-crop + rotation correction + resize to INPUT_SIZE×INPUT_SIZE ──────
// rotationDeg = how many degrees the raw buffer is rotated AWAY from portrait.
// At 0° we also apply a horizontal mirror for front cameras (POCO behaviour).
// At 90°/270° the rotation math inherently corrects Samsung's flipped output.
function resizeToFloat32(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  channels: 3 | 4,
  rotationDeg: 0 | 90 | 180 | 270 = 0,
): Float32Array {
  // After correcting rotation, logical dimensions may be swapped
  const logW = (rotationDeg === 90 || rotationDeg === 270) ? srcH : srcW;
  const logH = (rotationDeg === 90 || rotationDeg === 270) ? srcW : srcH;

  const cropSize = Math.min(logW, logH);
  const cropX0   = Math.floor((logW - cropSize) / 2);
  const cropY0   = Math.floor((logH - cropSize) / 2);
  const scale    = cropSize / INPUT_SIZE;

  const out = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);

  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      // Logical pixel in the correctly-oriented (portrait) frame
      const lx = Math.min(Math.floor(x * scale) + cropX0, logW - 1);
      const ly = Math.min(Math.floor(y * scale) + cropY0, logH - 1);

      // Map logical → physical coords in the raw buffer
      let px: number, py: number;
      if (rotationDeg === 90) {
        // Raw buffer is rotated 90° CW relative to portrait → undo
        px = srcW - 1 - ly;
        py = lx;
      } else if (rotationDeg === 270) {
        px = ly;
        py = srcH - 1 - lx;
      } else if (rotationDeg === 180) {
        px = srcW - 1 - lx;
        py = srcH - 1 - ly;
      } else {
        // 0° — apply horizontal flip for front camera (POCO / default behaviour)
        px = srcW - 1 - lx;
        py = ly;
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

// ─── YOLOv8 post-processing on the flat output buffer ────────────────────────
// Output layout: [62 × 8400] flattened row-major
//   rows  0-3  → box coords (x, y, w, h) — skipped
//   rows  4-61 → class scores for NUM_CLASSES classes
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

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function SignTranslatorScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const [isDetecting, setIsDetecting]   = useState(false);
  const [detection, setDetection]       = useState<SignDetection | null>(null);
  const [noSignSeen, setNoSignSeen]     = useState(true);
  const [status, setStatus]             = useState('');

  const cameraRef      = useRef<Camera>(null);
  const loopRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef        = useRef(false);
  const historyRef     = useRef<number[]>([]);
  const HISTORY_SIZE   = CONFIRM_FRAMES;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale   = useRef(new Animated.Value(0.85)).current;

  // ── TFLite model ───────────────────────────────────────────────────────────
  const model        = useTensorflowModel(require('../../../../assets/besta_float16.tflite'), []);
  const isModelReady = model.state === 'loaded';

  // ── Log model state on mount/change for easier debugging ──────────────────
  useEffect(() => {
    console.log('[SignTranslator] model state:', model.state, (model as any).error ?? '');
  }, [model.state]);

  // ── Animate detection card ─────────────────────────────────────────────────
  useEffect(() => {
    if (detection) {
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.spring(cardScale, {
          toValue: 1, useNativeDriver: true, bounciness: 6,
        }),
      ]).start();
    } else {
      Animated.timing(cardOpacity, {
        toValue: 0, duration: 150, useNativeDriver: true,
      }).start();
      cardScale.setValue(0.85);
    }
  }, [detection, cardOpacity, cardScale]);

  // ── Core inference loop ────────────────────────────────────────────────────
  const runOnce = useCallback(async () => {
    if (busyRef.current || !cameraRef.current || !model.model) return;
    busyRef.current = true;

    try {
      // 1. Take photo snapshot
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const filePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;

      // 2. Determine rotation needed to correct the raw pixel orientation.
      //    VisionCamera stores the correct presentation orientation in photo.orientation.
      //    Samsung devices typically report 'landscape-left' for front-cam portrait shots.
      const rotationDeg: 0 | 90 | 180 | 270 =
        ROTATION_MAP[(photo as any).orientation ?? 'portrait'] ?? 0;
      console.log(`[SignTranslator] photo.orientation=${(photo as any).orientation}, rotationDeg=${rotationDeg}`);

      // 3. Decode JPEG → raw pixel buffer via nitro-image
      const image = await Images.loadFromFileAsync(filePath);
      const rawPixelData = await image.toRawPixelData();
      const srcW = image.width;
      const srcH = image.height;
      await RNFS.unlink(photo.path).catch(e => console.warn('[SignTranslator] unlink failed:', e));

      const srcPixels = new Uint8Array(rawPixelData.buffer);

      // nitro-image on Android returns RGBA (4 bytes/pixel); detect channel count.
      const totalPixels = srcW * srcH;
      const inferredChannels = Math.round(srcPixels.length / totalPixels) as 3 | 4;
      console.log(`[SignTranslator] image ${srcW}×${srcH}, buffer=${srcPixels.length}, channels=${inferredChannels}`);

      // 4. Resize → 640×640 float32 [0–1], with rotation + mirror correction
      const float32Input = resizeToFloat32(srcPixels, srcW, srcH, inferredChannels, rotationDeg);

      // 5. Run TFLite inference
      if (!model.model) return;
      const outputs = model.model.runSync([float32Input.buffer as ArrayBuffer]);
      const output  = new Float32Array(outputs[0]);

      // 6. Debug: log output tensor size + global max score
      // Expected output.length = 62 × 8400 = 520,800
      let globalMax = 0;
      let globalMaxClass = -1;
      let globalMaxPred = -1;
      for (let j = 0; j < NUM_PREDICTIONS; j++) {
        for (let c = 0; c < NUM_CLASSES; c++) {
          const score = output[(c + 4) * NUM_PREDICTIONS + j];
          if (score > globalMax) { globalMax = score; globalMaxClass = c; globalMaxPred = j; }
        }
      }
      console.log(
        `[SignTranslator] output len=${output.length} (expected ${(NUM_CLASSES + 4) * NUM_PREDICTIONS}),` +
        ` globalMax=${globalMax.toFixed(4)} class=${globalMaxClass} pred=${globalMaxPred} threshold=${CONF_THRESHOLD}`
      );

      // 7. YOLOv8 post-processing with temporal smoothing
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
          setNoSignSeen(false);
        }
      } else {
        historyRef.current = [];
        setDetection(null);
        setNoSignSeen(true);
      }

    } catch (e) {
      console.warn('[SignTranslator] inference error:', e);
    } finally {
      busyRef.current = false;
    }
  }, [model.model]);

  // ── Start / stop the inference loop ───────────────────────────────────────
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

  // ── Permission ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // ── Toggle ─────────────────────────────────────────────────────────────────
  const toggleDetection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDetecting(prev => {
      if (prev) { setDetection(null); setNoSignSeen(false); }
      return !prev;
    });
  }, []);

  // ── Permission guard ───────────────────────────────────────────────────────
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

  // ── Device guard ───────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerBlob} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>Live Detection</Text>
            <Text style={styles.headerTitle}>Sign Translator</Text>
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
        {/* ── Model loading / error banner ── */}
        {!isModelReady && (
          <View style={[styles.bannerCard, model.state === 'error' && styles.bannerCardError]}>
            <MaterialCommunityIcons
              name={model.state === 'error' ? 'alert-circle-outline' : 'clock-outline'}
              size={16}
            />
            <Text style={[styles.bannerText, model.state === 'error' && styles.bannerTextError]}>
              {model.state === 'error'
                ? 'Model failed to load — check asset path'
                : 'Loading detection model…'}
            </Text>
          </View>
        )}

        {/* ── Camera viewfinder ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIconWrap}>
                <MaterialCommunityIcons name="camera" size={18} color={COLOR.tealBright} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Camera Feed</Text>
                <Text style={styles.cardSub}>Point at signing hands</Text>
              </View>
            </View>
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
            <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
          </View>
        </View>

        {/* ── Current prediction card ── */}
        {detection ? (
          <Animated.View
            style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}
          >
            <Text style={styles.sectionLabel}>CURRENT SIGN</Text>
            <Text style={styles.predictionLabel}>{detection.label}</Text>
            <View style={styles.predictionMeta}>
              <Text style={styles.predictionConf}>
                {Math.round(detection.confidence * 100)}% confidence
              </Text>
            </View>
          </Animated.View>
        ) : (
          <View style={styles.outputBox}>
            <Text style={styles.sectionLabel}>TRANSLATION OUTPUT</Text>
            <Text style={styles.outputTextMuted}>
              {isDetecting ? 'Listening for signs…' : 'Start a session to see translations'}
            </Text>
          </View>
        )}

        {/* ── Start / Stop button ── */}
        <TouchableOpacity
          style={[styles.primaryBtn, isDetecting && styles.stopBtn]}
          onPress={toggleDetection}
          disabled={!isModelReady}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={isDetecting ? 'stop-circle-outline' : 'camera-outline'}
            size={20}
          />
          <Text style={[styles.primaryBtnText, isDetecting && styles.stopBtnText]}>
            {isDetecting ? 'Stop Session' : isModelReady ? 'Start Translation' : 'Loading model…'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}