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

// How often (in ms) we pull a frame from the camera and run inference.
// 2000ms = at most one detection attempt every 2 seconds, which keeps
// the JS thread from being overwhelmed while still feeling responsive.
const FRAME_INTERVAL_MS = 2000;

// Dimensions the TFLite model expects. Every camera frame is resized to
// exactly MODEL_WIDTH × MODEL_HEIGHT before being fed to the model.
const MODEL_WIDTH = 640;
const MODEL_HEIGHT = 640;
const MODEL_CHANNELS = 3; // RGB — no alpha channel

export default function TranslatorScreen() {
  // Camera permission state and the request helper from Vision Camera.
  const { hasPermission, requestPermission } = useCameraPermission();

  // Select the front-facing camera device (the one the user signs into).
  const device = useCameraDevice('front');

  // `resize` is a worklet-compatible helper that crops/scales a camera frame
  // and converts it to a normalised Float32Array in-place on the render thread.
  const { resize } = useResizePlugin();

  // Pull detection state and controls from the sign-detection hook.
  const { state: modelState, isReady, prediction, reset, runInference } = useSignDetector();
  const modelReady = isReady;

  // Whether the user has started a live detection session.
  const [isActive, setIsActive] = useState(false);

  // Rolling list of the last 5 accepted predictions, shown as a history feed.
  const [history, setHistory] = useState([]);

  // Ask for camera permission on first render if we don't have it yet.
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Stable refs so that the worklet closure always calls the latest version
  // of runInference and reads the latest isReady value without needing to
  // recreate the frameProcessor or the JS bridge callback.
  const runInferenceRef = useRef(runInference);
  useEffect(() => { runInferenceRef.current = runInference; }, [runInference]);

  const isReadyRef = useRef(isReady);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);

  // ── Worklet → JS bridge ──
  // `Worklets.createRunOnJS` wraps a regular JS function so it can be called
  // safely from the camera's render-thread worklet without blocking it.
  // We create this once (via useRef) so the frameProcessor doesn't need
  // to depend on runInference directly, which would force it to re-register
  // on every inference callback change.
  const runOnJS = useRef(
    Worklets.createRunOnJS((data) => {
      if (!isReadyRef.current) return;
      // The worklet bridge may deliver the Float32Array as a plain object
      // with numeric keys — convert it back to a standard Array before
      // handing it to runInference.
      const arr = Array.from(
        { length: Object.keys(data).length },
        (_, i) => data[i] ?? 0
      );
      runInferenceRef.current?.(arr);
    }),
  ).current;

  // Timestamp of the last processed frame, used to enforce FRAME_INTERVAL_MS.
  // Stored in a ref so it's accessible inside the worklet without re-renders.
  const lastFrameTsRef = useRef(0);

  // ── Frame processor (runs on the camera render thread as a worklet) ──
  // Vision Camera calls this function for every captured frame.
  // We throttle it to FRAME_INTERVAL_MS and skip processing if the model
  // hasn't loaded yet.
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet'; // Marks this closure as a worklet — runs off the JS thread.

      const now = Date.now();
      // Throttle: ignore frames that arrive too soon after the last one.
      if (now - lastFrameTsRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTsRef.current = now;

      console.log('[Worklet] frame fired, format:', frame.pixelFormat, 'size:', frame.width, 'x', frame.height);

      try {
        // Resize the raw camera frame to 640×640 RGB, normalised to [0, 1].
        // `normalize: { mean: [0,0,0], std: [255,255,255] }` divides each
        // channel value by 255 so the model receives floats in [0, 1].
        const resized = resize(frame, {
          scale: { width: MODEL_WIDTH, height: MODEL_HEIGHT },
          pixelFormat: 'rgb',
          dataType: 'float32',
          normalize: { mean: [0, 0, 0], std: [255, 255, 255] },
        });

        console.log('[Worklet] resized null?', resized == null);
        if (resized == null) return;

        // Convert the Float32Array to a plain JS array before crossing the
        // worklet boundary, because typed arrays can't be passed directly
        // through `createRunOnJS` without serialisation issues.
        console.log('[Worklet] calling runOnJS');
        const arr = Array.from(resized); // Float32Array → plain JS array in worklet context
        runOnJS(arr);
      } catch (e) {
        console.log('[Worklet] resize ERROR:', String(e));
      }
    },
    [runOnJS], // Re-register the processor only if the JS bridge ref changes.
  );

  // Whenever a new prediction arrives (and the session is active), prepend it
  // to the history list and keep only the most recent 5 entries.
  useEffect(() => {
    if (!prediction || !isActive) return;
    setHistory(prev =>
      [{ ...prediction, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5),
    );
  }, [prediction, isActive]);

  // Toggle the detection session on/off.
  // Stopping a session also clears the current prediction and history.
  const handleToggle = useCallback(() => {
    setIsActive(prev => {
      if (prev) {
        reset();
        setHistory([]);
      }
      return !prev;
    });
  }, [reset]);

  // ── Permission guard ──
  // Show a friendly prompt if the user hasn't granted camera access yet.
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

  // ── Device guard ──
  // Show an error if no front camera was found on this device.
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

  // ── Main UI ──
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
        {/* ── Model loading / error banner ──
            Shown only while the TFLite model hasn't finished loading.
            Switches to an error state if the model file is missing. */}
        {!modelReady && (
          <View style={[styles.bannerCard, modelState === 'error' && styles.bannerCardError]}>
            <MaterialCommunityIcons
              name={modelState === 'error' ? 'alert-circle-outline' : 'clock-outline'}
              size={16}
              color={modelState === 'error' ? COLOR.red : COLOR.amber}
            />
            <Text style={[styles.bannerText, modelState === 'error' && styles.bannerTextError]}>
              {modelState === 'error'
                ? 'Model configuration runtime asset missing'
                : 'Loading detection model…'}
            </Text>
          </View>
        )}

        {/* ── Camera viewfinder ──
            The frameProcessor is attached only when isActive is true, so
            inference stops automatically when the session is paused. */}
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
            {/* Camera is always active (preview) but only processes frames
                when the user has started a session (isActive). */}
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              frameProcessor={isActive ? frameProcessor : undefined}
              // ← remove pixelFormat="rgb" here
            />
            {/* Decorative corner brackets drawn over the viewfinder */}
            <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
            <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
          </View>
        </View>

        {/* ── Current prediction card ──
            Shows the most recently detected sign and its confidence score.
            Falls back to a muted placeholder when nothing is detected. */}
        {prediction ? (
          <View style={[styles.card, prediction.isMedical && styles.cardMedical]}>
            <Text style={styles.sectionLabel}>CURRENT SIGN</Text>
            <Text style={styles.predictionLabel}>{prediction.label}</Text>
            <View style={styles.predictionMeta}>
              <Text style={styles.predictionConf}>{prediction.confidence}% confidence</Text>
              {/* Extra tag for word/phrase signs to distinguish them from letter signs */}
              {prediction.isMedical && (
                <View style={styles.medicalTag}>
                  <MaterialCommunityIcons name="medical-bag" size={12} color={COLOR.amber} />
                  <Text style={styles.medicalTagText}>Medical Sign</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          // Placeholder shown when there is no active prediction
          <View style={styles.outputBox}>
            <Text style={styles.sectionLabel}>TRANSLATION OUTPUT</Text>
            <Text style={styles.outputTextMuted}>
              {isActive ? 'Listening for signs…' : 'Start a session to see translations'}
            </Text>
          </View>
        )}

        {/* ── Detection history ──
            Rendered only when at least one sign has been detected this session.
            Each row shows the sign label, an icon, and the time it was detected. */}
        {history.length > 0 && (
          <>
            <Text style={styles.sectionLabelSpaced}>RECENT SIGNS</Text>
            <View style={styles.card}>
              {history.map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.historyRow,
                    // Add a bottom border between rows but not after the last one
                    i < history.length - 1 && styles.historyRowBorder,
                  ]}
                >
                  {/* Icon differs for word/phrase signs vs alphabet signs */}
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
                  {/* Timestamp of when this sign was detected */}
                  <Text style={styles.historyTime}>{h.ts}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Start / Stop button ──
            Disabled while the model is still loading.
            Appearance changes to a "stop" state when a session is active. */}
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