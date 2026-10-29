// DictionaryScreen.jsx
// Searchable A–Z sign dictionary built from the same data the lessons use.
// Filter by lesson category (chips) or jump by letter (side index).
// Tap an entry to open its detail screen.
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SectionList,
  StatusBar,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR, FONT, RADIUS, WINDOW_WIDTH as W } from '../../../../styles/colors/theme';
import { PHRASES, LESSON_GROUPS } from '../../../../data/phrasebookData';

const GROUP_BY_KEY = Object.fromEntries(LESSON_GROUPS.map((g) => [g.key, g]));
const firstLetter = (str) => (str?.trim()?.[0] || '#').toUpperCase();

// ─── One dictionary entry ────────────────────────────────────────────────────
function Entry({ item, onPress }) {
  const group = GROUP_BY_KEY[item.category];
  const tint = group?.tint;

  return (
    <TouchableOpacity style={s.entry} onPress={onPress} activeOpacity={0.88}>
      <View
        style={[
          s.entryIcon,
          tint && { backgroundColor: tint.bg, borderColor: tint.border },
        ]}
      >
        <MaterialCommunityIcons
          name={group?.icon || 'hand-wave-outline'}
          size={20}
          color={tint?.icon || COLOR.tealBright}
        />
      </View>

      <View style={s.entryBody}>
        <Text style={s.entryFsl} numberOfLines={1}>{item.fsl}</Text>
        <Text style={s.entryEnglish} numberOfLines={1}>{item.english}</Text>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={20} color={COLOR.inkFaint} />
    </TouchableOpacity>
  );
}

// ─── Category chip ───────────────────────────────────────────────────────────
function CategoryChip({ label, icon, color, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <MaterialCommunityIcons name={icon} size={14} color={active ? COLOR.white : color} />
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DictionaryScreen() {
  const navigation = useNavigation();
  const [search, setSearch] = useState('');
  const [letter, setLetter] = useState(null);
  const [category, setCategory] = useState(null);

  const sorted = useMemo(
    () => [...PHRASES].sort((a, b) => a.fsl.localeCompare(b.fsl)),
    [],
  );

  const letters = useMemo(
    () => Array.from(new Set(sorted.map((p) => firstLetter(p.fsl)))),
    [sorted],
  );

  // Everything except the letter filter, so the side index can still show
  // which letters exist for the current search + category.
  const baseList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        p.fsl.toLowerCase().includes(q) ||
        p.english.toLowerCase().includes(q) ||
        p.tagalog.toLowerCase().includes(q)
      );
    });
  }, [sorted, search, category]);

  const availableLetters = useMemo(
    () => new Set(baseList.map((p) => firstLetter(p.fsl))),
    [baseList],
  );

  const list = useMemo(
    () => (letter ? baseList.filter((p) => firstLetter(p.fsl) === letter) : baseList),
    [baseList, letter],
  );

  const sections = useMemo(() => {
    const map = {};
    list.forEach((p) => {
      const k = firstLetter(p.fsl);
      (map[k] = map[k] || []).push(p);
    });
    return Object.keys(map).sort().map((k) => ({ title: k, data: map[k] }));
  }, [list]);

  const hasFilter = !!(letter || category || search.trim());
  const clearAll = () => {
    setLetter(null);
    setCategory(null);
    setSearch('');
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <View style={s.header}>
        <View style={s.headerBlob} />
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLOR.tealLight} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>FILIPINO SIGN LANGUAGE</Text>
            <Text style={s.title}>Dictionary</Text>
          </View>
          <View style={s.totalPill}>
            <MaterialCommunityIcons name="hand-wave-outline" size={13} color={COLOR.tealLight} />
            <Text style={s.totalText}>{PHRASES.length}</Text>
          </View>
        </View>

        <View style={s.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color="rgba(255,255,255,0.6)" style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by sign, English or Tagalog…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category filter */}
      <View style={s.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsContent}>
          <CategoryChip
            label="All"
            icon="view-grid-outline"
            color={COLOR.tealDeep}
            active={category === null}
            onPress={() => setCategory(null)}
          />
          {LESSON_GROUPS.map((g) => (
            <CategoryChip
              key={g.key}
              label={g.title}
              icon={g.icon}
              color={g.tint.icon}
              active={category === g.key}
              onPress={() => setCategory(category === g.key ? null : g.key)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Result count + clear */}
      <View style={s.countRow}>
        <Text style={s.countText}>
          {list.length} {list.length === 1 ? 'sign' : 'signs'}
          {letter ? ` starting with ${letter}` : ''}
        </Text>
        {hasFilter && (
          <TouchableOpacity onPress={clearAll} style={s.clearBtn} activeOpacity={0.8}>
            <MaterialCommunityIcons name="close" size={12} color={COLOR.tealBright} />
            <Text style={s.clearText}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.listWrap}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => (
            <View style={s.sectionRow}>
              <View style={s.sectionBadge}>
                <Text style={s.sectionBadgeText}>{section.title}</Text>
              </View>
              <View style={s.sectionLine} />
            </View>
          )}
          renderItem={({ item }) => (
            <Entry item={item} onPress={() => navigation.navigate('SignDetail', { id: item.id })} />
          )}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <MaterialCommunityIcons name="text-search" size={30} color={COLOR.tealBright} />
              </View>
              <Text style={s.emptyText}>No signs found</Text>
              <Text style={s.emptyHint}>Try another word, or clear the filters.</Text>
              {hasFilter && (
                <TouchableOpacity style={s.emptyBtn} onPress={clearAll} activeOpacity={0.88}>
                  <Text style={s.emptyBtnText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        {/* A–Z index on the right edge */}
        <View style={s.rail} pointerEvents="box-none">
          {letters.map((l) => {
            const enabled = availableLetters.has(l);
            const active = letter === l;
            return (
              <TouchableOpacity
                key={l}
                disabled={!enabled}
                onPress={() => setLetter(active ? null : l)}
                style={[s.railItem, active && s.railItemActive]}
                hitSlop={{ top: 1, bottom: 1, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    s.railText,
                    !enabled && s.railTextOff,
                    active && s.railTextActive,
                  ]}
                >
                  {l}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bgPage },

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
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
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
  totalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  totalText: { fontFamily: FONT.sans, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: { flex: 1, fontFamily: FONT.sans, fontSize: 14, color: COLOR.white, paddingVertical: 0 },

  // ── Category chips ──────────────────────────────────────────────────────────
  chipsWrap: { paddingTop: 14 },
  chipsContent: { paddingHorizontal: 20, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.bgCard,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
  },
  chipText: { fontFamily: FONT.sans, fontSize: 12.5, fontWeight: '700', color: COLOR.inkMuted },
  chipTextActive: { color: COLOR.white },

  // ── Count row ───────────────────────────────────────────────────────────────
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 2,
    minHeight: 34,
  },
  countText: { fontFamily: FONT.sans, fontSize: 12.5, fontWeight: '600', color: COLOR.inkFaint },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
  },
  clearText: { fontFamily: FONT.sans, fontSize: 11.5, fontWeight: '700', color: COLOR.tealBright },

  // ── List ────────────────────────────────────────────────────────────────────
  listWrap: { flex: 1 },
  listContent: { paddingLeft: 20, paddingRight: 36, paddingTop: 4, paddingBottom: 48 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 10 },
  sectionBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLOR.tealDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: { fontFamily: FONT.serif, fontSize: 15, color: COLOR.tealLight },
  sectionLine: { flex: 1, height: 1, backgroundColor: COLOR.borderIdle },

  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  entryIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryBody: { flex: 1 },
  entryFsl: { fontFamily: FONT.serif, fontSize: 17, color: COLOR.inkPrimary, letterSpacing: -0.1 },
  entryEnglish: { fontFamily: FONT.sans, fontSize: 12.5, fontWeight: '600', color: COLOR.tealBright, marginTop: 2 },

  // ── A–Z side index ──────────────────────────────────────────────────────────
  rail: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railItem: {
    width: 20,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railItemActive: { backgroundColor: COLOR.tealDeep },
  railText: { fontFamily: FONT.sans, fontSize: 10, fontWeight: '700', color: COLOR.tealBright },
  railTextOff: { color: COLOR.borderIdle },
  railTextActive: { color: COLOR.white },

  // ── Empty ───────────────────────────────────────────────────────────────────
  emptyWrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, gap: 6 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyText: { fontFamily: FONT.serif, fontSize: 18, color: COLOR.inkPrimary },
  emptyHint: { fontFamily: FONT.sans, fontSize: 13, color: COLOR.inkFaint, textAlign: 'center' },
  emptyBtn: {
    marginTop: 12,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { fontFamily: FONT.sans, fontSize: 14, fontWeight: '700', color: COLOR.tealDeep },
});