import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../../auth/services/AuthContext';

const { width: W } = Dimensions.get('window');

// ─── Design Tokens (mirrors AuthStyle) ───────────────────────────────────────
const COLOR = {
  tealDeep: '#0D3D40',
  tealMid: '#0A5C62',
  tealBright: '#0A9BAA',
  tealLight: '#7EDDE3',
  tealGlow: 'rgba(10,155,170,0.10)',
  inkPrimary: '#1A2E35',
  inkMuted: '#4A6E72',
  inkFaint: '#8AACAF',
  bgPage: '#F0F5F5',
  bgCard: '#FFFFFF',
  borderCard: '#E2EDED',
  borderIdle: '#D0E2E3',
  white: '#FFFFFF',
};

const FONT = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
};

const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28, pill: 100 };

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
        <MaterialCommunityIcons
          name="sign-language"
          size={16}
          color={COLOR.tealBright}
        />
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

  // Entrance animations
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.96)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(headerFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(headerSlide, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 70,
          friction: 9,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // Pulse ring when recording
  useEffect(() => {
    if (isRecording) {
      pulseOpacity.setValue(1);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.35,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
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
      <Animated.View
        style={[
          styles.header,
          { opacity: headerFade, transform: [{ translateY: headerSlide }] },
        ]}
      >
        {/* Decorative blob */}
        <View style={styles.headerBlob} />

        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>Good morning,</Text>
            <Text style={styles.headerName}>{firstName}</Text>
          </View>
          <TouchableOpacity style={styles.headerAvatar}>
            <MaterialCommunityIcons
              name="account-outline"
              size={22}
              color={COLOR.white}
            />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatBadge icon="translate" value="128" label="Sessions" />
          <View style={styles.statDivider} />
          <StatBadge icon="clock-outline" value="2.1s" label="Avg. Speed" />
          <View style={styles.statDivider} />
          <StatBadge icon="check-circle-outline" value="98%" label="Accuracy" />
        </View>
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ASL Translator Card ──────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.translatorCard,
            { opacity: cardFade, transform: [{ scale: cardScale }] },
          ]}
        >
          {/* Card header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIconWrap}>
                <MaterialCommunityIcons
                  name="sign-language"
                  size={18}
                  color={COLOR.tealBright}
                />
              </View>
              <View>
                <Text style={styles.cardTitle}>ASL Translator</Text>
                <Text style={styles.cardSub}>
                  Point camera at signing hands
                </Text>
              </View>
            </View>
            <View
              style={[styles.liveBadge, isRecording && styles.liveBadgeActive]}
            >
              <View
                style={[styles.liveDot, isRecording && styles.liveDotActive]}
              />
              <Text
                style={[styles.liveText, isRecording && styles.liveTextActive]}
              >
                {isRecording ? 'LIVE' : 'IDLE'}
              </Text>
            </View>
          </View>

          {/* Camera Viewfinder Placeholder */}
          <View style={styles.viewfinderWrap}>
            <View style={styles.viewfinder}>
              {/* Corner brackets */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />

              {/* Center content */}
              <View style={styles.viewfinderCenter}>
                <MaterialCommunityIcons
                  name="hand-wave-outline"
                  size={48}
                  color={
                    isRecording ? COLOR.tealLight : 'rgba(126,221,227,0.35)'
                  }
                />
                <Text style={styles.viewfinderHint}>
                  {isRecording
                    ? 'Detecting gestures…'
                    : 'Camera feed will appear here'}
                </Text>
              </View>

              {/* Pulse ring */}
              {isRecording && (
                <Animated.View
                  style={[
                    styles.pulseRing,
                    {
                      opacity: pulseOpacity,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                />
              )}
            </View>
          </View>

          {/* Translation output */}
          <View style={styles.outputBox}>
            <Text style={styles.outputLabel}>TRANSLATION OUTPUT</Text>
            <Text
              style={[
                styles.outputText,
                !isRecording && styles.outputTextMuted,
              ]}
            >
              {isRecording
                ? 'Listening for signs…'
                : 'Start a session to see translations'}
            </Text>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            style={[styles.startBtn, isRecording && styles.stopBtn]}
            onPress={() => setIsRecording(prev => !prev)}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={isRecording ? 'stop-circle-outline' : 'camera-outline'}
              size={20}
              color={isRecording ? '#EF4444' : COLOR.tealDeep}
            />
            <Text
              style={[styles.startBtnText, isRecording && styles.stopBtnText]}
            >
              {isRecording ? 'Stop Session' : 'Start Translation'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.quickGrid}>
          {[
            { icon: 'history', label: 'Session History' },
            { icon: 'bookmark-outline', label: 'Saved Signs' },
            { icon: 'account-group-outline', label: 'Patients' },
            { icon: 'chart-line', label: 'Analytics' },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.quickCard}
              activeOpacity={0.75}
            >
              <View style={styles.quickIconWrap}>
                <MaterialCommunityIcons
                  name={item.icon}
                  size={22}
                  color={COLOR.tealBright}
                />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Recent Translations ──────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>RECENT TRANSLATIONS</Text>
        <View style={styles.card}>
          <RecentRow
            sign="Hello"
            translation="Greeting gesture detected"
            time="2m ago"
          />
          <RecentRow
            sign="Pain"
            translation="Medical distress indicator"
            time="14m ago"
          />
          <RecentRow
            sign="Help"
            translation="Urgent assistance request"
            time="1h ago"
          />
          <TouchableOpacity style={styles.viewAllRow}>
            <Text style={styles.viewAllText}>View all sessions</Text>
            <MaterialCommunityIcons
              name="arrow-right"
              size={15}
              color={COLOR.tealBright}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR.bgPage,
  },

  // ── Header
  header: {
    backgroundColor: COLOR.tealDeep,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute',
    top: -W * 0.2,
    right: -W * 0.15,
    width: W * 0.55,
    height: W * 0.55,
    borderRadius: W * 0.275,
    backgroundColor: 'rgba(10,155,170,0.13)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerGreeting: {
    fontFamily: FONT.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  headerName: {
    fontFamily: FONT.serif,
    fontSize: 26,
    color: COLOR.white,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  statBadge: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statValue: {
    fontFamily: FONT.serif,
    fontSize: 17,
    color: COLOR.tealLight,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: FONT.sans,
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.40)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Scroll
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 0,
  },

  // ── Translator Card
  translatorCard: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.xl,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: FONT.serif,
    fontSize: 17,
    color: COLOR.inkPrimary,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: COLOR.borderIdle,
  },
  liveBadgeActive: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  liveDotActive: {
    backgroundColor: '#22C55E',
  },
  liveText: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.inkFaint,
    letterSpacing: 0.8,
  },
  liveTextActive: {
    color: '#16A34A',
  },

  // Viewfinder
  viewfinderWrap: {
    marginBottom: 14,
  },
  viewfinder: {
    height: 200,
    borderRadius: RADIUS.lg,
    backgroundColor: '#0D2B2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.20)',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: COLOR.tealLight,
    borderWidth: 2,
  },
  cornerTL: {
    top: 14,
    left: 14,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 14,
    right: 14,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 14,
    left: 14,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 14,
    right: 14,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 4,
  },
  viewfinderCenter: {
    alignItems: 'center',
    gap: 10,
  },
  viewfinderHint: {
    fontFamily: FONT.sans,
    fontSize: 12,
    color: 'rgba(126,221,227,0.45)',
    letterSpacing: 0.3,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(126,221,227,0.30)',
  },

  // Output box
  outputBox: {
    backgroundColor: COLOR.bgPage,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.borderIdle,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
  outputLabel: {
    fontFamily: FONT.sans,
    fontSize: 9,
    fontWeight: '700',
    color: COLOR.inkFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  outputText: {
    fontFamily: FONT.serif,
    fontSize: 15,
    color: COLOR.inkPrimary,
    letterSpacing: -0.1,
  },
  outputTextMuted: {
    color: COLOR.inkFaint,
    fontFamily: FONT.sans,
    fontSize: 13,
    fontStyle: 'italic',
  },

  // Buttons
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.tealLight,
    borderRadius: RADIUS.md,
    height: 52,
    gap: 10,
  },
  startBtnText: {
    fontFamily: FONT.sans,
    fontSize: 15,
    fontWeight: '700',
    color: COLOR.tealDeep,
    letterSpacing: 0.2,
  },
  stopBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  stopBtnText: {
    color: '#EF4444',
  },

  // ── Section label
  sectionLabel: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },

  // ── Quick Grid
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  quickCard: {
    width: (W - 50) / 2,
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  quickIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: FONT.sans,
    fontSize: 12,
    fontWeight: '600',
    color: COLOR.inkPrimary,
    flex: 1,
    lineHeight: 16,
  },

  // ── Recent
  card: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    overflow: 'hidden',
    marginBottom: 8,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.borderCard,
  },
  recentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentSign: {
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: '700',
    color: COLOR.inkPrimary,
  },
  recentTranslation: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    marginTop: 1,
  },
  recentTime: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    fontWeight: '500',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 5,
  },
  viewAllText: {
    fontFamily: FONT.sans,
    fontSize: 12,
    fontWeight: '600',
    color: COLOR.tealBright,
    letterSpacing: 0.2,
  },
});
