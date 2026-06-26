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
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../../auth/services/AuthContext';

import {
  Camera,
  useCameraDevice,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useSignDetector } from '../../../../hooks/useSignDetector';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/HomeScreenStyle';

// ─── Recent Translation Row ───────────────────────────────────────────────────
function RecentRow({ sign, translation, time }) {
  return (
    <View style={styles.recentRow}>
      <View style={styles.recentIconWrap}>
        <MaterialCommunityIcons name="sign-language" size={16} color={COLOR.tealBright} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.recentSign}>{sign}</Text>
        <Text style={styles.recentTranslation}>{translation}</Text>
      </View>
      <Text style={styles.recentTime}>{time}</Text>
    </View>
  );
}

// ─── Phrasebook Card ──────────────────────────────────────────────────────────
function PhrasebookCard({ onPress }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, tension: 120, friction: 8 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 120, friction: 8 }).start();

  const PREVIEW_PHRASES = ['MASAKIT', 'HIRAP HUMINGA', 'NAHIHILO', 'LAGNAT'];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={styles.phrasebookCard}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {/* Left content */}
        <View style={styles.phrasebookCardBody}>
          <View style={styles.phrasebookCardTop}>
            <View style={styles.phrasebookIconWrap}>
              <MaterialCommunityIcons name="book-open-page-variant" size={20} color={COLOR.tealBright} />
            </View>
            <View style={styles.phrasebookFslBadge}>
              <Text style={styles.phrasebookFslBadgeText}>FSL</Text>
            </View>
          </View>

          <Text style={styles.phrasebookCardTitle}>Medical Phrasebook</Text>
          <Text style={styles.phrasebookCardSub}>30+ Filipino Sign Language phrases for medical settings</Text>

          {/* Phrase chips preview */}
          <View style={styles.phrasebookChipsRow}>
            {PREVIEW_PHRASES.map((p) => (
              <View key={p} style={styles.phrasebookChip}>
                <Text style={styles.phrasebookChipText}>{p}</Text>
              </View>
            ))}
            <View style={styles.phrasebookChipMore}>
              <Text style={styles.phrasebookChipMoreText}>+26</Text>
            </View>
          </View>

          <View style={styles.phrasebookOpenRow}>
            <Text style={styles.phrasebookOpenText}>Open phrasebook</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={COLOR.tealBright} />
          </View>
        </View>

        {/* Decorative right column */}
        <View style={styles.phrasebookCardDeco} pointerEvents="none">
          <View style={styles.decoCircleOuter}>
            <View style={styles.decoCircleInner}>
              <MaterialCommunityIcons name="arrow-right" size={28} color={COLOR.tealBright} style={{ opacity: 0.6 }} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main HomeScreen ──────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const navigation = useNavigation();

  const device = useCameraDevice('front');

  const { isReady, prediction, runInference } = useSignDetector();
  const { resize } = useResizePlugin();

  const runOnJS = useCallback(
    Worklets.createRunOnJS((buffer) => {
      if (runInference) runInference(buffer);
    }),
    [runInference],
  );

  const handlePrediction = useCallback((label) => {
    setTranscript(prev => {
      if (prev[prev.length - 1] === label) return prev;
      return [...prev, label];
    });
  }, []);

  useEffect(() => {
    if (prediction && isRecording) handlePrediction(prediction.label);
  }, [prediction, isRecording, handlePrediction]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isReady || !isRecording) return;
    const resized = resize(frame, {
      scale: { width: 224, height: 224 },
      pixelFormat: 'rgb',
      dataType: 'float32',
      normalize: { mean: [0, 0, 0], std: [255, 255, 255] },
    });
    runOnJS(resized);
  }, [isReady, isRecording, runOnJS]);

  // ── Entrance animations ───────────────────────────────────────────────────
  const headerFade   = useRef(new Animated.Value(0)).current;
  const headerSlide  = useRef(new Animated.Value(-20)).current;
  const cardFade     = useRef(new Animated.Value(0)).current;
  const cardScale    = useRef(new Animated.Value(0.96)).current;
  const pbFade       = useRef(new Animated.Value(0)).current;
  const pbSlide      = useRef(new Animated.Value(14)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(headerFade,  { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 480, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade,  { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(pbFade,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(pbSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Translator Card ──────────────────────────────────────────── */}
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
              {isRecording && device ? (
                <Camera
                  style={StyleSheet.absoluteFill}
                  device={device}
                  isActive={isRecording}
                  frameProcessor={frameProcessor}
                  frameProcessorFps={5}
                  pixelFormat="yuv"
                />
              ) : (
                <View style={styles.viewfinderCenter}>
                  <MaterialCommunityIcons
                    name="hand-wave-outline"
                    size={48}
                    color={isRecording ? COLOR.tealLight : 'rgba(126,221,227,0.35)'}
                  />
                  <Text style={styles.viewfinderHint}>
                    {!device ? 'Camera hardware unavailable' : 'Camera feed will appear here'}
                  </Text>
                </View>
              )}
              <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
              {isRecording && (
                <Animated.View
                  style={[styles.pulseRing, { opacity: pulseOpacity, transform: [{ scale: pulseAnim }] }]}
                  pointerEvents="none"
                />
              )}
            </View>
          </View>

          <View style={styles.outputBox}>
            <Text style={styles.outputLabel}>
              {isRecording && prediction ? `CURRENT SIGN: ${prediction.label}` : 'TRANSLATION OUTPUT'}
            </Text>
            <Text style={[styles.outputText, !isRecording && styles.outputTextMuted]}>
              {isRecording
                ? (transcript.length > 0 ? transcript.join(' ') : 'Listening for signs…')
                : 'Start a session to see translations'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.startBtn, isRecording && styles.stopBtn]}
            onPress={() => navigation.navigate('Translator')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={isRecording ? 'stop-circle-outline' : 'camera-outline'}
              size={20}
              color={isRecording ? '#EF4444' : COLOR.tealDeep}
            />
            <Text style={[styles.startBtnText, isRecording && styles.stopBtnText]}>
              {isRecording ? 'Stop Session' : 'Start Translation'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Phrasebook Card ──────────────────────────────────────────── */}
        <Animated.View style={{ opacity: pbFade, transform: [{ translateY: pbSlide }], marginBottom: 24 }}>
          <Text style={styles.sectionLabel}>TOOLS</Text>
          <PhrasebookCard onPress={() => navigation.navigate('Phrasebook')} />
        </Animated.View>

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickCard} activeOpacity={0.75}>
            <View style={styles.quickIconWrap}>
              <MaterialCommunityIcons name="bookmark-outline" size={22} color={COLOR.tealBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickLabel}>Saved Signs</Text>
              <Text style={styles.quickSublabel}>Your bookmarks</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}