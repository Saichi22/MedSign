// HomeScreen.js
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuth } from '../../../auth/services/AuthContext';
import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/HomeScreenStyle';
import SignLanguageImg from '../../../../assets/images/signLanguage.png';

// ─── Reusable press-scale wrapper ──────────────────────────────────────────────
function Pressable({ style, onPress, children }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, tension: 120, friction: 8 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 120, friction: 8 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={style} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={1}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Emergency button — always visible at the top of Home ─────────────────────
function EmergencyButton({ onPress }) {
  return (
    <Pressable style={styles.emergencyBtn} onPress={onPress}>
      <View style={styles.emergencyIconWrap}>
        <MaterialCommunityIcons name="alert-octagon" size={24} color={COLOR.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.emergencyTitle}>EMERGENCY PHRASES</Text>
        <Text style={styles.emergencySub}>Show urgent signs to medical staff fast</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={COLOR.white} />
    </Pressable>
  );
}

// ─── Hero card — shared by Translator, Learn and Dictionary ───────────────────
// Same textured look (grid + glow + watermark + scrim) everywhere; only the
// icon, copy and glow color change per card.
function HeroCard({
  onPress,
  image,
  icon,
  watermark,
  badge,
  title,
  sub,
  ctaIcon,
  ctaText,
  glow = 'rgba(126,221,227,0.16)',
}) {
  return (
    <Pressable style={styles.translatorCard} onPress={onPress}>
      {/* Decorative layers — purely visual, never intercept touches */}
      <View style={[styles.translatorGlowBottom, { backgroundColor: glow }]} pointerEvents="none" />

      <View style={styles.translatorGridLayer} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.translatorGridLineH, { top: i * 26 }]} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.translatorGridLineV, { left: i * 34 }]} />
        ))}
      </View>

      <MaterialCommunityIcons
        name={watermark}
        size={150}
        color="rgba(126,221,227,0.10)"
        style={styles.translatorWatermark}
      />

      {/* Scrim — guarantees text legibility over the pattern above */}
      <View style={styles.translatorScrim} pointerEvents="none" />

      <View style={styles.translatorTopRow}>
        <View style={styles.translatorIconWrap}>
          {image ? (
            <Image source={image} style={styles.translatorCustomIcon} resizeMode="contain" />
          ) : (
            <MaterialCommunityIcons name={icon} size={24} color={COLOR.white} />
          )}
        </View>
        <View style={styles.translatorLiveBadge}>
          <View style={styles.translatorLiveDot} />
          <Text style={styles.translatorLiveText}>{badge}</Text>
        </View>
      </View>

      <Text style={styles.translatorTitle}>{title}</Text>
      <Text style={styles.translatorSub}>{sub}</Text>

      <View style={styles.translatorCtaRow}>
        <View style={styles.translatorCtaBtn}>
          <MaterialCommunityIcons name={ctaIcon} size={17} color={COLOR.tealDeep} />
          <Text style={styles.translatorCtaText}>{ctaText}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main HomeScreen ──────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();

  // ── Entrance animations ───────────────────────────────────────────────────
  const headerFade   = useRef(new Animated.Value(0)).current;
  const headerSlide  = useRef(new Animated.Value(-20)).current;
  const cardFade     = useRef(new Animated.Value(0)).current;
  const cardScale    = useRef(new Animated.Value(0.96)).current;
  const pbFade       = useRef(new Animated.Value(0)).current;
  const pbSlide      = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.stagger(90, [
      Animated.parallel([
        Animated.timing(headerFade,  { toValue: 1, duration: 460, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 460, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade,  { toValue: 1, duration: 460, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(pbFade,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(pbSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const firstName = user?.displayName?.split(' ')[0] || 'Doctor';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* ── Ambient page background ─────────────────────────────────────── */}
      <View style={styles.pageBgLayer} pointerEvents="none">
        <View style={styles.pageDotGrid}>
          {Array.from({ length: 20 }).map((_, row) => (
            <View key={`row${row}`} style={styles.pageDotRow}>
              {Array.from({ length: 8 }).map((_, col) => (
                <View key={`dot${row}-${col}`} style={styles.pageDot} />
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <View style={styles.headerBlob} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>Good Morning,</Text>
            <Text style={styles.headerName}>{firstName}</Text>
          </View>
          <TouchableOpacity style={styles.headerAvatar}>
            <MaterialCommunityIcons name="account" size={22} color={COLOR.white} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Emergency + Translator ───────────────────────────────────── */}
        <Animated.View style={{ opacity: cardFade, transform: [{ scale: cardScale }], marginBottom: 26 }}>
          <EmergencyButton onPress={() => navigation.navigate('Emergency')} />
          <HeroCard
            onPress={() => navigation.navigate('Translator')}
            image={SignLanguageImg}
            watermark="pulse"
            badge="AI-POWERED"
            title="MedSign Translator"
            sub="Real-time Filipino Sign Language recognition for medical conversations"
            ctaIcon="camera"
            ctaText="Start Translation"
          />
        </Animated.View>

        {/* ── Learn + Dictionary ───────────────────────────────────────── */}
        <Animated.View style={{ opacity: pbFade, transform: [{ translateY: pbSlide }] }}>
          <Text style={styles.sectionLabel}>LEARN & REFERENCE</Text>

          <View style={styles.heroGap}>
            <HeroCard
              onPress={() => navigation.navigate('Learn')}
              icon="school"
              watermark="school"
              badge="LESSONS & QUIZ"
              title="Learn FSL"
              sub="Short lessons and sign quizzes to practice at your own pace"
              ctaIcon="play"
              ctaText="Start Learning"
              glow="rgba(129,140,248,0.22)"
            />
          </View>

          <View style={styles.heroGap}>
            <HeroCard
              onPress={() => navigation.navigate('Dictionary')}
              icon="book-alphabet"
              watermark="book-alphabet"
              badge="A–Z"
              title="FSL Dictionary"
              sub="Look up any sign and see its meaning in English and Tagalog"
              ctaIcon="magnify"
              ctaText="Search Signs"
              glow="rgba(245,158,11,0.20)"
            />
          </View>

        </Animated.View>
      </ScrollView>
    </View>
  );
}