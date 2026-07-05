/**
 * SignTranslatorScreen.tsx
 *
 * Sign language translation screen — now driven by the shared
 * `useSignTranslator` hook so camera, model, inference, AND voice output
 * all come from a single source of truth (no more duplicate logic that
 * silently drifts, like the missing Speech.speak() call this replaces).
 */

import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import { Camera } from 'react-native-vision-camera';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/TranslatorScreenStyle';
import { useSignTranslator, SIGN_LABELS } from '../../../../hooks/useSignDetector';

const MEDICAL_TERMS_START_INDEX = 48;

export default function SignTranslatorScreen() {
  const {
    hasPermission,
    requestPermission,
    device,
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

  const isMedicalSign = !!detection && SIGN_LABELS.indexOf(detection.label) >= MEDICAL_TERMS_START_INDEX;

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
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isModelReady && (
          <View style={[styles.bannerCard, modelState === 'error' && styles.bannerCardError]}>
            <View style={[styles.bannerIconWrap, modelState === 'error' && styles.bannerIconWrapError]}>
              <MaterialCommunityIcons
                name={modelState === 'error' ? 'alert-circle' : 'circle-slice-2'}
                size={16}
                color={modelState === 'error' ? COLOR.red : COLOR.amber}
              />
            </View>
            <Text style={[styles.bannerText, modelState === 'error' && styles.bannerTextError]}>
              {modelState === 'error' ? 'Model setup failed' : 'Optimizing translation engine…'}
            </Text>
          </View>
        )}

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

          <View style={styles.viewfinderWrap}>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
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
        </View>

        <View style={styles.card}>
          {!detection ? (
            <View style={styles.outputBox}>
              <View style={styles.outputIconWrap}>
                <MaterialCommunityIcons name="text-to-speech" size={20} color={COLOR.tealDeep} />
              </View>
              <Text style={styles.outputTextMuted}>
                {isDetecting ? 'Awaiting sign inputs…' : 'Start session to begin translations'}
              </Text>
            </View>
          ) : (
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
          )}
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