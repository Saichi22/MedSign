// HomeScreen.js
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  StyleSheet,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../../auth/services/AuthContext';

import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useSignDetector } from '../../../../hooks/useSignDetector';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/HomeScreenStyle';

const FRAME_INTERVAL_MS = 2000;
const MODEL_WIDTH    = 640;
const MODEL_HEIGHT   = 640;
const MODEL_CHANNELS = 3;
const EXPECTED_SIZE  = MODEL_WIDTH * MODEL_HEIGHT * MODEL_CHANNELS; // 1,228,800

export default function HomeScreen() {
  const { user } = useAuth();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const { resize } = useResizePlugin();

  const { state: modelState, isReady, prediction, reset, runInference } = useSignDetector();

  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory]         = useState([]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const runInferenceRef = useRef(runInference);
  useEffect(() => { runInferenceRef.current = runInference; }, [runInference]);

  const isReadyRef = useRef(isReady);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);

  const runOnJS = useRef(
    Worklets.createRunOnJS((dataPayload) => {
      if (!isReadyRef.current) return;
      runInferenceRef.current?.(dataPayload);
    }),
  ).current;

  const lastFrameTsRef = useRef(0);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const now = Date.now();
      if (now - lastFrameTsRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTsRef.current = now;

      const resized = resize(frame, {
        scale:       { width: MODEL_WIDTH, height: MODEL_HEIGHT },
        pixelFormat: 'rgb',
        dataType:    'float32',
        mirror:      true,
      });

      if (resized != null) {
        runOnJS(resized);
      }
    },
    [runOnJS],
  );

  useEffect(() => {
    if (!prediction || !isRecording) return;
    setHistory(prev =>
      [{ ...prediction, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5),
    );
  }, [prediction, isRecording]);

  const handleToggle = useCallback(() => {
    setIsRecording(prev => {
      if (prev) { reset(); setHistory([]); }
      return !prev;
    });
  }, [reset]);

  const headerFade   = useRef(new Animated.Value(0)).current;
  const headerSlide  = useRef(new Animated.Value(-20)).current;
  const cardFade     = useRef(new Animated.Value(0)).current;
  const cardScale    = useRef(new Animated.Value(0.96)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(headerFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    if (isRecording) {
      pulseOpacity.setValue(1);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      pulseOpacity.setValue(0);
    }
  }, [isRecording]);

  const firstName = user?.displayName?.split(' ')[0] || 'Doctor';

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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <Animated.View
        style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}
      >
        <View style={styles.headerBlob} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>Good Morning,</Text>
            <Text style={styles.headerName}>{firstName}</Text>
          </View>
          <TouchableOpacity style={styles.headerAvatar}>
            <MaterialCommunityIcons name="account-outline" size={22} color={COLOR.white} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!isReady && (
          <View style={[styles.bannerCard, modelState === 'error' && styles.bannerCardError]}>
            <MaterialCommunityIcons
              name={modelState === 'error' ? 'alert-circle-outline' : 'clock-outline'}
              size={16}
              color={modelState === 'error' ? COLOR.red : COLOR.amber}
            />
            <Text style={[styles.bannerText, modelState === 'error' && styles.bannerTextError]}>
              {modelState === 'error' ? 'Model failed to load' : 'Loading detection model…'}
            </Text>
          </View>
        )}

        <Animated.View style={[styles.translatorCard, { opacity: cardFade, transform: [{ scale: cardScale }] }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIconWrap}>
                <MaterialCommunityIcons name="camera" size={18} color={COLOR.tealBright} />
              </View>
              <View>
                <Text style={styles.cardTitle}>MedSign Translator</Text>
                <Text style={styles.cardSub}>Point camera at signing hands</Text>
              </View>
            </View>
            <View style={[styles.liveBadge, isRecording && styles.liveBadgeActive]}>
              <View style={[styles.liveDot, isRecording && styles.liveDotActive]} />
              <Text style={[styles.liveText, isRecording && styles.liveTextActive]}>
                {isRecording ? 'LIVE' : 'IDLE'}
              </Text>
            </View>
          </View>

          <View style={styles.viewfinderWrap}>
            <View style={[styles.viewfinder, { overflow: 'hidden' }]}>
              {device && isRecording ? (
                <Camera
                  style={StyleSheet.absoluteFill}
                  device={device}
                  isActive={true}
                  frameProcessor={frameProcessor}
                  pixelFormat="yuv"
                />
              ) : (
                <View style={styles.viewfinderCenter}>
                  <MaterialCommunityIcons
                    name={device ? 'hand-wave-outline' : 'camera-off'}
                    size={48}
                    color="rgba(126,221,227,0.35)"
                  />
                  <Text style={styles.viewfinderHint}>
                    {device ? 'Camera feed will appear here' : 'Camera hardware unavailable'}
                  </Text>
                </View>
              )}
              <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
            </View>
          </View>

          {prediction ? (
            <View style={[styles.outputBox, prediction.isMedical && styles.cardMedical]}>
              <Text style={styles.outputLabel}>CURRENT SIGN</Text>
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
              <Text style={styles.outputLabel}>TRANSLATION OUTPUT</Text>
              <Text style={[styles.outputText, styles.outputTextMuted]}>
                {isRecording ? 'Listening for signs…' : 'Start a session to see translations'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.startBtn, isRecording && styles.stopBtn]}
            onPress={handleToggle}
            disabled={!isReady}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={isRecording ? 'stop-circle-outline' : 'camera-outline'}
              size={20}
              color={isRecording ? COLOR.red : COLOR.tealDeep}
            />
            <Text style={[styles.startBtnText, isRecording && styles.stopBtnText]}>
              {isRecording ? 'Stop Session' : isReady ? 'Start Translation' : 'Loading model…'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.quickGrid}>
          {[{ icon: 'bookmark-outline', label: 'Saved Signs' }].map((item, i) => (
            <TouchableOpacity key={i} style={styles.quickCard} activeOpacity={0.75}>
              <View style={styles.quickIconWrap}>
                <MaterialCommunityIcons name={item.icon} size={22} color={COLOR.tealBright} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}