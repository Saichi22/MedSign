import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets } from 'react-native-worklets-core';
import { useSignDetector } from '../../../../hooks/useSignDetector';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/TranslatorScreenStyle';

// ── Tune this if detection feels laggy or misses signs ────────────────────
const FRAME_INTERVAL_MS = 800;

const MODEL_WIDTH = 224;
const MODEL_HEIGHT = 224;
const MODEL_CHANNELS = 3;
const EXPECTED_SIZE = MODEL_WIDTH * MODEL_HEIGHT * MODEL_CHANNELS; // 150,528

export default function TranslatorScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const { resize } = useResizePlugin();

  const {
    state: modelState,
    isReady,
    prediction,
    debugInfo,    // ← on-screen debug data
    reset,
    runInference,
  } = useSignDetector();

  const modelReady = isReady;

  const [isActive, setIsActive] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // ── Debug controls ─────────────────────────────────────────────────────────
  const [showDebug, setShowDebug] = useState(true);

  // ── FIX 1: Normalization mode ──────────────────────────────────────────────
  // MobileNetV2 was trained expecting [-1, 1] range.
  // true  = [-1, 1]  ← START HERE (most likely correct for MobileNetV2)
  // false = [0, 1]   ← try this if [-1,1] gives all-wrong predictions
  const [useNeg11Norm, setUseNeg11Norm] = useState(true);

  // ── FIX 2: Horizontal flip ─────────────────────────────────────────────────
  // Default OFF — training data was almost certainly collected without flipping.
  // Enable if signs are mirrored / consistently wrong in a left-right way.
  const [flipEnabled, setFlipEnabled] = useState(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const runInferenceRef = useRef(runInference);
  useEffect(() => { runInferenceRef.current = runInference; }, [runInference]);

  const isReadyRef = useRef(isReady);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);

  const runOnJS = useRef(
    Worklets.createRunOnJS((dataPayload: number[]) => {
      if (!isReadyRef.current) return;
      runInferenceRef.current?.(dataPayload);
    }),
  ).current;

  const lastFrameTsRef = useRef(0);

  // ── Frame processor ────────────────────────────────────────────────────────
  // NOTE: useNeg11Norm and flipEnabled are captured in the worklet closure.
  // The processor is recreated automatically when either value changes.
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      if (!isReadyRef.current) return;

      const now = Date.now();
      if (now - lastFrameTsRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTsRef.current = now;

      // ── FIX 1 applied: normalization ───────────────────────────────────────
      // [-1, 1]: mean=127.5, std=127.5  →  (pixel - 127.5) / 127.5
      // [ 0, 1]: mean=0,     std=255    →   pixel / 255
      const resized = resize(frame, {
        scale: { width: MODEL_WIDTH, height: MODEL_HEIGHT },
        pixelFormat: 'rgb',
        dataType: 'float32',
        normalize: useNeg11Norm
          ? { mean: [127.5, 127.5, 127.5], std: [127.5, 127.5, 127.5] }
          : { mean: [0, 0, 0],             std: [255, 255, 255] },
      });

      if (resized == null) return;

      const plainArray = new Array(EXPECTED_SIZE);

      if (flipEnabled) {
        // ── Horizontal mirror (only enable if signs look flipped) ────────────
        for (let y = 0; y < MODEL_HEIGHT; y++) {
          for (let x = 0; x < MODEL_WIDTH; x++) {
            const srcX = MODEL_WIDTH - 1 - x;
            for (let c = 0; c < MODEL_CHANNELS; c++) {
              const dstIdx = (y * MODEL_WIDTH + x) * MODEL_CHANNELS + c;
              const srcIdx = (y * MODEL_WIDTH + srcX) * MODEL_CHANNELS + c;
              plainArray[dstIdx] = resized[srcIdx] ?? 0.0;
            }
          }
        }
      } else {
        // ── FIX 2 applied: straight copy, no flip ───────────────────────────
        for (let i = 0; i < EXPECTED_SIZE; i++) {
          plainArray[i] = resized[i] ?? 0.0;
        }
      }

      runOnJS(plainArray);
    },
    // Recreate the processor when norm mode or flip changes
    [runOnJS, useNeg11Norm, flipEnabled],
  );

  useEffect(() => {
    if (!prediction || !isActive) return;
    setHistory(prev =>
      [{ ...prediction, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5),
    );
  }, [prediction, isActive]);

  const handleToggle = useCallback(() => {
    setIsActive(prev => {
      if (prev) {
        reset();
        setHistory([]);
      }
      return !prev;
    });
  }, [reset]);

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

  // ── Pixel range tells us if normalization is correct ──────────────────────
  // Expected ranges:
  //   [-1, 1] mode  →  minPixel ≈ -1.0, maxPixel ≈ 1.0
  //   [0,  1] mode  →  minPixel ≈  0.0, maxPixel ≈ 1.0
  const normOk = debugInfo
    ? (useNeg11Norm
        ? debugInfo.minPixel < -0.3          // confirm negative values present
        : debugInfo.minPixel >= -0.05)        // confirm no negative values
    : null;

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
          <View style={[styles.liveBadge, isActive && styles.liveBadgeActive]}>
            <View style={[styles.liveDot, isActive && styles.liveDotActive]} />
            <Text style={[styles.liveText, isActive && styles.liveTextActive]}>
              {isActive ? 'LIVE' : 'IDLE'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Model loading banner ── */}
        {!modelReady && (
          <View style={[styles.bannerCard, modelState === 'error' && styles.bannerCardError]}>
            <MaterialCommunityIcons
              name={modelState === 'error' ? 'alert-circle-outline' : 'clock-outline'}
              size={16}
              color={modelState === 'error' ? COLOR.red : COLOR.amber}
            />
            <Text style={[styles.bannerText, modelState === 'error' && styles.bannerTextError]}>
              {modelState === 'error'
                ? 'Model asset missing'
                : 'Loading detection model…'}
            </Text>
          </View>
        )}

        {/* ── Viewfinder card ── */}
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
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              frameProcessor={isActive ? frameProcessor : undefined}
              pixelFormat="rgb"
            />
            <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
          </View>
        </View>

        {/* ── Current prediction card ── */}
        {prediction ? (
          <View style={[styles.card, prediction.isMedical && styles.cardMedical]}>
            <Text style={styles.sectionLabel}>CURRENT SIGN</Text>
            <Text style={styles.predictionLabel}>{prediction.label}</Text>
            <View style={styles.predictionMeta}>
              <Text style={styles.predictionConf}>{prediction.confidence}% confidence</Text>
              {prediction.isMedical && (
                <View style={styles.medicalTag}>
                  <MaterialCommunityIcons name="medical-bag" size={12} color={COLOR.amber} />
                  <Text style={styles.medicalTagText}>Medical Sign</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.outputBox}>
            <Text style={styles.sectionLabel}>TRANSLATION OUTPUT</Text>
            <Text style={styles.outputTextMuted}>
              {isActive ? 'Listening for signs…' : 'Start a session to see translations'}
            </Text>
          </View>
        )}

        {/* ── History ── */}
        {history.length > 0 && (
          <>
            <Text style={styles.sectionLabelSpaced}>RECENT SIGNS</Text>
            <View style={styles.card}>
              {history.map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.historyRow,
                    i < history.length - 1 && styles.historyRowBorder,
                  ]}
                >
                  <View style={[styles.historyIconWrap, h.isMedical && styles.historyIconMedical]}>
                    <MaterialCommunityIcons
                      name={h.isMedical ? 'medical-bag' : 'sign-language'}
                      size={15}
                      color={h.isMedical ? COLOR.amber : COLOR.tealBright}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.historySign}>{h.label}</Text>
                    {h.isMedical && (
                      <Text style={styles.historyMedicalLabel}>Medical Sign</Text>
                    )}
                  </View>
                  <Text style={styles.historyTime}>{h.ts}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            ON-SCREEN DEBUG PANEL — remove this entire block before release
            ════════════════════════════════════════════════════════════════════ */}
        <TouchableOpacity
          style={dbg.header}
          onPress={() => setShowDebug(v => !v)}
          activeOpacity={0.7}
        >
          <Text style={dbg.headerText}>
            {showDebug ? '▾ Hide debug' : '▸ Show debug'}
          </Text>
          {debugInfo && (
            <Text style={[
              dbg.badge,
              { backgroundColor: debugInfo.belowThreshold ? '#854f0b' : '#0f6e56' }
            ]}>
              {debugInfo.belowThreshold
                ? `${debugInfo.bestPct}% (below threshold)`
                : `${debugInfo.bestPct}% ${debugInfo.bestLabel}`}
            </Text>
          )}
        </TouchableOpacity>

        {showDebug && (
          <View style={dbg.panel}>

            {/* ── Normalization toggle ── */}
            <Text style={dbg.section}>NORMALIZATION</Text>
            <View style={dbg.row}>
              <TouchableOpacity
                style={[dbg.btn, useNeg11Norm && dbg.btnActive]}
                onPress={() => setUseNeg11Norm(true)}
              >
                <Text style={[dbg.btnText, useNeg11Norm && dbg.btnTextActive]}>
                  [-1, 1]{'\n'}MobileNetV2 standard
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[dbg.btn, !useNeg11Norm && dbg.btnActive]}
                onPress={() => setUseNeg11Norm(false)}
              >
                <Text style={[dbg.btnText, !useNeg11Norm && dbg.btnTextActive]}>
                  [0, 1]{'\n'}Divide by 255
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Flip toggle ── */}
            <Text style={dbg.section}>HORIZONTAL FLIP</Text>
            <View style={dbg.row}>
              <TouchableOpacity
                style={[dbg.btn, !flipEnabled && dbg.btnActive]}
                onPress={() => setFlipEnabled(false)}
              >
                <Text style={[dbg.btnText, !flipEnabled && dbg.btnTextActive]}>
                  OFF{'\n'}(default)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[dbg.btn, flipEnabled && dbg.btnActive]}
                onPress={() => setFlipEnabled(true)}
              >
                <Text style={[dbg.btnText, flipEnabled && dbg.btnTextActive]}>
                  ON{'\n'}(mirrored)
                </Text>
              </TouchableOpacity>
            </View>

            {debugInfo ? (
              <>
                {/* ── Pixel range — tells you if normalization is working ── */}
                <Text style={dbg.section}>PIXEL RANGE (first 600 values)</Text>
                <View style={dbg.infoRow}>
                  <Text style={dbg.key}>min / max</Text>
                  <Text style={[
                    dbg.val,
                    normOk === true  && { color: '#5dcaa5' },
                    normOk === false && { color: '#f0997b' },
                  ]}>
                    {debugInfo.minPixel} / {debugInfo.maxPixel}
                    {normOk === true  ? '  ✓' : ''}
                    {normOk === false ? '  ✗ wrong norm?' : ''}
                  </Text>
                </View>
                <Text style={dbg.hint}>
                  {useNeg11Norm
                    ? 'Expect: min ≈ −1.0, max ≈ 1.0'
                    : 'Expect: min ≈ 0.0,  max ≈ 1.0'}
                </Text>

                {/* ── Center pixel sample ── */}
                <View style={dbg.infoRow}>
                  <Text style={dbg.key}>center R/G/B</Text>
                  <Text style={dbg.val}>
                    {debugInfo.sampleR} / {debugInfo.sampleG} / {debugInfo.sampleB}
                  </Text>
                </View>

                {/* ── Model health ── */}
                <Text style={dbg.section}>MODEL</Text>
                <View style={dbg.infoRow}>
                  <Text style={dbg.key}>output classes</Text>
                  <Text style={[dbg.val, debugInfo.outputClasses === 36 ? { color: '#5dcaa5' } : { color: '#f0997b' }]}>
                    {debugInfo.outputClasses} {debugInfo.outputClasses === 36 ? '✓' : '✗ expected 36'}
                  </Text>
                </View>
                <View style={dbg.infoRow}>
                  <Text style={dbg.key}>frames processed</Text>
                  <Text style={dbg.val}>{debugInfo.frameCount}</Text>
                </View>

                {/* ── Top 5 predictions ── */}
                <Text style={dbg.section}>TOP 5 PREDICTIONS</Text>
                {debugInfo.top5.map((t, i) => (
                  <View key={i} style={dbg.barRow}>
                    <Text style={[dbg.barLabel, i === 0 && { color: '#5dcaa5', fontWeight: '600' }]}>
                      {t.label}
                    </Text>
                    <View style={dbg.barTrack}>
                      <View style={[
                        dbg.barFill,
                        { width: `${t.pct}%` },
                        i === 0 && { backgroundColor: '#1d9e75' },
                      ]} />
                    </View>
                    <Text style={[dbg.barPct, i === 0 && { color: '#5dcaa5' }]}>
                      {t.pct}%
                    </Text>
                  </View>
                ))}

                <Text style={dbg.hint}>
                  Threshold: {Math.round(0.30 * 100)}% — best is {debugInfo.belowThreshold ? 'BELOW' : 'ABOVE'} it
                </Text>
              </>
            ) : (
              <Text style={dbg.hint}>
                {isActive ? 'Waiting for first frame…' : 'Start a session to see debug data'}
              </Text>
            )}
          </View>
        )}
        {/* ════════════════════════════════════════════════════════════════════ */}

        {/* ── CTA ── */}
        <TouchableOpacity
          style={[styles.primaryBtn, isActive && styles.stopBtn]}
          onPress={handleToggle}
          disabled={!modelReady}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={isActive ? 'stop-circle-outline' : 'camera-outline'}
            size={20}
            color={isActive ? COLOR.red : COLOR.tealDeep}
          />
          <Text style={[styles.primaryBtnText, isActive && styles.stopBtnText]}>
            {isActive ? 'Stop Session' : modelReady ? 'Start Translation' : 'Loading model…'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Debug panel styles (self-contained, won't clash with your theme) ────────
const dbg = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    marginHorizontal: 2,
  },
  headerText: {
    color: '#5dcaa5',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  badge: {
    fontSize: 11,
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  panel: {
    backgroundColor: '#0d0d1a',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 2,
    marginBottom: 8,
  },
  section: {
    color: '#5dcaa5',
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  btnActive: {
    borderColor: '#1d9e75',
    backgroundColor: '#0a2a1e',
  },
  btnText: {
    color: '#5a5a8a',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  btnTextActive: {
    color: '#5dcaa5',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  key: {
    color: '#5a5a8a',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  val: {
    color: '#ccc',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  hint: {
    color: '#3a3a6a',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
    fontStyle: 'italic',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    gap: 6,
  },
  barLabel: {
    width: 88,
    color: '#8a8aaa',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 14,
    backgroundColor: '#1a1a3a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 14,
    backgroundColor: '#2a5a8a',
    borderRadius: 3,
  },
  barPct: {
    width: 36,
    color: '#8a8aaa',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'right',
  },
});