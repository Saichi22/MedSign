// src/features/appTabs/home/screens/TranslatorScreen.jsx
import React, { useRef, useEffect, useState } from 'react';
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
import { loadTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets } from 'react-native-worklets-core';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const MODEL_ASSET = require('../../../../assets/sign_model.tflite');

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  SET YOUR PC'S LOCAL IP HERE (run `ipconfig`, look for WiFi IPv4 Address)
//     e.g. '192.168.1.5'  — phone and PC must be on the same WiFi network
// ─────────────────────────────────────────────────────────────────────────────
const DEV_PC_IP = '192.168.1.52';

const LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Tumutusok','Lalamunan','Mahirap','Masakit','Nagtatae',
  'Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
];

const MEDICAL_START = 26;
const CONFIDENCE_THRESHOLD = 0.70;
const DEBOUNCE_MS = 500;
const { width: SCREEN_W } = Dimensions.get('window');

const COLOR = {
  tealDeep:  '#0D4F5C',
  tealBright:'#7EDDE3',
  tealLight: '#B2EEF1',
  white:     '#FFFFFF',
  overlay:   'rgba(13,79,92,0.82)',
  red:       '#EF4444',
  amber:     '#F59E0B',
  green:     '#10B981',
};

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - max));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum);
}

export default function TranslatorScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const { resize } = useResizePlugin();

  const [modelState, setModelState] = useState({ state: 'loading', model: null });
  const modelReady = modelState.state === 'loaded';

useEffect(() => {
  async function loadModel() {
    try {
      const m = await loadTensorflowModel(MODEL_ASSET);
      console.log('Model loaded successfully!');
      setModelState({ state: 'loaded', model: m });
    } catch (e) {
      console.error('Model load failed:', e?.message ?? e);
      setModelState({ state: 'error', model: null });
    }
  }
  loadModel();
}, []);

  const [isActive, setIsActive]     = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [history, setHistory]       = useState([]);
  const lastUpdateRef               = useRef(0);

  const onPrediction = Worklets.createRunOnJS((label, confidence) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < DEBOUNCE_MS) return;
    lastUpdateRef.current = now;
    const isMedical = LABELS.indexOf(label) >= MEDICAL_START;
    setPrediction({ label, confidence, isMedical });
    setHistory(prev => {
      const next = [{ label, confidence, isMedical, ts: new Date().toLocaleTimeString() }, ...prev];
      return next.slice(0, 5);
    });
  });

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (!isActive || !modelState.model) return;

      const resized = resize(frame, {
        scale: { width: 224, height: 224 },
        pixelFormat: 'rgb',
        dataType: 'float32',
        normalize: { mean: [0, 0, 0], std: [255, 255, 255] },
      });

      const outputs = modelState.model.runSync([resized]);
      const logits  = Array.from(outputs[0]);
      const probs   = softmax(logits);

      let bestIdx = 0;
      let bestVal = probs[0];
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > bestVal) { bestVal = probs[i]; bestIdx = i; }
      }

      if (bestVal >= CONFIDENCE_THRESHOLD) {
        onPrediction(LABELS[bestIdx], Math.round(bestVal * 100));
      }
    },
    [isActive, modelState.model],
  );

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

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
        frameProcessor={frameProcessor}
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
        <View style={[styles.modelBanner, modelState.state === 'error' && styles.modelBannerError]}>
          <Text style={styles.modelBannerText}>
            {modelState.state === 'error'
              ? '❌ Model failed to load'
              : '⏳ Loading model…'}
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
            {history.slice(0, 5).map((h, i) => (
              <View key={i} style={[styles.historyChip, h.isMedical && styles.historyChipMedical]}>
                <Text style={styles.historyChipText}>{h.label}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionBtn, isActive && styles.actionBtnStop]}
          onPress={() => {
            setIsActive(v => !v);
            if (isActive) setPrediction(null);
          }}
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

  modelBanner:      { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  modelBannerError: { backgroundColor: 'rgba(239,68,68,0.85)' },
  modelBannerText:  { color: '#000', fontSize: 13, fontWeight: '600' },

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

  bottomPanel:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLOR.overlay, paddingBottom: 32, paddingTop: 14, paddingHorizontal: 20, alignItems: 'center' },
  historyStrip:      { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'center' },
  historyChip:       { backgroundColor: 'rgba(126,221,227,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(126,221,227,0.35)' },
  historyChipMedical:{ borderColor: 'rgba(245,158,11,0.5)', backgroundColor: 'rgba(245,158,11,0.10)' },
  historyChipText:   { color: COLOR.tealLight, fontSize: 13, fontWeight: '600' },

  actionBtn:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLOR.tealBright, borderRadius: 16, paddingHorizontal: 32, paddingVertical: 15, width: SCREEN_W - 40, justifyContent: 'center' },
  actionBtnStop:     { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1.5, borderColor: COLOR.red },
  actionBtnText:     { color: COLOR.tealDeep, fontSize: 16, fontWeight: '700' },
  actionBtnTextStop: { color: COLOR.red },
});