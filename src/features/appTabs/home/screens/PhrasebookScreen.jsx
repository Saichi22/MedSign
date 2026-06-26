// PhrasebookScreen.js
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StatusBar,
  Animated,
  Modal,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { phrasebookStyles as styles } from '../../../../styles/colors/PhrasebookStyle';
import { COLOR } from '../../../../styles/colors/theme';

// ─── Data ─────────────────────────────────────────────────────────────────────
// Each phrase: { id, fsl (Filipino label), english, tagalog, category }
const PHRASES = [
  // Pain & Discomfort
  { id: 'p01', fsl: 'MASAKIT',         english: 'It hurts / I feel pain',     tagalog: 'Masakit',              category: 'Sakit' },
  { id: 'p02', fsl: 'NAPAKA-SAKIT',    english: 'It hurts a lot',             tagalog: 'Sobrang sakit',        category: 'Sakit' },
  { id: 'p03', fsl: 'KONTING SAKIT',   english: 'Slight pain',                tagalog: 'Konti lang ang sakit', category: 'Sakit' },
  { id: 'p04', fsl: 'HAPDI',           english: 'Stinging / burning pain',    tagalog: 'Hapdi',                category: 'Sakit' },
  { id: 'p05', fsl: 'MABIGAT',         english: 'Heavy / pressure feeling',   tagalog: 'Mabigat ang pakiramdam', category: 'Sakit' },
  { id: 'p06', fsl: 'TINUTUSOK',       english: 'Sharp stabbing pain',        tagalog: 'Tinutusok',            category: 'Sakit' },

  // Body Parts
  { id: 'b01', fsl: 'ULO',             english: 'Head',                       tagalog: 'Ulo',                  category: 'Katawan' },
  { id: 'b02', fsl: 'TIYAN',           english: 'Stomach / abdomen',          tagalog: 'Tiyan',                category: 'Katawan' },
  { id: 'b03', fsl: 'DIBDIB',          english: 'Chest',                      tagalog: 'Dibdib',               category: 'Katawan' },
  { id: 'b04', fsl: 'LIKOD',           english: 'Back',                       tagalog: 'Likod',                category: 'Katawan' },
  { id: 'b05', fsl: 'BINTI',           english: 'Leg',                        tagalog: 'Binti',                category: 'Katawan' },
  { id: 'b06', fsl: 'BRASO',           english: 'Arm',                        tagalog: 'Braso',                category: 'Katawan' },
  { id: 'b07', fsl: 'LEEG',            english: 'Neck',                       tagalog: 'Leeg',                 category: 'Katawan' },
  { id: 'b08', fsl: 'MATA',            english: 'Eye',                        tagalog: 'Mata',                 category: 'Katawan' },

  // Symptoms
  { id: 's01', fsl: 'HIRAP HUMINGA',   english: 'Difficulty breathing',       tagalog: 'Hirap huminga',        category: 'Sintomas' },
  { id: 's02', fsl: 'NAHIHILO',        english: 'Dizziness / feeling faint',  tagalog: 'Nahihilo',             category: 'Sintomas' },
  { id: 's03', fsl: 'NADUDUWAL',       english: 'Nausea',                     tagalog: 'Naduduwal',            category: 'Sintomas' },
  { id: 's04', fsl: 'LAGNAT',          english: 'Fever',                      tagalog: 'May lagnat',           category: 'Sintomas' },
  { id: 's05', fsl: 'UMUUBO',          english: 'Coughing',                   tagalog: 'Umuubo',               category: 'Sintomas' },
  { id: 's06', fsl: 'PAGDURUGO',       english: 'Bleeding',                   tagalog: 'Pagdurugo',            category: 'Sintomas' },
  { id: 's07', fsl: 'PAMAMAGA',        english: 'Swelling',                   tagalog: 'Pamamaga',             category: 'Sintomas' },
  { id: 's08', fsl: 'NANLALAMIG',      english: 'Feeling cold / chills',      tagalog: 'Nanlalamig',           category: 'Sintomas' },

  // Doctor Questions (for doctor to show patient)
  { id: 'q01', fsl: 'SAAN MASAKIT?',   english: 'Where does it hurt?',        tagalog: 'Saan masakit?',        category: 'Tanong' },
  { id: 'q02', fsl: 'KAILAN NAGSIMULA?',english: 'When did it start?',        tagalog: 'Kailan nagsimula?',    category: 'Tanong' },
  { id: 'q03', fsl: 'ILANG ARAW NA?',  english: 'How many days now?',         tagalog: 'Ilang araw na?',       category: 'Tanong' },
  { id: 'q04', fsl: 'MAYROON ALLERGY?',english: 'Do you have allergies?',     tagalog: 'May allergy ka ba?',   category: 'Tanong' },
  { id: 'q05', fsl: 'UMIINOM GAMOT?',  english: 'Are you taking medicine?',   tagalog: 'Umiinom ng gamot?',    category: 'Tanong' },

  // Responses
  { id: 'r01', fsl: 'OO',              english: 'Yes',                        tagalog: 'Oo',                   category: 'Sagot' },
  { id: 'r02', fsl: 'HINDI',           english: 'No',                         tagalog: 'Hindi',                category: 'Sagot' },
  { id: 'r03', fsl: 'HINDI AKO ALAM',  english: "I don't know",               tagalog: 'Hindi ko alam',        category: 'Sagot' },
  { id: 'r04', fsl: 'SALAMAT',         english: 'Thank you',                  tagalog: 'Salamat',              category: 'Sagot' },
  { id: 'r05', fsl: 'TULUNGAN AKO',    english: 'Please help me',             tagalog: 'Tulungan mo ako',      category: 'Sagot' },
  { id: 'r06', fsl: 'ULITIN',          english: 'Please repeat that',         tagalog: 'Ulitin mo',            category: 'Sagot' },
];

const CATEGORIES = ['Lahat', 'Sakit', 'Katawan', 'Sintomas', 'Tanong', 'Sagot'];

const CATEGORY_ICONS = {
  Lahat:    'view-grid-outline',
  Sakit:    'emoticon-sad-outline',
  Katawan:  'human',
  Sintomas: 'medical-bag',
  Tanong:   'help-circle-outline',
  Sagot:    'comment-check-outline',
};

// Pain scale 1-10
const PAIN_SCALE = [1,2,3,4,5,6,7,8,9,10];
const PAIN_COLOR = (n) => {
  if (n <= 3) return '#22C55E';
  if (n <= 6) return '#F59E0B';
  return '#EF4444';
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function PhraseCard({ item, onPress, isFavorite, onToggleFav }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start(() => onPress(item));
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={styles.phraseCard} onPress={handlePress} activeOpacity={0.9}>
        <View style={styles.phraseCardLeft}>
          <Text style={styles.fslLabel}>{item.fsl}</Text>
          <Text style={styles.englishLabel}>{item.english}</Text>
          <Text style={styles.tagalogLabel}>{item.tagalog}</Text>
        </View>
        <TouchableOpacity onPress={() => onToggleFav(item.id)} style={styles.favBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={18}
            color={isFavorite ? '#EF4444' : COLOR.inkFaint}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

function CategoryPill({ label, isActive, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.categoryPill, isActive && styles.categoryPillActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <MaterialCommunityIcons
        name={CATEGORY_ICONS[label]}
        size={14}
        color={isActive ? COLOR.tealDeep : COLOR.inkFaint}
      />
      <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main PhrasebookScreen ────────────────────────────────────────────────────
export default function PhrasebookScreen() {
  const [activeCategory, setActiveCategory] = useState('Lahat');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(new Set());
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [selectedPhrase, setSelectedPhrase] = useState(null);
  const [showPainScale, setShowPainScale] = useState(false);
  const [selectedPain, setSelectedPain] = useState(null);
  const [queuedPhrases, setQueuedPhrases] = useState([]);

  const headerFade  = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-16)).current;
  const modalScale  = useRef(new Animated.Value(0.88)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade,  { toValue: 1, duration: 440, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 440, useNativeDriver: true }),
    ]).start();
  }, []);

  // Animate modal in/out
  useEffect(() => {
    if (selectedPhrase || showPainScale) {
      modalScale.setValue(0.88);
      modalOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(modalScale,   { toValue: 1, tension: 80, friction: 9, useNativeDriver: true }),
        Animated.timing(modalOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [selectedPhrase, showPainScale]);

  const filtered = useMemo(() => {
    let list = PHRASES;
    if (activeCategory !== 'Lahat') list = list.filter(p => p.category === activeCategory);
    if (showFavsOnly) list = list.filter(p => favorites.has(p.id));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.fsl.toLowerCase().includes(q) ||
        p.english.toLowerCase().includes(q) ||
        p.tagalog.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeCategory, search, favorites, showFavsOnly]);

  const toggleFav = (id) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const queuePhrase = (phrase) => {
    setQueuedPhrases(prev => {
      if (prev.find(p => p.id === phrase.id)) return prev;
      return [...prev, phrase];
    });
    setSelectedPhrase(null);
  };

  const removeQueued = (id) => {
    setQueuedPhrases(prev => prev.filter(p => p.id !== id));
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <View style={styles.headerBlob} />
        <Text style={styles.headerEyebrow}>FILIPINO SIGN LANGUAGE</Text>
        <Text style={styles.headerTitle}>Medical Phrasebook</Text>
        <Text style={styles.headerSub}>Tap any phrase to show your doctor</Text>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color={COLOR.inkFaint} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search phrases…"
            placeholderTextColor={COLOR.inkFaint}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={16} color={COLOR.inkFaint} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* ── Category Pills ───────────────────────────────────────────────── */}
      <View style={styles.pillsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContent}>
          {CATEGORIES.map(cat => (
            <CategoryPill
              key={cat}
              label={cat}
              isActive={activeCategory === cat}
              onPress={() => setActiveCategory(cat)}
            />
          ))}
          {/* Favourites toggle */}
          <TouchableOpacity
            style={[styles.categoryPill, showFavsOnly && styles.favPillActive]}
            onPress={() => setShowFavsOnly(v => !v)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="heart" size={14} color={showFavsOnly ? '#EF4444' : COLOR.inkFaint} />
            <Text style={[styles.categoryPillText, showFavsOnly && styles.favPillText]}>Favorites</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Pain Scale Quick-Access ──────────────────────────────────────── */}
      <TouchableOpacity style={styles.painScaleStrip} onPress={() => setShowPainScale(true)} activeOpacity={0.85}>
        <MaterialCommunityIcons name="emoticon-neutral-outline" size={16} color={COLOR.tealBright} />
        <Text style={styles.painScaleStripText}>Rate your pain level  →</Text>
        <View style={styles.painScaleMini}>
          {PAIN_SCALE.slice(0,5).map(n => (
            <View key={n} style={[styles.painDot, { backgroundColor: PAIN_COLOR(n) }]} />
          ))}
        </View>
      </TouchableOpacity>

      {/* ── Phrase List ──────────────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PhraseCard
            item={item}
            onPress={setSelectedPhrase}
            isFavorite={favorites.has(item.id)}
            onToggleFav={toggleFav}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="text-search" size={40} color={COLOR.inkFaint} />
            <Text style={styles.emptyText}>No phrases found.</Text>
            <Text style={styles.emptyHint}>Try a different search or category.</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* ── Queued Phrases Strip ─────────────────────────────────────────── */}
      {queuedPhrases.length > 0 && (
        <View style={styles.queueStrip}>
          <Text style={styles.queueLabel}>QUEUED  ·  {queuedPhrases.length}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {queuedPhrases.map(p => (
              <TouchableOpacity key={p.id} style={styles.queueChip} onPress={() => removeQueued(p.id)}>
                <Text style={styles.queueChipText}>{p.fsl}</Text>
                <MaterialCommunityIcons name="close" size={11} color={COLOR.tealDeep} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.queueShowBtn} onPress={() => setSelectedPhrase({ _isQueue: true, phrases: queuedPhrases })}>
            <Text style={styles.queueShowText}>Show</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Phrase Detail Modal ──────────────────────────────────────────── */}
      <Modal transparent visible={!!selectedPhrase} animationType="none" onRequestClose={() => setSelectedPhrase(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedPhrase(null)}>
          <Animated.View style={[styles.modalCard, { opacity: modalOpacity, transform: [{ scale: modalScale }] }]}>
            {selectedPhrase?._isQueue ? (
              // Queue display mode
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.modalEyebrow}>SHOW TO YOUR DOCTOR</Text>
                <View style={styles.queueDisplayList}>
                  {selectedPhrase.phrases.map((p, i) => (
                    <Text key={p.id} style={styles.queueDisplayPhrase}>{p.fsl}</Text>
                  ))}
                </View>
                <Text style={styles.modalEnglish}>
                  {selectedPhrase.phrases.map(p => p.english).join(' · ')}
                </Text>
              </View>
            ) : (
              // Single phrase display mode
              <>
                <View style={styles.modalCatBadge}>
                  <MaterialCommunityIcons name={CATEGORY_ICONS[selectedPhrase?.category]} size={13} color={COLOR.tealBright} />
                  <Text style={styles.modalCatText}>{selectedPhrase?.category?.toUpperCase()}</Text>
                </View>
                <Text style={styles.modalEyebrow}>SHOW TO YOUR DOCTOR</Text>
                <Text style={styles.modalFSL}>{selectedPhrase?.fsl}</Text>
                <Text style={styles.modalEnglish}>{selectedPhrase?.english}</Text>
                <Text style={styles.modalTagalog}>{selectedPhrase?.tagalog}</Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalBtnOutline} onPress={() => setSelectedPhrase(null)}>
                    <Text style={styles.modalBtnOutlineText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnFill} onPress={() => queuePhrase(selectedPhrase)}>
                    <MaterialCommunityIcons name="plus" size={16} color={COLOR.tealDeep} />
                    <Text style={styles.modalBtnFillText}>Add to Queue</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* ── Pain Scale Modal ─────────────────────────────────────────────── */}
      <Modal transparent visible={showPainScale} animationType="none" onRequestClose={() => setShowPainScale(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPainScale(false)}>
          <Animated.View style={[styles.modalCard, { opacity: modalOpacity, transform: [{ scale: modalScale }] }]}>
            <Text style={styles.painModalTitle}>Pain Scale</Text>
            <Text style={styles.painModalSub}>Tap a number to show your doctor</Text>
            <View style={styles.painGrid}>
              {PAIN_SCALE.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.painBtn, { borderColor: PAIN_COLOR(n), backgroundColor: selectedPain === n ? PAIN_COLOR(n) : 'transparent' }]}
                  onPress={() => setSelectedPain(n)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.painBtnNum, { color: selectedPain === n ? '#fff' : PAIN_COLOR(n) }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedPain && (
              <View style={[styles.painResult, { borderColor: PAIN_COLOR(selectedPain) }]}>
                <Text style={[styles.painResultNum, { color: PAIN_COLOR(selectedPain) }]}>{selectedPain} / 10</Text>
                <Text style={styles.painResultDesc}>
                  {selectedPain <= 3 ? 'Mild pain' : selectedPain <= 6 ? 'Moderate pain' : 'Severe pain'}
                </Text>
              </View>
            )}
            <TouchableOpacity style={[styles.modalBtnFill, { marginTop: 16 }]} onPress={() => setShowPainScale(false)}>
              <Text style={styles.modalBtnFillText}>Done</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}