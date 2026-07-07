/**
 * SignTranslatorScreen.tsx
 *
 * Sign language translation screen — driven by the shared
 * `useSignTranslator` hook so camera, model, inference, AND voice output
 * all come from a single source of truth.
 *
 * Perf notes vs the previous version:
 * - The Camera preview, the model-status banner, and the detection card
 *   are split into memoized subcomponents. `detection` updates many
 *   times per second during a live session; without isolation, every
 *   update re-rendered the whole tree including the <Camera> view.
 *   Now only the small piece that actually depends on `detection`
 *   re-renders.
 * - Inline style object literals moved to StyleSheet.create so they
 *   aren't reallocated on every render.
 * - `isMedicalSign` is memoized off of `detection?.label` instead of
 *   being recomputed on every render regardless of whether it changed.
 * - `<Camera>` now receives the `format` computed in `useSignTranslator`
 *   (constrained close to the model's 640x640 input) instead of
 *   capturing at the device's full native photo resolution. See the
 *   comment above `format` in useSignDetector.ts for why this matters —
 *   it's what stops the app from running out of memory after a few
 *   minutes of live translation.
 */

import React, { useMemo } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import { Camera, CameraDevice, CameraDeviceFormat } from 'react-native-vision-camera';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/TranslatorScreenStyle';
import { useSignTranslator, isMedicalLabel } from '../../../../hooks/useSignDetector';

// ---- local styles for the bits that were previously inline objects ----
const localStyles = StyleSheet.create({
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flexFill: {
    flex: 1,
  },
});

// ---------------------------------------------------------------------
// Memoized subcomponents
// ---------------------------------------------------------------------

type CameraViewProps = {
  cameraRef: React.RefObject<Camera | null>;
  device: CameraDevice;
  format: CameraDeviceFormat | undefined;
};

/** Isolated so `detection` updates elsewhere never re-render the camera. */
const CameraView = React.memo(function CameraView({ cameraRef, device, format }: CameraViewProps) {
  return (
    <View style={styles.viewfinderWrap}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={true}
        photo={true}
        pixelFormat="yuv"
      />
      <View style={styles.scanlineOverlay} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
    </View>
  );
});

type ModelBannerProps = {
  modelState: string;
};

const ModelBanner = React.memo(function ModelBanner({ modelState }: ModelBannerProps) {
  const isError = modelState === 'error';
  return (
    <View style={[styles.bannerCard, isError && styles.bannerCardError]}>
      <View style={[styles.bannerIconWrap, isError && styles.bannerIconWrapError]}>
        <MaterialCommunityIcons
          name={isError ? 'alert-circle' : 'circle-slice-2'}
          size={16}
          color={isError ? COLOR.red : COLOR.amber}
        />
      </View>
      <Text style={[styles.bannerText, isError && styles.bannerTextError]}>
        {isError ? 'Model setup failed' : 'Optimizing translation engine…'}
      </Text>
    </View>
  );
});

type Detection = {
  label: string;
  confidence: number;
};

type DetectionCardProps = {
  detection: Detection | null;
  isDetecting: boolean;
  isMedicalSign: boolean;
  cardOpacity: Animated.Value;
  cardScale: Animated.Value;
};

const DetectionCard = React.memo(function DetectionCard({
  detection,
  isDetecting,
  isMedicalSign,
  cardOpacity,
  cardScale,
}: DetectionCardProps) {
  if (!detection) {
    return (
      <View style={styles.outputBox}>
        <View style={styles.outputIconWrap}>
          <MaterialCommunityIcons name="text-to-speech" size={20} color={COLOR.tealDeep} />
        </View>
        <Text style={styles.outputTextMuted}>
          {isDetecting ? 'Awaiting sign inputs…' : 'Start session to begin translations'}
        </Text>
      </View>
    );
  }

  return (
    <Animated.View style={{ opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
      <Text style={styles.sectionLabel}>DETECTED SIGN</Text>
      <Text style={styles.predictionLabel}>{detection.label}</Text>

      {isMedicalSign && (
        <View style={styles.medicalTag}>
          <MaterialCommunityIcons name="heart-pulse" size={12} color={COLOR.amber} />
          <Text style={styles.medicalTagText}>Medical Terminology</Text>
        </View>
      )}

      <View style={styles.predictionMeta}>
        <Text style={styles.predictionConf}>
          Confidence: {Math.round(detection.confidence * 100)}%
        </Text>
        <View style={styles.confidenceTrack}>
          <View style={[styles.confidenceFill, { width: `${detection.confidence * 100}%` }]} />
        </View>
      </View>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------

export default function SignTranslatorScreen() {
  const {
    hasPermission,
    requestPermission,
    device,
    format,
    isDetecting,
    detection,
    isModelReady,
    modelState,
    cameraRef,
    cardOpacity,
    cardScale,
    toggleDetection,
    isVoiceEnabled,
    toggleVoice,
  } = useSignTranslator();

  // Only recompute when the detected label actually changes.
  const isMedicalSign = useMemo(
    () => !!detection && isMedicalLabel(detection.label),
    [detection?.label],
  );

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

      <View style={styles.bgLayer} pointerEvents="none">
        <View style={styles.bgBlobTopRight} />
        <View style={styles.bgBlobMidLeft} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerBlob} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>LIVE TRANSLATION</Text>
            <Text style={styles.headerTitle}>Sign Language</Text>
          </View>
          <View style={localStyles.headerRightRow}>
            {/* Voice mute/unmute toggle */}
            <TouchableOpacity
              onPress={toggleVoice}
              style={[styles.liveBadge, { marginRight: 8 }]}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={isVoiceEnabled ? 'volume-high' : 'volume-off'}
                size={16}
                color={isVoiceEnabled ? COLOR.tealBright : COLOR.red}
              />
            </TouchableOpacity>

            <View style={[styles.liveBadge, isDetecting && styles.liveBadgeActive]}>
              <View style={[styles.liveDot, isDetecting && styles.liveDotActive]} />
              <Text style={[styles.liveText, isDetecting && styles.liveTextActive]}>
                {isDetecting ? 'LIVE' : 'IDLE'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={localStyles.flexFill}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isModelReady && <ModelBanner modelState={modelState} />}

        <View style={[styles.card, isMedicalSign && styles.cardMedical]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={styles.historyIconWrap}>
                <MaterialCommunityIcons name="camera" size={20} color={COLOR.tealDeep} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Camera Input</Text>
                <Text style={styles.cardSub}>Keep hands clearly within the boundaries</Text>
              </View>
            </View>
          </View>

          <CameraView cameraRef={cameraRef} device={device} format={format} />
        </View>

        <View style={styles.card}>
          <DetectionCard
            detection={detection}
            isDetecting={isDetecting}
            isMedicalSign={isMedicalSign}
            cardOpacity={cardOpacity}
            cardScale={cardScale}
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isDetecting && styles.stopBtn]}
          onPress={toggleDetection}
          disabled={!isModelReady}
          activeOpacity={0.88}
        >
          <MaterialCommunityIcons
            name={isDetecting ? 'stop' : 'play'}
            size={22}
            color={isDetecting ? COLOR.red : COLOR.tealDeep}
          />
          <Text style={[styles.primaryBtnText, isDetecting && styles.stopBtnText]}>
            {isDetecting ? 'End Translation' : 'Start Translation'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}