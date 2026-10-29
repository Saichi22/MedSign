// SignDetailScreen.jsx
// Opened from the Dictionary. Shows the sign image in a viewfinder stage, the name
// and category, English / Tagalog meaning tiles, a "how to use it" note, and
// related words. A sticky footer jumps to the next related sign.
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  Animated,
  Easing,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR, FONT, RADIUS, WINDOW_WIDTH as W } from '../../../../styles/colors/theme';
import { LESSON_GROUPS, phraseById, relatedPhrases, detectorLabelFor } from '../../../../data/phrasebookData';
import { SIGN_MEDIA } from '../../../../data/signMedia';

export default function SignDetailScreen() {
  const navigation = useNavigation();
  const { id } = useRoute().params || {};

  const phrase = phraseById(id);
  const group = phrase ? LESSON_GROUPS.find((g) => g.key === phrase.category) : null;
  const media = phrase ? SIGN_MEDIA[phrase.id] : null;
  const related = relatedPhrases(phrase);
  const tint = group?.tint;
  const accent = tint?.icon || COLOR.tealBright;
  const camera = !!(phrase && detectorLabelFor(phrase));

  // Entrance: stage, then name + meaning, then related
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    anims.forEach((v) => v.setValue(0));
    Animated.stagger(
      90,
      anims.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ),
    ).start();
  }, [id]);

  const enter = (v) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  if (!phrase) {
    return (
      <View style={[s.root, s.centered]}>
        <StatusBar barStyle="dark-content" backgroundColor={COLOR.bgPage} />
        <View style={s.emptyIcon}>
          <MaterialCommunityIcons name="hand-wave-outline" size={30} color={COLOR.tealBright} />
        </View>
        <Text style={s.emptyText}>Sign not found</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Text style={s.emptyBtnText}>Back to dictionary</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const next = related[0];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerBlob} />
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLOR.tealLight} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>FILIPINO SIGN LANGUAGE</Text>
            <Text style={s.title}>Sign</Text>
          </View>
          {group && (
            <View style={s.headerTile}>
              <MaterialCommunityIcons name={group.icon} size={20} color={COLOR.tealLight} />
            </View>
          )}
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Sign image stage */}
        <Animated.View style={enter(anims[0])}>
          <View style={s.stageCard}>
            <View style={s.stage}>
              <View style={s.stageGrid} pointerEvents="none">
                {Array.from({ length: 7 }).map((_, i) => (
                  <View key={`h${i}`} style={[s.gridH, { top: i * 40 }]} />
                ))}
                {Array.from({ length: 9 }).map((_, i) => (
                  <View key={`v${i}`} style={[s.gridV, { left: i * 44 }]} />
                ))}
              </View>

              {media ? (
                <Image source={media} style={s.stageImg} resizeMode="contain" />
              ) : (
                <>
                  <MaterialCommunityIcons name="hand-wave-outline" size={56} color="rgba(255,255,255,0.45)" />
                  <Text style={s.stageText}>Sign image coming soon</Text>
                </>
              )}

              {camera && (
                <View style={s.stageBadge} pointerEvents="none">
                  <MaterialCommunityIcons name="camera-outline" size={12} color={COLOR.tealLight} />
                  <Text style={s.stageBadgeText}>CAMERA READY</Text>
                </View>
              )}

              <View style={[s.corner, s.cornerTL]} pointerEvents="none" />
              <View style={[s.corner, s.cornerTR]} pointerEvents="none" />
              <View style={[s.corner, s.cornerBL]} pointerEvents="none" />
              <View style={[s.corner, s.cornerBR]} pointerEvents="none" />
            </View>
          </View>
        </Animated.View>

        {/* Name + meaning */}
        <Animated.View style={enter(anims[1])}>
          <View style={s.nameBlock}>
            <Text style={s.name}>{phrase.fsl}</Text>
            {group && (
              <View style={[s.catPill, { backgroundColor: tint.bg, borderColor: tint.border }]}>
                <MaterialCommunityIcons name={group.icon} size={13} color={accent} />
                <Text style={[s.catText, { color: accent }]}>{group.title}</Text>
              </View>
            )}
          </View>

          <View style={s.tiles}>
            <View style={[s.tile, s.tileTeal]}>
              <View style={s.tileHead}>
                <MaterialCommunityIcons name="translate" size={13} color={COLOR.tealMid} />
                <Text style={s.tileLabel}>English</Text>
              </View>
              <Text style={s.english}>{phrase.english}</Text>
            </View>
            <View style={s.tile}>
              <View style={s.tileHead}>
                <MaterialCommunityIcons name="comment-text-outline" size={13} color={COLOR.inkFaint} />
                <Text style={s.tileLabel}>Tagalog</Text>
              </View>
              <Text style={s.tagalog}>{phrase.tagalog}</Text>
            </View>
          </View>

          {!!phrase.description && (
            <View style={s.noteCard}>
              <View style={[s.noteAccent, { backgroundColor: accent }]} pointerEvents="none" />
              <View style={s.noteHead}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={15} color={accent} />
                <Text style={[s.noteLabel, { color: accent }]}>HOW TO USE IT</Text>
              </View>
              <Text style={s.description}>{phrase.description}</Text>
            </View>
          )}
        </Animated.View>

        {/* Related words */}
        {related.length > 0 && (
          <Animated.View style={[s.relatedWrap, enter(anims[2])]}>
            <View style={s.relatedHead}>
              <Text style={s.sectionTitle}>Related words</Text>
              <Text style={s.sectionCount}>{related.length}</Text>
            </View>
            <View style={s.chipsRow}>
              {related.map((r) => {
                const g = LESSON_GROUPS.find((x) => x.key === r.category);
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={s.chip}
                    onPress={() => navigation.push('SignDetail', { id: r.id })}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        s.chipIcon,
                        g && { backgroundColor: g.tint.bg, borderColor: g.tint.border },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={g?.icon || 'hand-wave-outline'}
                        size={16}
                        color={g?.tint.icon || COLOR.tealBright}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.chipFsl} numberOfLines={1}>{r.fsl}</Text>
                      <Text style={s.chipEnglish} numberOfLines={1}>{r.english}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={s.nextBtn}
              onPress={() => navigation.push('SignDetail', { id: next.id })}
              activeOpacity={0.88}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.nextLabel}>NEXT RELATED WORD</Text>
                <Text style={s.nextName} numberOfLines={1}>{next.fsl}</Text>
              </View>
              <View style={s.nextArrow}>
                <MaterialCommunityIcons name="arrow-right" size={22} color={COLOR.tealDeep} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bgPage },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },

  // ── Header ──────────────────────────────────────────────────────────────────
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
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  eyebrow: { fontFamily: FONT.sans, fontSize: 10, fontWeight: '700', color: COLOR.tealLight, letterSpacing: 1.8, marginBottom: 2 },
  title: { fontFamily: FONT.serif, fontSize: 26, color: COLOR.white, letterSpacing: -0.4 },
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

  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },

  // ── Sign stage ──────────────────────────────────────────────────────────────
  stageCard: {
    borderRadius: RADIUS.xl,
    padding: 6,
    backgroundColor: COLOR.bgCard,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  stage: {
    height: 280,
    borderRadius: RADIUS.xl - 4,
    backgroundColor: '#0D2B2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stageGrid: { ...StyleSheet.absoluteFillObject },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(126,221,227,0.07)' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(126,221,227,0.07)' },
  stageImg: { width: '100%', height: '100%' },
  stageText: { fontFamily: FONT.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 10 },
  stageBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(126,221,227,0.30)',
  },
  stageBadgeText: { fontFamily: FONT.sans, fontSize: 9.5, fontWeight: '700', color: COLOR.tealLight, letterSpacing: 1.2 },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: COLOR.tealLight, borderWidth: 2.5 },
  cornerTL: { top: 14, left: 14, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 14, right: 14, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 14, left: 14, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 14, right: 14, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },

  // ── Name ────────────────────────────────────────────────────────────────────
  nameBlock: { alignItems: 'center', marginTop: 22, marginBottom: 18 },
  name: {
    fontFamily: FONT.serif,
    fontSize: 34,
    color: COLOR.inkPrimary,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  catText: { fontFamily: FONT.sans, fontSize: 11.5, fontWeight: '700' },

  // ── Meaning tiles ───────────────────────────────────────────────────────────
  tiles: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    padding: 14,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tileTeal: { borderColor: COLOR.borderCard },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  tileLabel: { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: '700', color: COLOR.inkFaint, letterSpacing: 0.8 },
  english: { fontFamily: FONT.sans, fontSize: 16, fontWeight: '700', color: COLOR.tealMid, lineHeight: 22 },
  tagalog: { fontFamily: FONT.sans, fontSize: 15, fontStyle: 'italic', color: COLOR.inkMuted, lineHeight: 22 },

  // ── How to use it ───────────────────────────────────────────────────────────
  noteCard: {
    marginTop: 12,
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingVertical: 16,
    paddingLeft: 20,
    paddingRight: 16,
    overflow: 'hidden',
  },
  noteAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  noteLabel: { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2 },
  description: { fontFamily: FONT.sans, fontSize: 14.5, lineHeight: 22, color: COLOR.inkPrimary },

  // ── Related ─────────────────────────────────────────────────────────────────
  relatedWrap: { marginTop: 26 },
  relatedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontFamily: FONT.serif, fontSize: 18, color: COLOR.inkPrimary, letterSpacing: -0.2 },
  sectionCount: {
    fontFamily: FONT.sans,
    fontSize: 11,
    fontWeight: '700',
    color: COLOR.tealBright,
    backgroundColor: COLOR.tealGlow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  chipIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipFsl: { fontFamily: FONT.serif, fontSize: 14.5, color: COLOR.inkPrimary },
  chipEnglish: { fontFamily: FONT.sans, fontSize: 11, fontWeight: '600', color: COLOR.tealBright, marginTop: 1 },

  // ── Sticky footer ───────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: COLOR.bgPage,
    borderTopWidth: 1,
    borderTopColor: COLOR.borderCard,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    marginTop: 20,
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealDeep,
  },
  nextLabel: { fontFamily: FONT.sans, fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.2 },
  nextName: { fontFamily: FONT.serif, fontSize: 17, color: COLOR.white, marginTop: 2 },
  nextArrow: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Not found ───────────────────────────────────────────────────────────────
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontFamily: FONT.serif, fontSize: 17, color: COLOR.inkMuted },
  emptyBtn: {
    marginTop: 8,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { fontFamily: FONT.sans, fontSize: 14, fontWeight: '700', color: COLOR.tealDeep },
});