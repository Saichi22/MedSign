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

// ─── Quick Stat Badge ─────────────────────────────────────────────────────────
function StatBadge({ icon, value, label }) {
  return (
    <View style={styles.statBadge}>
      <MaterialCommunityIcons name={icon} size={18} color={COLOR.tealBright} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

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

// ─── Main HomeScreen ──────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const navigation = useNavigation();

  const device = useCameraDevice('front');

  // ── Correctly destructure all values the hook actually returns ────────────
  const { isReady, prediction, runInference } = useSignDetector();
  const { resize } = useResizePlugin();

  // ── Stable JS-thread bridge — memoized so frameProcessor deps stay stable ─
  const runOnJS = useCallback(
    Worklets.createRunOnJS((buffer) => {
      if (runInference) runInference(buffer);
    }),
    [runInference],
  );

  // ── Append unique consecutive predictions to transcript ───────────────────
  const handlePrediction = useCallback((label) => {
    setTranscript(prev => {
      if (prev[prev.length - 1] === label) return prev;
      return [...prev, label];
    });
  }, []);

  // ── React to new predictions while recording ──────────────────────────────
  useEffect(() => {
    if (prediction && isRecording) {
      handlePrediction(prediction.label);
    }
  }, [prediction, isRecording, handlePrediction]);

  // ── Frame processor ───────────────────────────────────────────────────────
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isReady || !isRecording) return;

    const resized = resize(frame, {
      scale: { width: 224, height: 224 },
      pixelFormat: 'rgb',
      dataType: 'float32',
      normalize: { mean: [0, 0, 0], std: [255, 255, 255] },
    });

    // Hand off to JS thread — inference must NOT run inside the worklet
    runOnJS(resized);
  }, [isReady, isRecording, runOnJS]);

  // ── Entrance animations ───────────────────────────────────────────────────
  const headerFade  = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const cardFade    = useRef(new Animated.Value(0)).current;
  const cardScale   = useRef(new Animated.Value(0.96)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
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

  // ── Pulse ring while recording ────────────────────────────────────────────
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── ASL Translator Card ──────────────────────────────────────── */}
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

          {/* Camera viewfinder */}
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

              {/* HUD corners */}
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

          {/* Translation output */}
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

          {/* CTA — navigates to full TranslatorScreen */}
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

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.quickGrid}>
          {[
            { icon: 'bookmark-outline',     label: 'Saved Signs' },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.quickCard} activeOpacity={0.75}>
              <View style={styles.quickIconWrap}>
                <MaterialCommunityIcons name={item.icon} size={22} color={COLOR.tealBright} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Recent Translations ────────────────────────────────────────
        <Text style={styles.sectionLabel}>RECENT TRANSLATIONS</Text>
        <View style={styles.card}>
          <RecentRow sign="Hello" translation="Greeting gesture detected"   time="2m ago" />
          <RecentRow sign="Pain"  translation="Medical distress indicator"  time="14m ago" />
          <RecentRow sign="Help"  translation="Urgent assistance request"   time="1h ago" />
          <TouchableOpacity style={styles.viewAllRow}>
            <Text style={styles.viewAllText}>View all sessions</Text>
            <MaterialCommunityIcons name="arrow-right" size={15} color={COLOR.tealBright} />
          </TouchableOpacity>
        </View> */}
      </ScrollView>
    </View>
  );
}