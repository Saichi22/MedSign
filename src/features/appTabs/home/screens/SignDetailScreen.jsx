// SignDetailScreen.jsx
// Opened from the Dictionary. Shows the sign image, its name underneath,
// a short meaning, and related words you can tap to jump between signs.
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR, FONT, RADIUS, WINDOW_WIDTH as W } from '../../../../styles/colors/theme';
import { LESSON_GROUPS, phraseById, relatedPhrases } from '../../../../data/phrasebookData';
import { SIGN_MEDIA } from '../../../../data/signMedia';

export default function SignDetailScreen() {
  const navigation = useNavigation();
  const { id } = useRoute().params || {};

  const phrase = phraseById(id);
  const group = phrase ? LESSON_GROUPS.find((g) => g.key === phrase.category) : null;
  const media = phrase ? SIGN_MEDIA[phrase.id] : null;
  const related = relatedPhrases(phrase);

  if (!phrase) {
    return (
      <View style={[s.root, s.centered]}>
        <StatusBar barStyle="dark-content" backgroundColor={COLOR.bgPage} />
        <MaterialCommunityIcons name="hand-wave-outline" size={40} color={COLOR.inkFaint} />
        <Text style={s.emptyText}>Sign not found</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Text style={s.emptyBtnText}>Back to dictionary</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <View style={s.header}>
        <View style={s.headerBlob} />
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLOR.tealLight} />
          </TouchableOpacity>
          <View>
            <Text style={s.eyebrow}>FILIPINO SIGN LANGUAGE</Text>
            <Text style={s.title}>Sign</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Sign image */}
        <View style={s.stage}>
          {media ? (
            <Image source={media} style={s.stageImg} resizeMode="contain" />
          ) : (
            <>
              <MaterialCommunityIcons name="hand-wave-outline" size={56} color="rgba(255,255,255,0.45)" />
              <Text style={s.stageText}>Sign image coming soon</Text>
            </>
          )}
          <View style={[s.corner, s.cornerTL]} pointerEvents="none" />
          <View style={[s.corner, s.cornerTR]} pointerEvents="none" />
          <View style={[s.corner, s.cornerBL]} pointerEvents="none" />
          <View style={[s.corner, s.cornerBR]} pointerEvents="none" />
        </View>

        {/* Name under the image */}
        <View style={s.nameBlock}>
          <Text style={s.name}>{phrase.fsl}</Text>
          {group && (
            <View style={[s.catPill, { backgroundColor: group.tint.bg, borderColor: group.tint.border }]}>
              <MaterialCommunityIcons name={group.icon} size={13} color={group.tint.icon} />
              <Text style={[s.catText, { color: group.tint.icon }]}>{group.title}</Text>
            </View>
          )}
        </View>

        {/* Meaning */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Meaning</Text>
          <Text style={s.english}>{phrase.english}</Text>
          <Text style={s.tagalog}>{phrase.tagalog}</Text>
          {!!phrase.description && <Text style={s.description}>{phrase.description}</Text>}
        </View>

        {/* Related words */}
        {related.length > 0 && (
          <View style={s.relatedWrap}>
            <Text style={s.sectionTitle}>Related words</Text>
            <View style={s.chipsRow}>
              {related.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={s.chip}
                  onPress={() => navigation.push('SignDetail', { id: r.id })}
                  activeOpacity={0.85}
                >
                  <Text style={s.chipFsl}>{r.fsl}</Text>
                  <Text style={s.chipEnglish} numberOfLines={1}>{r.english}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={s.nextBtn}
              onPress={() => navigation.push('SignDetail', { id: related[0].id })}
              activeOpacity={0.88}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.nextLabel}>Next related word</Text>
                <Text style={s.nextName} numberOfLines={1}>{related[0].fsl}</Text>
              </View>
              <View style={s.nextArrow}>
                <MaterialCommunityIcons name="arrow-right" size={22} color={COLOR.tealDeep} />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bgPage },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },

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

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },

  // Sign image stage
  stage: {
    height: 280,
    borderRadius: RADIUS.xl,
    backgroundColor: '#0D2B2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stageImg: { width: '100%', height: '100%' },
  stageText: { fontFamily: FONT.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 10 },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: COLOR.tealLight, borderWidth: 2.5 },
  cornerTL: { top: 14, left: 14, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 14, right: 14, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 14, left: 14, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 14, right: 14, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },

  // Name
  nameBlock: { alignItems: 'center', marginTop: 20, marginBottom: 18 },
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  catText: { fontFamily: FONT.sans, fontSize: 11.5, fontWeight: '700' },

  // Meaning card
  card: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    padding: 18,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardLabel: { fontFamily: FONT.sans, fontSize: 11, fontWeight: '600', color: COLOR.inkFaint, marginBottom: 6 },
  english: { fontFamily: FONT.sans, fontSize: 18, fontWeight: '700', color: COLOR.tealMid },
  tagalog: { fontFamily: FONT.sans, fontSize: 14, fontStyle: 'italic', color: COLOR.inkMuted, marginTop: 3 },
  description: { fontFamily: FONT.sans, fontSize: 14, lineHeight: 21, color: COLOR.inkPrimary, marginTop: 14 },

  // Related
  relatedWrap: { marginTop: 24 },
  sectionTitle: { fontFamily: FONT.serif, fontSize: 18, color: COLOR.inkPrimary, letterSpacing: -0.2, marginBottom: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipFsl: { fontFamily: FONT.serif, fontSize: 15, color: COLOR.inkPrimary },
  chipEnglish: { fontFamily: FONT.sans, fontSize: 11.5, fontWeight: '600', color: COLOR.tealBright, marginTop: 2 },

  // Footer next button
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 28,
    backgroundColor: COLOR.bgPage,
    borderTopWidth: 1,
    borderTopColor: COLOR.borderCard,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    marginTop: 20,            // added
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealDeep,
  },
  nextLabel: { fontFamily: FONT.sans, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  nextName: { fontFamily: FONT.serif, fontSize: 17, color: COLOR.white, marginTop: 1 },
  nextArrow: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Not found
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