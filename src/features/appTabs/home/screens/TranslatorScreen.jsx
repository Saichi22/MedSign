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

const FRAME_INTERVAL_MS = 2000;

// ── besta_float16.tflite: YOLOv8n
//    Input tensor shape: [1, 640, 640, 3]  — NHWC, float32
// ──────────────────────────────────────────────────────────────────────────────
const MODEL_WIDTH = 640;
const MODEL_HEIGHT = 640;
const MODEL_CHANNELS = 3;
const EXPECTED_SIZE = MODEL_WIDTH * MODEL_HEIGHT * MODEL_CHANNELS; // 1,228,800

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

  // ── Stable JS bridge — created once, refs keep it current ──
  const runOnJS = useRef(
    Worklets.createRunOnJS((dataPayload: number[]) => {
      if (!isReadyRef.current) return;
      runInferenceRef.current?.(dataPayload);
    }),
  ).current;

  const lastFrameTsRef = useRef(0);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      if (!isReadyRef.current) return;

      const now = Date.now();
      if (now - lastFrameTsRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTsRef.current = now;

      // Resize frame to 640×640 NHWC float32, normalized to [0, 1]
      const resized = resize(frame, {
        scale: { width: MODEL_WIDTH, height: MODEL_HEIGHT },
        pixelFormat: 'rgb',
        dataType: 'float32',
        normalize: { mean: [0, 0, 0], std: [255, 255, 255] },
      });

      if (resized != null) {
        // Mirror horizontally (front camera flip correction)
        const plainArray = new Array(EXPECTED_SIZE);
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
        runOnJS(plainArray);
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
                ? 'Model failed to load — check that besta_float16.tflite is in assets'
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
          <View style={[styles.card, prediction.isPhrase && styles.cardMedical]}>
            <Text style={styles.sectionLabel}>CURRENT SIGN</Text>
            <Text style={styles.predictionLabel}>{prediction.label}</Text>
            <View style={styles.predictionMeta}>
              <Text style={styles.predictionConf}>{prediction.confidence}% confidence</Text>
              {prediction.isPhrase && (
                <View style={styles.medicalTag}>
                  <MaterialCommunityIcons name="hand-wave" size={12} color={COLOR.amber} />
                  <Text style={styles.medicalTagText}>Phrase Sign</Text>
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
                  <View style={[styles.historyIconWrap, h.isPhrase && styles.historyIconMedical]}>
                    <MaterialCommunityIcons
                      name={h.isPhrase ? 'hand-wave' : 'sign-language'}
                      size={15}
                      color={h.isPhrase ? COLOR.amber : COLOR.tealBright}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.historySign}>{h.label}</Text>
                    {h.isPhrase && (
                      <Text style={styles.historyMedicalLabel}>Phrase Sign</Text>
                    )}
                  </View>
                  <Text style={styles.historyTime}>{h.ts}</Text>
                </View>
              ))}
            </View>
          </>
        )}

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