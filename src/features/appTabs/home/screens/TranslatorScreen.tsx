/**
 * SignTranslatorScreen.tsx
 *
 * Sign language translation — JS-thread inference approach.
 *
 * Instead of a frame processor worklet (which causes HybridObject NativeState
 * issues with fast-tflite v3), we:
 *   1. Take a photo snapshot every THROTTLE_MS via camera.takePhoto()
 *   2. Read it as a raw pixel buffer with react-native-fs
 *   3. Run TFLite inference synchronously on the JS thread
 *
 * This is ~5× slower than a frame processor but fully reliable.
 * For a sign-language app running at 2–3 fps this is perfectly fine.
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

// ─── Class labels (48 total) ──────────────────────────────────────────────────
const SIGN_LABELS: string[] = [
  'A','B','C','D','E','F','G','H','I','J',
  'K','L','M','N','O','P','Q','R','S','T',
  'U','V','W','X','Y','Z',
  '0','1','2','3','4','5','6','7','8','9',
  'Hello','Thank You','Please','Yes',
  'No','Help','More','Stop',
  'Good','Bad','Love','Goodbye',
];

// ─── Constants ────────────────────────────────────────────────────────────────
const NUM_CLASSES     = 48;
const NUM_PREDICTIONS = 8400;
const CONF_THRESHOLD  = 0.40;  // slightly lower — model scores are reliable
const THROTTLE_MS     = 400;
// Smoothing: a class must win this many consecutive frames before being shown
const CONFIRM_FRAMES  = 3;
const INPUT_SIZE      = 640;

interface SignDetection { label: string; confidence: number; }

// ─── Center-crop + horizontal flip + resize to INPUT_SIZE×INPUT_SIZE float32 ──
function resizeToFloat32(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  channels: 3 | 4,
  mirror: boolean = false,
): Float32Array {
  const cropSize = Math.min(srcW, srcH);
  const cropX0   = Math.floor((srcW - cropSize) / 2);
  const cropY0   = Math.floor((srcH - cropSize) / 2);
  const scale    = cropSize / INPUT_SIZE;

  const out = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);

  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const srcXBase = mirror ? (INPUT_SIZE - 1 - x) : x;
      const srcX   = Math.min(Math.floor(srcXBase * scale) + cropX0, srcW - 1);
      const srcY   = Math.min(Math.floor(y * scale) + cropY0, srcH - 1);
      const srcIdx = (srcY * srcW + srcX) * channels;
      const dstIdx = (y * INPUT_SIZE + x) * 3;
      out[dstIdx]     = pixels[srcIdx]     / 255;
      out[dstIdx + 1] = pixels[srcIdx + 1] / 255;
      out[dstIdx + 2] = pixels[srcIdx + 2] / 255;
    }
  }
  return out;
}

// ─── Run YOLOv8 post-processing on the flat output buffer ────────────────────
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

  // ── TFLite model (JS-thread only — no worklet capture) ────────────────────
  const model        = useTensorflowModel(require('../../../../assets/besta_float16.tflite'), []);
  const isModelReady = model.state === 'loaded';

  // ── Animate card ───────────────────────────────────────────────────────────
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

      // 2. Decode JPEG → raw pixel buffer via nitro-image
      const image = await Images.loadFromFileAsync(filePath);
      const rawPixelData = await image.toRawPixelData();
      const srcW = image.width;
      const srcH = image.height;
      await RNFS.unlink(photo.path).catch(() => {});

      const srcPixels = new Uint8Array(rawPixelData.buffer);

      // nitro-image on Android returns RGBA (4 bytes/pixel); detect channel count from buffer size.
      const totalPixels = srcW * srcH;
      const inferredChannels = Math.round(srcPixels.length / totalPixels) as 3 | 4;
      console.log(`[SignTranslator] image ${srcW}×${srcH}, buffer=${srcPixels.length}, channels=${inferredChannels}`);

      // 3. Resize → 640×640 float32 [0–1]
      const float32Input = resizeToFloat32(srcPixels, srcW, srcH, inferredChannels, true);

      // 4. Run TFLite inference
      if (!model.model) return;
      const outputs = model.model.runSync([float32Input.buffer as ArrayBuffer]);
      const output  = new Float32Array(outputs[0]);

      // 5. Debug: log output tensor size and max score across all predictions
      let globalMax = 0;
      let globalMaxClass = -1;
      let globalMaxPred = -1;
      for (let j = 0; j < NUM_PREDICTIONS; j++) {
        for (let c = 0; c < NUM_CLASSES; c++) {
          const score = output[(c + 4) * NUM_PREDICTIONS + j];
          if (score > globalMax) { globalMax = score; globalMaxClass = c; globalMaxPred = j; }
        }
      }
      console.log(`[SignTranslator] output len=${output.length}, globalMax=${globalMax.toFixed(4)} class=${globalMaxClass} pred=${globalMaxPred} threshold=${CONF_THRESHOLD}`);

      // 6. YOLOv8 post-processing with temporal smoothing
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
          {/* Live/Idle status badge — turns active (green) when the session is running */}
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
              color={model.state === 'error' ? COLOR.red : COLOR.amber}
            />
            <Text style={[styles.bannerText, model.state === 'error' && styles.bannerTextError]}>
              {model.state === 'error'
                ? 'Model configuration runtime asset missing'
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
            {/* Decorative corner brackets drawn over the viewfinder */}
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
            color={isDetecting ? COLOR.red : COLOR.tealDeep}
          />
          <Text style={[styles.primaryBtnText, isDetecting && styles.stopBtnText]}>
            {isDetecting ? 'Stop Session' : isModelReady ? 'Start Translation' : 'Loading model…'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}