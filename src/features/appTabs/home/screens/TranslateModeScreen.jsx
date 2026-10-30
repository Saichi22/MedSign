// TranslateModeScreen.jsx
// Compact layout with extra bottom space removed from the option tiles.
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR, FONT, RADIUS, WINDOW_WIDTH as W } from '../../../../styles/colors/theme';
import { MODE_TABS } from './ModeTabs';

const MODE_META = {
  sign: {
    icon: 'hand-wave-outline',
    tint: { bg: 'rgba(10,155,170,0.10)', border: 'rgba(10,155,170,0.22)', icon: '#0A9BAA' },
  },
  speech: {
    icon: 'microphone-outline',
    tint: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.24)', icon: '#D97706' },
  },
};

// ─── Option tile with press-scale ────────────────────────────────────────────
function ModeOption({ label, meta, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 120, friction: 8 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start();

  return (
    <Animated.View style={[s.optionWrap, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={s.option}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        <View style={[s.optionAccent, { backgroundColor: meta.tint.icon }]} pointerEvents="none" />
        <MaterialCommunityIcons
          name={meta.icon}
          size={70}
          color={meta.tint.icon}
          style={s.optionWatermark}
        />

        <View style={s.optionHeaderRow}>
          <View style={[s.optionIconWrap, { backgroundColor: meta.tint.bg, borderColor: meta.tint.border }]}>
            <MaterialCommunityIcons name={meta.icon} size={22} color={meta.tint.icon} />
          </View>
          <View style={s.optionGo}>
            <MaterialCommunityIcons name="arrow-right" size={14} color={COLOR.tealDeep} />
          </View>
        </View>

        <Text style={s.optionText} numberOfLines={1}>
          {label}
        </Text>
        <Text style={s.optionSub} numberOfLines={2}>
          {meta.sub}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function TranslateModeScreen() {
  const navigation = useNavigation();

  // Entrance: card fades/slides up, then the options
  const cardAnim = useRef(new Animated.Value(0)).current;
  const optAnims = useRef(MODE_TABS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.stagger(
        90,
        optAnims.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 340,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ),
    ]).start();
  }, []);

  const rise = (v, dist = 18) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dist, 0] }) }],
  });

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* Ambient page background */}
      <View style={s.bgLayer} pointerEvents="none">
        <View style={s.bgBlobTop} />
        <View style={s.bgBlobBottom} />
      </View>

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerBlob} />

        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLOR.tealLight} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MEDSIGN TRANSLATOR</Text>
            <Text style={s.headerTitle}>Translate</Text>
          </View>

          <View style={s.headerTile}>
            <MaterialCommunityIcons name="translate" size={20} color={COLOR.tealLight} />
          </View>
        </View>

        <Text style={s.headerSub}>Choose how you want to translate</Text>
      </View>

      {/* Main Content */}
      <View style={s.content}>
        <Animated.View style={[s.container, rise(cardAnim, 24)]}>
          {/* Card texture */}
          <View style={s.cardGlow} pointerEvents="none" />
          <View style={s.cardGrid} pointerEvents="none">
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={`h${i}`} style={[s.gridH, { top: i * 46 }]} />
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={`v${i}`} style={[s.gridV, { left: i * 48 }]} />
            ))}
          </View>

          <View style={s.titleBlock}>
            <View style={s.titleDash} />
            <Text style={s.title}>Select Mode</Text>
            <Text style={s.titleSub}>Pick one to get started</Text>
          </View>

          <View style={s.options}>
            {MODE_TABS.map((m, i) => (
              <Animated.View key={m.key} style={[{ flex: 1 }, rise(optAnims[i], 14)]}>
                <ModeOption
                  label={m.label}
                  meta={MODE_META[m.key] || MODE_META.sign}
                  onPress={() => navigation.navigate(m.route)}
                />
              </Animated.View>
            ))}
          </View>

          <View style={s.hintRow}>
            <MaterialCommunityIcons name="swap-horizontal" size={14} color={COLOR.inkFaint} />
            <Text style={s.hintText}>You can switch modes anytime inside the translator</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR.bgPage,
  },

  // Ambient background
  bgLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  bgBlobTop: {
    position: 'absolute',
    top: W * 0.45,
    left: -W * 0.3,
    width: W * 0.7,
    height: W * 0.7,
    borderRadius: W * 0.35,
    backgroundColor: 'rgba(10,155,170,0.07)',
  },
  bgBlobBottom: {
    position: 'absolute',
    bottom: -W * 0.25,
    right: -W * 0.25,
    width: W * 0.75,
    height: W * 0.75,
    borderRadius: W * 0.375,
    backgroundColor: 'rgba(245,158,11,0.06)',
  },

  // Header
  header: {
    backgroundColor: COLOR.tealDeep,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute',
    top: -W * 0.2,
    right: -W * 0.1,
    width: W * 0.5,
    height: W * 0.5,
    borderRadius: W * 0.25,
    backgroundColor: 'rgba(10,155,170,0.13)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.tealLight,
    letterSpacing: 1.8,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: FONT.serif,
    fontSize: 26,
    color: COLOR.white,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: FONT.sans,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 12,
  },

  // Content
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 25,
  },
  container: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLOR.bgCard,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingHorizontal: 14,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'stretch',
    overflow: 'hidden',
    elevation: 5,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
  },
  cardGlow: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(126,221,227,0.22)',
  },
  cardGrid: { ...StyleSheet.absoluteFillObject },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(10,155,170,0.05)' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(10,155,170,0.05)' },

  titleBlock: { alignItems: 'center', alignSelf: 'center' },
  titleDash: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLOR.tealLight,
    marginBottom: 10,
  },
  title: {
    fontFamily: FONT.serif,
    fontSize: 22,
    fontWeight: '700',
    color: COLOR.inkPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  titleSub: {
    fontFamily: FONT.sans,
    fontSize: 12,
    color: COLOR.inkFaint,
    marginTop: 2,
    textAlign: 'center',
  },

  options: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
  },
  optionWrap: { alignSelf: 'stretch' },
  option: {
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLOR.borderIdle,
    backgroundColor: COLOR.bgCard,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    overflow: 'hidden',
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  optionAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 4 },
  optionWatermark: { position: 'absolute', right: -12, bottom: -10, opacity: 0.07 },
  optionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionGo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLOR.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontFamily: FONT.serif,
    fontSize: 15,
    fontWeight: '700',
    color: COLOR.tealDeep,
    letterSpacing: -0.2,
  },
  optionSub: {
    fontFamily: FONT.sans,
    fontSize: 11,
    lineHeight: 15,
    color: COLOR.inkFaint,
    marginTop: 2,
  },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    alignSelf: 'center',
  },
  hintText: {
    fontFamily: FONT.sans,
    fontSize: 11.5,
    color: COLOR.inkFaint,
    textAlign: 'center',
    flexShrink: 1,
  },
});