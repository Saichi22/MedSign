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

// ─── Center-crop to square then resize to INPUT_SIZE×INPUT_SIZE float32 ──────
// Stretching a portrait photo distorts the hand shape. Center-cropping first
// keeps the hand centered (where the model was trained to look) and undistorted.
function resizeToFloat32(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  channels: 3 | 4,
): Float32Array {
  // 1. Center-crop to the largest square that fits
  const cropSize = Math.min(srcW, srcH);
  const cropX0   = Math.floor((srcW - cropSize) / 2);
  const cropY0   = Math.floor((srcH - cropSize) / 2);
  const scale    = cropSize / INPUT_SIZE;

  const out = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);

  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const srcX   = Math.min(Math.floor(x * scale) + cropX0, srcW - 1);
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
  // Smoothing buffer: track last N winning classes
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
      const float32Input = resizeToFloat32(srcPixels, srcW, srcH, inferredChannels);

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
        // Push winning class into history, keep last HISTORY_SIZE only
        history.push(result.classIdx);
        if (history.length > HISTORY_SIZE) history.shift();

        // Only confirm if all recent frames agree on the same class
        const allSame = history.length === HISTORY_SIZE &&
          history.every(c => c === history[0]);

        if (allSame) {
          setDetection({
            label:      SIGN_LABELS[result.classIdx] ?? `Class_${result.classIdx}`,
            confidence: result.score,
          });
          setNoSignSeen(false);
        }
        // else: keep showing previous confirmed detection while building consensus
      } else {
        // No confident detection — clear history and reset
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

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Camera permission required.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>No front camera found.</Text>
      </View>
    );
  }

  const buttonLabel = !isModelReady ? 'Loading Model…'
    : isDetecting ? 'Stop Detection' : 'Start Detection';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        pixelFormat="yuv"
      />

      <View style={styles.topOverlay}>
        <Text style={styles.title}>Sign Translator</Text>
        {model.state === 'loading' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#A78BFA" />
            <Text style={styles.loadingText}>Loading model…</Text>
          </View>
        )}
        {model.state === 'error' && (
          <Text style={styles.errorText}>
            ⚠ Model failed to load.{'\n'}Put besta_float16.tflite in{'\n'}android/app/src/main/assets/
          </Text>
        )}
      </View>

      {isDetecting && (
        <View style={styles.resultArea} pointerEvents="none">
          {detection ? (
            <Animated.View style={[styles.resultCard, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
              <Text style={styles.signEmoji}>🤟</Text>
              <Text style={styles.signLabel}>{detection.label}</Text>
              <View style={styles.confidenceRow}>
                <View style={[styles.confidenceBar, { width: `${Math.round(detection.confidence * 100)}%` }]} />
              </View>
              <Text style={styles.confidenceText}>{Math.round(detection.confidence * 100)}% confidence</Text>
            </Animated.View>
          ) : (
            <View style={styles.noSignCard}>
              <Text style={styles.noSignText}>{'👋  No sign detected'}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.button, isDetecting && styles.buttonActive, !isModelReady && styles.buttonDisabled]}
          onPress={toggleDetection}
          disabled={!isModelReady}
          activeOpacity={0.8}
        >
          {model.state === 'loading'
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{buttonLabel}</Text>}
        </TouchableOpacity>
        {isDetecting && <Text style={styles.hint}>Hold a sign clearly in frame</Text>}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const PURPLE       = '#7C3AED';
const PURPLE_LIGHT = '#A78BFA';
const STOP_RED     = '#DC2626';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24 },
  permissionText: { color: '#ccc', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  permBtn: { backgroundColor: PURPLE, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 0.5 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  loadingText: { color: PURPLE_LIGHT, fontSize: 13 },
  errorText: { color: '#FCA5A5', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  resultArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  resultCard: {
    backgroundColor: 'rgba(15,10,30,0.88)', borderRadius: 24, padding: 28, alignItems: 'center', minWidth: 220,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.5)',
    shadowColor: PURPLE, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
  },
  signEmoji: { fontSize: 48, marginBottom: 8 },
  signLabel: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: 1, marginBottom: 14 },
  confidenceRow: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  confidenceBar: { height: '100%', backgroundColor: PURPLE_LIGHT, borderRadius: 3 },
  confidenceText: { color: PURPLE_LIGHT, fontSize: 13, fontWeight: '500' },
  noSignCard: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14 },
  noSignText: { color: 'rgba(255,255,255,0.65)', fontSize: 15 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 40, paddingHorizontal: 32, paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', gap: 10,
  },
  button: {
    backgroundColor: PURPLE, borderRadius: 40, paddingVertical: 16, paddingHorizontal: 48,
    alignItems: 'center', justifyContent: 'center', minWidth: 220,
    shadowColor: PURPLE, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  buttonActive: { backgroundColor: STOP_RED, shadowColor: STOP_RED },
  buttonDisabled: { backgroundColor: '#4B5563', shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center' },
});