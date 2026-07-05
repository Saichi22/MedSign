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
import Icon from '@mdi/react';
import { mdiSignLanguage } from '@mdi/js';

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

// ─── Translator CTA — hero card, no live camera, just launches the screen ─────
// Background is intentionally textured (graph-paper grid + glow + pulse
// watermark) rather than a flat fill, with a scrim layered underneath the
// text block so contrast stays high regardless of what's behind it.
function TranslatorCard({ onPress }) {
  return (
    <Pressable style={styles.translatorCard} onPress={onPress}>
      {/* Decorative layers — purely visual, never intercept touches */}
      <View style={styles.translatorGlowBottom} pointerEvents="none" />

      <View style={styles.translatorGridLayer} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.translatorGridLineH, { top: i * 26 }]} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.translatorGridLineV, { left: i * 34 }]} />
        ))}
      </View>

      <MaterialCommunityIcons
        name="pulse"
        size={150}
        color="rgba(126,221,227,0.10)"
        style={styles.translatorWatermark}
      />

      {/* Scrim — guarantees text legibility over the pattern above */}
      <View style={styles.translatorScrim} pointerEvents="none" />

      <View style={styles.translatorTopRow}>
        <View style={styles.translatorIconWrap}>
          <Image 
            source={SignLanguageImg} 
            style={styles.translatorCustomIcon} 
            resizeMode="contain"
          />
        </View>
        <View style={styles.translatorLiveBadge}>
          <View style={styles.translatorLiveDot} />
          <Text style={styles.translatorLiveText}>AI-POWERED</Text>
        </View>
      </View>

      <Text style={styles.translatorTitle}>MedSign Translator</Text>
      <Text style={styles.translatorSub}>
        Real-time Filipino Sign Language recognition for medical conversations
      </Text>

      <View style={styles.translatorCtaRow}>
        <View style={styles.translatorCtaBtn}>
          <MaterialCommunityIcons name="camera" size={17} color={COLOR.tealDeep} />
          <Text style={styles.translatorCtaText}>Start Translation</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Phrasebook Card ──────────────────────────────────────────────────────────
function PhrasebookCard({ onPress }) {
  const PREVIEW_PHRASES = ['MASAKIT', 'HIRAP HUMINGA', 'NAHIHILO', 'LAGNAT'];

  return (
    <Pressable style={styles.phrasebookCard} onPress={onPress}>
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
      </View>
      <View style={styles.phrasebookCardDeco} pointerEvents="none">
        <View style={styles.decoCircleOuter}>
          <View style={styles.decoCircleInner}>
            <MaterialCommunityIcons name="arrow-right" size={28} color={COLOR.tealBright} style={{ opacity: 0.6 }} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Quick Action Card ──────────────────────────────────────────────────────────
function QuickActionCard({ icon, label, sublabel, tint, onPress }) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      <View style={[styles.quickIconWrap, tint && { backgroundColor: tint.bg, borderColor: tint.border }]}>
        <MaterialCommunityIcons name={icon} size={20} color={tint ? tint.icon : COLOR.tealBright} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.quickLabel}>{label}</Text>
        <Text style={styles.quickSublabel}>{sublabel}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={COLOR.inkFaint} />
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
  const qaFade       = useRef(new Animated.Value(0)).current;
  const qaSlide      = useRef(new Animated.Value(14)).current;

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
      Animated.parallel([
        Animated.timing(qaFade,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(qaSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const firstName = user?.displayName?.split(' ')[0] || 'Doctor';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* ── Ambient page background — quiet texture so the page isn't a flat
          fill, sits behind everything and never touches text contrast ──── */}
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
        {/* ── Translator CTA ───────────────────────────────────────────── */}
        <Animated.View style={{ opacity: cardFade, transform: [{ scale: cardScale }], marginBottom: 26 }}>
          <TranslatorCard onPress={() => navigation.navigate('Translator')} />
        </Animated.View>

        {/* ── Phrasebook ───────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: pbFade, transform: [{ translateY: pbSlide }], marginBottom: 26 }}>
          <Text style={styles.sectionLabel}>TOOLS</Text>
          <PhrasebookCard onPress={() => navigation.navigate('Phrasebook')} />
        </Animated.View>

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: qaFade, transform: [{ translateY: qaSlide }] }}>
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={styles.quickList}>
            <QuickActionCard
              icon="history"
              label="Recent Translations"
              sublabel="Review your last sessions"
              tint={{ bg: 'rgba(10,155,170,0.08)', border: 'rgba(10,155,170,0.15)', icon: COLOR.tealBright }}
              onPress={() => navigation.navigate('History')}
            />
            <QuickActionCard
              icon="bookmark"
              label="Saved Signs"
              sublabel="Your bookmarked phrases"
              tint={{ bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)', icon: '#D97706' }}
              onPress={() => navigation.navigate('SavedSigns')}
            />
            <QuickActionCard
              icon="school"
              label="Learn FSL"
              sublabel="Practice signs at your pace"
              tint={{ bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.20)', icon: '#6366F1' }}
              onPress={() => navigation.navigate('Learn')}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}