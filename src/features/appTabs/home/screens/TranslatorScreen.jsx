// src/features/appTabs/home/screens/TranslatorScreen.jsx
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
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

const { width: SCREEN_W } = Dimensions.get('window');

const COLOR = {
  tealDeep:   '#0D4F5C',
  tealBright: '#7EDDE3',
  tealLight:  '#B2EEF1',
  white:      '#FFFFFF',
  overlay:    'rgba(13,79,92,0.82)',
  red:        '#EF4444',
  amber:      '#F59E0B',
  green:      '#10B981',
};

export default function TranslatorScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const { resize } = useResizePlugin();
  const { state: modelState, isReady, prediction, runInference } = useSignDetector();
  const modelReady = isReady;

  const [isActive, setIsActive] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  /**
   * FIX — THE FREEZE ROOT CAUSE:
   *
   * Worklets.createRunOnJS() allocates a native JSI function object.
   * Putting it inside useCallback means a NEW native object is created on
   * every render where [runInference] changes — but more critically, the
   * old one is not immediately released, and the worklet thread may still
   * hold a reference to it, causing a data race that blocks the JS thread.
   *
   * The correct pattern is:
   *   1. Keep a stable ref to runInference (updated via useEffect, never
   *      triggers a re-render).
   *   2. Call createRunOnJS ONCE at mount, pointing at a wrapper that reads
   *      from the ref — so the JSI object is created once and never replaced
   *      while the camera is open.
   */
  const runInferenceRef = useRef(runInference);
  useEffect(() => {
    runInferenceRef.current = runInference;
  }, [runInference]);

  // Created ONCE at mount — the worklet always calls the same JSI function.
  // The ref wrapper means it always uses the latest runInference internally.
  const runOnJS = useRef(
    Worklets.createRunOnJS((buffer) => {
      runInferenceRef.current?.(buffer);
    }),
  ).current;

  // History update
  useEffect(() => {
    if (!prediction || !isActive) return;
    setHistory(prev =>
      [{ ...prediction, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5),
    );
  }, [prediction, isActive]);

  // Frame processor — worklet thread. Only resize + hand off; no inference here.
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      if (!isActive || !isReady) return;

      const resized = resize(frame, {
        scale: { width: 224, height: 224 },
        pixelFormat: 'rgb',
        dataType: 'float32',
        normalize: { mean: [0, 0, 0], std: [255, 255, 255] },
      });

      runOnJS(resized);
    },
    // runOnJS is stable (ref.current); isReady and isActive are primitives — safe
    [isActive, isReady, runOnJS],
  );

  const handleToggle = useCallback(() => {
    setIsActive(prev => {
      if (prev) setHistory([]);
      return !prev;
    });
  }, []);

  if (!hasPermission) {
    return (
      <View style={styles.centeredFill}>
        <MaterialCommunityIcons name="camera-off" size={48} color={COLOR.tealLight} />
        <Text style={styles.permText}>Camera permission is required.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centeredFill}>
        <MaterialCommunityIcons name="camera-off" size={48} color={COLOR.tealLight} />
        <Text style={styles.permText}>No camera device found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={isActive ? frameProcessor : undefined}
        frameProcessorFps={5}
        pixelFormat="yuv"
      />

      <View style={styles.bracketWrap} pointerEvents="none">
        <View style={[styles.corner, styles.TL]} />
        <View style={[styles.corner, styles.TR]} />
        <View style={[styles.corner, styles.BL]} />
        <View style={[styles.corner, styles.BR]} />
      </View>

      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Sign Translator</Text>
        <View style={[styles.statusPill, isActive ? styles.pillActive : styles.pillIdle]}>
          <View style={[styles.dot, isActive ? styles.dotActive : styles.dotIdle]} />
          <Text style={styles.pillText}>{isActive ? 'LIVE' : 'IDLE'}</Text>
        </View>
      </View>

      {!modelReady && (
        <View style={[styles.modelBanner, modelState === 'error' && styles.modelBannerError]}>
          <Text style={styles.modelBannerText}>
            {modelState === 'error' ? '❌ Model failed to load' : '⏳ Loading model…'}
          </Text>
        </View>
      )}

      {isActive && prediction && (
        <View style={[styles.predictionBadge, prediction.isMedical && styles.predictionMedical]}>
          <Text style={styles.predictionLabel}>{prediction.label}</Text>
          <Text style={styles.predictionConf}>{prediction.confidence}% confidence</Text>
          {prediction.isMedical && (
            <View style={styles.medicalTag}>
              <MaterialCommunityIcons name="medical-bag" size={12} color={COLOR.amber} />
              <Text style={styles.medicalTagText}>Medical Sign</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.bottomPanel}>
        {history.length > 0 && (
          <View style={styles.historyStrip}>
            {history.map((h, i) => (
              <View key={i} style={[styles.historyChip, h.isMedical && styles.historyChipMedical]}>
                <Text style={styles.historyChipText}>{h.label}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionBtn, isActive && styles.actionBtnStop]}
          onPress={handleToggle}
          disabled={!modelReady}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={isActive ? 'stop-circle-outline' : 'camera-outline'}
            size={22}
            color={isActive ? COLOR.red : COLOR.tealDeep}
          />
          <Text style={[styles.actionBtnText, isActive && styles.actionBtnTextStop]}>
            {isActive ? 'Stop' : modelReady ? 'Start Translation' : 'Loading model…'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#000' },
  centeredFill: { flex: 1, backgroundColor: COLOR.tealDeep, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText:     { color: COLOR.white, fontSize: 16, textAlign: 'center', marginVertical: 16 },
  permBtn:      { backgroundColor: COLOR.tealBright, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText:  { color: COLOR.tealDeep, fontWeight: '700', fontSize: 15 },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14,
    backgroundColor: COLOR.overlay,
  },
  topTitle:   { color: COLOR.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  pillActive: { backgroundColor: 'rgba(16,185,129,0.25)', borderWidth: 1, borderColor: COLOR.green },
  pillIdle:   { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  dot:        { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  dotActive:  { backgroundColor: COLOR.green },
  dotIdle:    { backgroundColor: 'rgba(255,255,255,0.5)' },
  pillText:   { color: COLOR.white, fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  modelBanner:       { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  modelBannerError:  { backgroundColor: 'rgba(239,68,68,0.85)' },
  modelBannerText:   { color: '#000', fontSize: 13, fontWeight: '600' },

  bracketWrap: { ...StyleSheet.absoluteFillObject, margin: 40 },
  corner:      { position: 'absolute', width: 28, height: 28, borderColor: COLOR.tealBright, borderWidth: 2.5 },
  TL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  TR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  BL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  BR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  predictionBadge:   { position: 'absolute', alignSelf: 'center', bottom: 195, backgroundColor: 'rgba(13,79,92,0.92)', borderRadius: 18, paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLOR.tealBright, minWidth: 180 },
  predictionMedical: { borderColor: COLOR.amber },
  predictionLabel:   { color: COLOR.white, fontSize: 36, fontWeight: '800', letterSpacing: 1 },
  predictionConf:    { color: COLOR.tealLight, fontSize: 13, marginTop: 2 },
  medicalTag:        { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  medicalTagText:    { color: COLOR.amber, fontSize: 12, fontWeight: '600' },

  bottomPanel:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLOR.overlay, paddingBottom: 32, paddingTop: 14, paddingHorizontal: 20, alignItems: 'center' },
  historyStrip:       { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'center' },
  historyChip:        { backgroundColor: 'rgba(126,221,227,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(126,221,227,0.35)' },
  historyChipMedical: { borderColor: 'rgba(245,158,11,0.5)', backgroundColor: 'rgba(245,158,11,0.10)' },
  historyChipText:    { color: COLOR.tealLight, fontSize: 13, fontWeight: '600' },

  actionBtn:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLOR.tealBright, borderRadius: 16, paddingHorizontal: 32, paddingVertical: 15, width: SCREEN_W - 40, justifyContent: 'center' },
  actionBtnStop:     { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1.5, borderColor: COLOR.red },
  actionBtnText:     { color: COLOR.tealDeep, fontSize: 16, fontWeight: '700' },
  actionBtnTextStop: { color: COLOR.red },
});