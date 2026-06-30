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

// ── DEVICE TESTING OVERRIDE ─────────────────────────────────────────────────
// Set this to force a specific rotation value regardless of what
// photo.orientation/EXIF report — use this to empirically determine the
// correct value on a specific physical device, then remove/null it out
// once confirmed (or wire it to a per-manufacturer table below once you've
// verified actual values on real hardware, not assumed ones).
//
// HOW TO USE: on the device that's wrong, try 0, then 90, then 180, then 270
// here, rebuild, and check which one makes the prediction's hand orientation
// look correct relative to your real hand. Whichever value fixes it is the
// CONFIRMED value for that device — not a guess from a forum post.
const FRONT_CAM_ROTATION_OVERRIDE: 0 | 90 | 180 | 270 | null = null;

// ─── Map VisionCamera orientation string → degrees needed to correct it ───────
// NOTE: 'photo.orientation' is the "display orientation" VisionCamera reports
// (how the photo should be rotated so it appears upright). It does NOT agree
// reliably across vendors — Samsung's One UI camera HAL has been observed
// reporting different strings for the same physical front-camera orientation
// depending on Android/One UI version. Treat this as a first guess, with an
// EXIF fallback below, rather than ground truth.
const ROTATION_MAP: Record<string, 0 | 90 | 180 | 270> = {
  'portrait':             0,
  'landscape-left':       90,
  'landscape-right':      270,
  'portrait-upside-down': 180,
};

// EXIF orientation tag → degrees the buffer is rotated away from upright.
// Used as a fallback/cross-check when photo.orientation is missing or
// unrecognized. Only rotation-only tag values are mapped (1/3/6/8) since
// mirroring is handled as its own explicit step below, not inferred from
// EXIF's flip-variant tags (2/4/5/7).
const EXIF_ROTATION_MAP: Record<number, 0 | 90 | 180 | 270> = {
  1: 0,    // top-left, normal
  3: 180,  // bottom-right
  6: 90,   // right-top (rotated 90° CW)
  8: 270,  // left-bottom (rotated 90° CCW)
};

// Front camera frames are always mirrored horizontally — selfie-mirror UX,
// and almost certainly how the model's training images were captured.
// Kept as its own constant/flag rather than folded into rotation logic so
// it can never silently disappear depending on which rotation case fires
// (that was the bug: mirroring only happened in the 0° branch before).
const MIRROR_FRONT_CAMERA = true;

// Resolve rotation correction in degrees. Prefers photo.orientation but
// falls back to EXIF metadata when the orientation string is missing or
// not one we recognize, and logs loudly in both the fallback and the
// "still couldn't determine it" cases so unfamiliar device behaviour shows
// up in logcat instead of silently defaulting to 0°.
//
// IMPORTANT — the 90°-vs-270° ambiguity:
// Buffer width/height alone can confirm THAT a 90-family rotation is needed
// (aspect ratio won't match an upright portrait frame) but cannot determine
// WHICH direction (CW vs CCW) — that's inherent to the data, not something
// derivable purely from dimensions. So when photo.orientation reports
// 'landscape-left' or 'landscape-right', we trust VisionCamera's own
// platform-level orientation logic rather than re-guessing the direction
// ourselves. If a specific device is still wrong, FRONT_CAM_ROTATION_OVERRIDE
// below lets you force a value for on-device testing without re-deploying
// guesswork into the rotation map itself.
function getRotationDeg(
  orientation: string | undefined,
  exifOrientation: number | undefined,
  srcW: number,
  srcH: number,
): 0 | 90 | 180 | 270 {
  if (FRONT_CAM_ROTATION_OVERRIDE !== null) {
    console.log(`[SignTranslator] using FRONT_CAM_ROTATION_OVERRIDE=${FRONT_CAM_ROTATION_OVERRIDE}`);
    return FRONT_CAM_ROTATION_OVERRIDE;
  }

  let resolved: 0 | 90 | 180 | 270 | null = null;
  let source = 'none';

  if (orientation && orientation in ROTATION_MAP) {
    resolved = ROTATION_MAP[orientation];
    source = 'photo.orientation';
  } else if (exifOrientation !== undefined && exifOrientation in EXIF_ROTATION_MAP) {
    resolved = EXIF_ROTATION_MAP[exifOrientation];
    source = 'EXIF';
  }

  // Dimension sanity check: does the resolved rotation actually produce a
  // portrait (taller-than-wide) logical frame? Front-facing handheld shots
  // should be portrait. If resolved rotation says "0 or 180" but the raw
  // buffer is wider than tall (or vice versa), the orientation source is
  // very likely wrong for this device/build — flag it loudly rather than
  // silently trusting a source that disagrees with the actual pixels.
  const bufferIsLandscape = srcW > srcH;
  const rotationClaimsNoSwap = resolved === 0 || resolved === 180 || resolved === null;
  const mismatch = bufferIsLandscape === rotationClaimsNoSwap; // landscape buffer but "no swap" claimed, or portrait buffer but swap claimed... see log below for exact reasoning printed per-frame

  if (resolved === null) {
    console.warn(
      `[SignTranslator] could not determine rotation from photo.orientation="${orientation}" ` +
      `or EXIF=${exifOrientation}, buffer=${srcW}x${srcH} — defaulting to 0°. ` +
      `If detection looks wrong on this device, capture this log + device model.`
    );
    return 0;
  }

  console.log(
    `[SignTranslator] rotation resolved=${resolved}° (source=${source}), ` +
    `buffer=${srcW}x${srcH} (${bufferIsLandscape ? 'landscape' : 'portrait'}), ` +
    `dimension check ${mismatch ? 'DISAGREES — verify on this device' : 'consistent'}`
  );

  return resolved;
}

// ─── Center-crop + rotation correction + resize to INPUT_SIZE×INPUT_SIZE ──────
// rotationDeg = how many degrees the raw buffer is rotated AWAY from upright.
// mirror = whether to additionally flip horizontally AFTER rotation
// correction (front camera selfie-mirror). Rotation and mirror are two
// independent, composable steps — neither special-cases the other, so the
// mirror can't silently vanish depending on which rotationDeg comes in.
function resizeToFloat32(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  channels: 3 | 4,
  rotationDeg: 0 | 90 | 180 | 270 = 0,
  mirror: boolean = false,
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
      // Logical pixel in the correctly-oriented (upright) frame, BEFORE mirror
      let lx = Math.min(Math.floor(x * scale) + cropX0, logW - 1);
      const ly = Math.min(Math.floor(y * scale) + cropY0, logH - 1);

      // Apply mirror as an independent step on the upright logical frame,
      // regardless of which rotation case applies below.
      if (mirror) {
        lx = logW - 1 - lx;
      }

      // Map logical (upright, post-mirror) → physical coords in the raw buffer
      let px: number, py: number;
      if (rotationDeg === 90) {
        // Raw buffer is rotated 90° CW relative to upright → undo
        px = srcW - 1 - ly;
        py = lx;
      } else if (rotationDeg === 270) {
        px = ly;
        py = srcH - 1 - lx;
      } else if (rotationDeg === 180) {
        px = srcW - 1 - lx;
        py = srcH - 1 - ly;
      } else {
        px = lx;
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

      // 2. Capture raw orientation signals (resolved into a rotation value
      //    after decode, once we know the actual buffer dimensions — see
      //    step 3b below, which needs srcW/srcH for the sanity check).
      const rawOrientation: string | undefined = (photo as any).orientation;
      const exifOrientation: number | undefined =
        (photo as any).metadata?.Orientation ?? (photo as any).metadata?.orientation;
      console.log(
        `[SignTranslator] raw orientation inputs — photo.orientation="${rawOrientation}", ` +
        `photo.metadata.Orientation=${exifOrientation}, ` +
        `photo.width=${(photo as any).width}, photo.height=${(photo as any).height}`
      );

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

      // 3b. Resolve rotation now that we have real buffer dimensions to
      //     sanity-check the orientation source against.
      const rotationDeg = getRotationDeg(rawOrientation, exifOrientation, srcW, srcH);
      console.log(`[SignTranslator] resolved rotationDeg=${rotationDeg}, mirror=${MIRROR_FRONT_CAMERA}`);

      // 4. Resize → 640×640 float32 [0–1], with rotation + mirror correction.
      //    Front camera is always mirrored (selfie UX / training data
      //    convention) — this is now independent of rotationDeg, see
      //    MIRROR_FRONT_CAMERA above.
      const float32Input = resizeToFloat32(
        srcPixels, srcW, srcH, inferredChannels, rotationDeg, MIRROR_FRONT_CAMERA
      );

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