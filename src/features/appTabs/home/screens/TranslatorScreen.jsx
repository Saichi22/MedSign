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
import { useSignDetector, NUM_CLASSES, NUM_ANCHORS, CONFIDENCE_THRESHOLD } from '../../../../hooks/useSignDetector';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/TranslatorScreenStyle';

const FRAME_INTERVAL_MS = 2000;
const MODEL_WIDTH = 640;
const MODEL_HEIGHT = 640;
const TOP_K_ANCHORS = 5;

export default function TranslatorScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const { resize } = useResizePlugin();
  const { state: modelState, isReady, prediction, reset, runInference } = useSignDetector();
  const modelReady = isReady;
  const [isActive, setIsActive] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const runInferenceRef = useRef(runInference);
  useEffect(() => { runInferenceRef.current = runInference; }, [runInference]);

  const isReadyRef = useRef(isReady);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);

  // Bridge now receives only 48 floats (class scores), not 1.2M pixels.
  // Plain number[] crosses the worklet bridge cheaply.
  const runOnJS = useRef(
    Worklets.createRunOnJS((classScores: number[]) => {
      if (!isReadyRef.current) return;
      runInferenceRef.current?.(classScores);
    }),
  ).current;

  const lastFrameTsRef = useRef(0);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';

      const now = Date.now();
      if (now - lastFrameTsRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTsRef.current = now;

      try {
        const resized = resize(frame, {
          scale: { width: MODEL_WIDTH, height: MODEL_HEIGHT },
          pixelFormat: 'rgb',
          dataType: 'float32',
          normalize: { mean: [0, 0, 0], std: [255, 255, 255] },
        });

        if (resized == null) return;

        // ── Extract top-K per class scores HERE in the worklet ──
        // This keeps all 403,200-iteration work off the JS thread entirely.
        // We send only 48 numbers across the bridge instead of 1.2M.
        const classScores: number[] = [];
        let frameMax = 0;

        for (let c = 0; c < NUM_CLASSES; c++) {
          // Linear scan for top-K anchors for this class
          let k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0; // top-5 unrolled
          for (let a = 0; a < NUM_ANCHORS; a++) {
            const s = resized[(4 + c) * NUM_ANCHORS + a] ?? 0;
            if (s > k0) { k4 = k3; k3 = k2; k2 = k1; k1 = k0; k0 = s; }
            else if (s > k1) { k4 = k3; k3 = k2; k2 = k1; k1 = s; }
            else if (s > k2) { k4 = k3; k3 = k2; k2 = s; }
            else if (s > k3) { k4 = k3; k3 = s; }
            else if (s > k4) { k4 = s; }
          }
          const avg = (k0 + k1 + k2 + k3 + k4) / TOP_K_ANCHORS;
          classScores[c] = avg;
          if (avg > frameMax) frameMax = avg;
        }

        // Gate: if nothing clears threshold, send an empty array as a
        // "no hand" signal so JS can clear the prediction without any work.
        if (frameMax < CONFIDENCE_THRESHOLD) {
          runOnJS([]);
          return;
        }

        runOnJS(classScores);
      } catch (e) {
        console.log('[Worklet] ERROR:', String(e));
      }
    },
    [runOnJS],
  );

  useEffect(() => {
    if (!prediction || !isActive) return;
    setHistory(prev =>
      [{ ...prediction, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5),
    );
  }, [prediction, isActive]);

  const handleToggle = useCallback(() => {
    setIsActive(prev => {
      if (prev) { reset(); setHistory([]); }
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!modelReady && (
          <View style={[styles.bannerCard, modelState === 'error' && styles.bannerCardError]}>
            <MaterialCommunityIcons
              name={modelState === 'error' ? 'alert-circle-outline' : 'clock-outline'}
              size={16}
              color={modelState === 'error' ? COLOR.red : COLOR.amber}
            />
            <Text style={[styles.bannerText, modelState === 'error' && styles.bannerTextError]}>
              {modelState === 'error' ? 'Model configuration runtime asset missing' : 'Loading detection model…'}
            </Text>
          </View>
        )}

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
            />
            <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
          </View>
        </View>

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

        {history.length > 0 && (
          <>
            <Text style={styles.sectionLabelSpaced}>RECENT SIGNS</Text>
            <View style={styles.card}>
              {history.slice(0, 2).map((h, i) => (
                <View key={i} style={[styles.historyRow, i < history.length - 1 && styles.historyRowBorder]}>
                  <View style={[styles.historyIconWrap, h.isMedical && styles.historyIconMedical]}>
                    <MaterialCommunityIcons
                      name={h.isMedical ? 'medical-bag' : 'hand-wave'}
                      size={15}
                      color={h.isMedical ? COLOR.amber : COLOR.tealBright}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.historySign}>{h.label}</Text>
                    {h.isMedical && <Text style={styles.historyMedicalLabel}>Medical Sign</Text>}
                  </View>
                  <Text style={styles.historyTime}>{h.ts}</Text>
                </View>
              ))}
            </View>
          </>
        )}

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