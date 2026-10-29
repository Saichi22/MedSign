// LessonScreen.jsx
// Three steps: 1) LEARN each sign, 2) PRACTICE it on camera (the detector checks your sign),
// 3) QUIZ on those same signs. Practice is skipped for lessons with no detectable signs.
// UI only: no points, streaks or saved progress.
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated, Easing, Image, StyleSheet } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR, FONT, RADIUS } from '../../../../styles/colors/theme';
import { learnStyles as styles } from '../../../../styles/colors/LearnStyle';
import { PHRASES, LESSON_GROUPS, phrasesForGroup, detectorLabelFor } from '../../../../data/phrasebookData';
import { SIGN_MEDIA } from '../../../../data/signMedia';
import { useSignPractice } from '../../../../hooks/useSignDetector';

const SIGNS_PER_LESSON = 10;
const OPTIONS_PER_QUESTION = 4;
const LETTERS = ['A', 'B', 'C', 'D'];

// Keeps bottom buttons above the Android navigation bar / gesture area.
const useBottomPad = () => {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 16) + 12;
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// One question per lesson phrase. Distractors come from the same group first,
// then from other groups if the group is small.
function buildQuestions(lessonPhrases, groupKey) {
  const pool = phrasesForGroup(groupKey);

  return shuffle(lessonPhrases).map((phrase) => {
    const sameGroup = shuffle(pool.filter((p) => p.id !== phrase.id));
    const others = shuffle(PHRASES.filter((p) => p.category !== groupKey));
    const distractors = [...sameGroup, ...others]
      .filter((p) => p.english !== phrase.english)
      .slice(0, OPTIONS_PER_QUESTION - 1);

    return {
      id: phrase.id,
      fsl: phrase.fsl,
      english: phrase.english,
      answerId: phrase.id,
      options: shuffle([phrase, ...distractors]).map((p) => ({ id: p.id, text: p.fsl, sub: p.english })),
    };
  });
}

// ─── Sign stage: textured viewfinder frame, image or placeholder ─────────────
function SignStage({ phraseId, fsl, label, showHint }) {
  const media = SIGN_MEDIA[phraseId];
  return (
    <View style={styles.signCard}>
      <View style={styles.signCardBlob} pointerEvents="none" />
      <View style={styles.signCardBlobBottom} pointerEvents="none" />
      <View style={styles.signStage}>
        <View style={styles.stageGrid} pointerEvents="none">
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={`h${i}`} style={[styles.stageGridH, { top: i * 40 }]} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={`v${i}`} style={[styles.stageGridV, { left: i * 44 }]} />
          ))}
        </View>

        {media ? (
          <Image source={media} style={styles.signImage} resizeMode="contain" />
        ) : (
          <>
            <MaterialCommunityIcons name="hand-wave-outline" size={52} color="rgba(255,255,255,0.45)" />
            <Text style={styles.signPlaceholderText}>Sign image coming soon</Text>
            {showHint && <Text style={styles.signPlaceholderHint}>{fsl}</Text>}
          </>
        )}

        <View style={styles.stageBadge} pointerEvents="none">
          <Text style={styles.stageBadgeText}>{label}</Text>
        </View>
        <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
      </View>
    </View>
  );
}

// ─── Practice-only styles ────────────────────────────────────────────────────
const local = StyleSheet.create({
  targetCard: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  targetEyebrow: { fontFamily: FONT.sans, fontSize: 10, fontWeight: '700', color: COLOR.inkFaint, letterSpacing: 1.4 },
  targetFsl: { fontFamily: FONT.serif, fontSize: 30, color: COLOR.inkPrimary, letterSpacing: -0.5, textAlign: 'center', marginTop: 4 },
  targetEnglish: { fontFamily: FONT.sans, fontSize: 14, fontWeight: '600', color: COLOR.tealMid, marginTop: 2, textAlign: 'center' },
  cameraCard: {
    height: 320,
    borderRadius: RADIUS.xl,
    backgroundColor: '#000000',
    overflow: 'hidden',
    marginTop: 4,
  },
  statusPill: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    borderRadius: RADIUS.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
  },
  statusPillOk: { backgroundColor: 'rgba(22,163,74,0.94)' },
  statusText: { fontFamily: FONT.sans, fontSize: 13, fontWeight: '700', color: COLOR.white },
  permCard: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    padding: 22,
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  permText: { fontFamily: FONT.sans, fontSize: 13.5, color: COLOR.inkMuted, textAlign: 'center', lineHeight: 19 },
});

const niceLabel = (label) => (label || '').replace(/_/g, ' ');

// ─── Camera box that watches the learner's sign ──────────────────────────────
function PracticeCamera({ practice, active }) {
  const { hasPermission, requestPermission, device, format, cameraRef, isModelReady, modelState, seen, matched } = practice;

  if (!hasPermission) {
    return (
      <View style={local.permCard}>
        <MaterialCommunityIcons name="camera-off" size={30} color={COLOR.tealBright} />
        <Text style={local.permText}>Camera access is needed so the app can check your sign.</Text>
        <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'stretch' }]} onPress={requestPermission} activeOpacity={0.88}>
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={local.permCard}>
        <MaterialCommunityIcons name="camera-off" size={30} color={COLOR.tealBright} />
        <Text style={local.permText}>No camera found on this device. You can skip this step.</Text>
      </View>
    );
  }

  let status = 'Show the sign inside the frame';
  if (modelState === 'error') status = 'Sign model failed to load';
  else if (!isModelReady) status = 'Getting the sign checker ready…';
  else if (matched) status = 'Correct! That is the sign';
  else if (seen) status = `I see: ${niceLabel(seen.label)} (${Math.round(seen.confidence * 100)}%). Keep trying`;

  return (
    <View style={local.cameraCard}>
      <Camera
        key={device.id}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={active}
        photo={true}
        pixelFormat="yuv"
      />
      <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
      <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
      <View style={[local.statusPill, matched && local.statusPillOk]} pointerEvents="none">
        <Text style={local.statusText} numberOfLines={2}>{status}</Text>
      </View>
    </View>
  );
}

// ─── Quiz option (pops when correct, shakes when wrong) ──────────────────────
function Option({ option, letter, selectedId, answerId, onPress }) {
  const answered = selectedId !== null;
  const isCorrect = option.id === answerId;
  const isSelected = option.id === selectedId;

  const scale = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!answered || !isSelected) return;
    if (isCorrect) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.03, duration: 90, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 7 }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(shake, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 5, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [answered]);

  const showCorrect = answered && isCorrect;
  const showWrong = answered && isSelected && !isCorrect;

  return (
    <Animated.View style={{ transform: [{ scale }, { translateX: shake }] }}>
      <TouchableOpacity
        style={[
          styles.option,
          showCorrect && styles.optionCorrect,
          showWrong && styles.optionWrong,
          answered && !showCorrect && !showWrong && styles.optionDim,
        ]}
        onPress={() => onPress(option.id)}
        disabled={answered}
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.optionBadge,
            showCorrect && styles.optionBadgeCorrect,
            showWrong && styles.optionBadgeWrong,
          ]}
        >
          {showCorrect ? (
            <MaterialCommunityIcons name="check" size={18} color={COLOR.white} />
          ) : showWrong ? (
            <MaterialCommunityIcons name="close" size={18} color={COLOR.white} />
          ) : (
            <Text style={styles.optionBadgeText}>{letter}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionText}>{option.text}</Text>
          <Text style={styles.optionSub}>{option.sub}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Result ──────────────────────────────────────────────────────────────────
function ResultView({ score, total, missed, onRetry, onReview, onDone }) {
  const bottomPad = useBottomPad();
  const ratio = total ? score / total : 0;
  const perfect = score === total;
  const ringColor = ratio >= 0.7 ? '#4ADE80' : '#FBBF24';

  const pop = useRef(new Animated.Value(0.8)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.resultTop}>
          <View style={styles.resultBlob} />
          <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ scale: pop }] }}>
            <View style={[styles.resultRing, { borderColor: ringColor }]}>
              <Text style={styles.resultScore}>{score}/{total}</Text>
              <Text style={styles.resultOf}>correct</Text>
            </View>
            <Text style={styles.resultTitle}>
              {perfect ? 'All correct' : ratio >= 0.7 ? 'Nice work' : 'Keep practicing'}
            </Text>
            <Text style={styles.resultSub}>
              {perfect
                ? 'You matched every sign in this lesson.'
                : 'Look over the ones you missed, then try the quiz again.'}
            </Text>
          </Animated.View>
        </View>

        <View style={styles.resultBody}>
          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <View style={styles.statHead}>
                <MaterialCommunityIcons name="check-circle-outline" size={15} color="#16A34A" />
                <Text style={styles.statLabel}>Correct</Text>
              </View>
              <Text style={styles.statValue}>{score}</Text>
            </View>
            <View style={styles.statTile}>
              <View style={styles.statHead}>
                <MaterialCommunityIcons name="close-circle-outline" size={15} color="#DC2626" />
                <Text style={styles.statLabel}>Missed</Text>
              </View>
              <Text style={styles.statValue}>{total - score}</Text>
            </View>
          </View>

          {missed.length > 0 && (
            <View style={styles.missedCard}>
              <View style={styles.missedHeader}>
                <MaterialCommunityIcons name="bookmark-outline" size={16} color={COLOR.tealBright} />
                <Text style={styles.missedHeaderText}>Signs to review</Text>
              </View>
              {missed.map((m) => (
                <View key={m.id} style={styles.missedRow}>
                  <Text style={styles.missedFsl}>{m.fsl}</Text>
                  <Text style={styles.missedEnglish}>{m.english}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onRetry} activeOpacity={0.88}>
          <MaterialCommunityIcons name="refresh" size={20} color={COLOR.tealDeep} />
          <Text style={styles.primaryBtnText}>Retry quiz</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onReview} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Review signs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Back to lessons</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function LessonScreen() {
  const navigation = useNavigation();
  const bottomPad = useBottomPad();
  const { groupKey } = useRoute().params;
  const group = LESSON_GROUPS.find((g) => g.key === groupKey);

  const lessonPhrases = useMemo(
    () => phrasesForGroup(groupKey).slice(0, SIGNS_PER_LESSON),
    [groupKey],
  );

  const [phase, setPhase] = useState('learn'); // 'learn' | 'practice' | 'quiz' | 'result'
  const [round, setRound] = useState(0);
  const questions = useMemo(() => buildQuestions(lessonPhrases, groupKey), [lessonPhrases, groupKey, round]);

  const [learnIndex, setLearnIndex] = useState(0);

  // Camera practice: only signs the detector model can recognize
  const practicePhrases = useMemo(
    () => lessonPhrases.filter((p) => detectorLabelFor(p)),
    [lessonPhrases],
  );
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceResults, setPracticeResults] = useState([]); // true | 'skip' per sign
  const practiceCard = practicePhrases[practiceIndex];
  const isPractice = phase === 'practice';
  const practice = useSignPractice(isPractice && practiceCard ? detectorLabelFor(practiceCard) : null, isPractice);
  const { hasPermission, requestPermission } = practice;

  useEffect(() => {
    if (isPractice && !hasPermission) requestPermission();
  }, [isPractice, hasPermission, requestPermission]);

  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [results, setResults] = useState([]); // true/false per answered question

  const total = questions.length;
  const question = questions[index];
  const answered = selectedId !== null;
  const isCorrect = answered && selectedId === question?.answerId;
  const card = lessonPhrases[learnIndex];
  const score = results.filter(Boolean).length;
  const missed = questions
    .filter((_, i) => results[i] === false)
    .map((q) => ({ id: q.id, fsl: q.fsl, english: q.english }));

  // Content slides in from the direction of travel
  const dirRef = useRef(1);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    slide.setValue(dirRef.current * 26);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [phase, learnIndex, practiceIndex, index, round]);

  // Feedback sheet rises when an answer is picked
  const sheetSlide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase === 'quiz' && answered) {
      sheetSlide.setValue(70);
      Animated.spring(sheetSlide, { toValue: 0, tension: 90, friction: 11, useNativeDriver: true }).start();
    }
  }, [answered, phase]);

  // Keep the active sign chip in view
  const jumpRef = useRef(null);
  const chipX = useRef({});
  useEffect(() => {
    if (phase !== 'learn') return;
    const x = chipX.current[learnIndex] ?? 0;
    jumpRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [learnIndex, phase]);

  const handleSelect = useCallback((id) => {
    if (selectedId !== null) return;
    setSelectedId(id);
    setResults((r) => {
      const next = [...r];
      next[index] = id === question.answerId;
      return next;
    });
  }, [selectedId, question, index]);

  const resetQuiz = () => {
    setRound((r) => r + 1);
    setIndex(0);
    setSelectedId(null);
    setResults([]);
  };

  const startQuiz = () => {
    dirRef.current = 1;
    resetQuiz();
    setPhase('quiz');
  };

  const reviewSigns = () => {
    dirRef.current = 1;
    resetQuiz();
    setLearnIndex(0);
    setPhase('learn');
  };

  const startPractice = () => {
    dirRef.current = 1;
    setPracticeIndex(0);
    setPracticeResults([]);
    setPhase('practice');
  };

  const handleLearnNext = () => {
    dirRef.current = 1;
    if (learnIndex + 1 >= lessonPhrases.length) {
      return practicePhrases.length > 0 ? startPractice() : startQuiz();
    }
    setLearnIndex((i) => i + 1);
  };

  const handlePracticeNext = () => {
    dirRef.current = 1;
    setPracticeResults((r) => {
      const next = [...r];
      next[practiceIndex] = practice.matched ? true : 'skip';
      return next;
    });
    if (practiceIndex + 1 >= practicePhrases.length) return startQuiz();
    setPracticeIndex((i) => i + 1);
  };

  const handleLearnBack = () => {
    dirRef.current = -1;
    setLearnIndex((i) => Math.max(0, i - 1));
  };

  const jumpTo = (i) => {
    dirRef.current = i >= learnIndex ? 1 : -1;
    setLearnIndex(i);
  };

  const handleQuizContinue = () => {
    dirRef.current = 1;
    if (index + 1 >= total) return setPhase('result');
    setIndex((i) => i + 1);
    setSelectedId(null);
  };

  if (!group || lessonPhrases.length === 0) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.resultSub}>Lesson not found</Text>
        <TouchableOpacity style={[styles.secondaryBtn, { alignSelf: 'stretch' }]} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Back to lessons</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'result') {
    return (
      <ResultView
        score={score}
        total={total}
        missed={missed}
        onRetry={startQuiz}
        onReview={reviewSigns}
        onDone={() => navigation.goBack()}
      />
    );
  }

  const isLearn = phase === 'learn';
  const segCount = isLearn ? lessonPhrases.length : isPractice ? practicePhrases.length : total;
  const counter = isLearn
    ? `${learnIndex + 1}/${lessonPhrases.length}`
    : isPractice
    ? `${practiceIndex + 1}/${practicePhrases.length}`
    : `${index + 1}/${total}`;

  const segStyle = (i) => {
    if (isLearn) return i <= learnIndex ? styles.segLearn : null;
    if (isPractice) {
      if (practiceResults[i] === true) return styles.segCorrect;
      return i === practiceIndex ? styles.segCurrent : practiceResults[i] === 'skip' ? styles.segLearn : null;
    }
    if (results[i] === true) return styles.segCorrect;
    if (results[i] === false) return styles.segWrong;
    return i === index ? styles.segCurrent : null;
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      {/* Header band: close, lesson identity, step, segmented progress */}
      <View style={styles.lessonHeader}>
        <View style={styles.lessonHeaderBlob} />
        <View style={styles.lessonHeaderRow}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="close" size={18} color={COLOR.tealLight} />
          </TouchableOpacity>
          <View style={styles.groupTile}>
            <MaterialCommunityIcons name={group.icon} size={22} color={group.tint.icon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>{isLearn ? 'LEARN' : isPractice ? 'PRACTICE' : 'QUIZ'}</Text>
            <Text style={styles.lessonHeaderTitle} numberOfLines={1}>{group.title}</Text>
          </View>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>{counter}</Text>
          </View>
        </View>

        <View style={styles.segRow}>
          {Array.from({ length: segCount }).map((_, i) => (
            <View key={i} style={[styles.seg, segStyle(i)]} />
          ))}
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fade, transform: [{ translateX: slide }] }}>
          {isLearn ? (
            <>
              <Text style={styles.heading}>Learn this sign</Text>
              <SignStage
                phraseId={card.id}
                fsl={card.fsl}
                label={`Sign ${learnIndex + 1} of ${lessonPhrases.length}`}
                showHint={false}
              />

              <View style={styles.learnCard}>
                <View style={[styles.learnAccent, { backgroundColor: group.tint.icon }]} pointerEvents="none" />
                <Text style={styles.learnFsl}>{card.fsl}</Text>
                <View style={styles.learnTiles}>
                  <View style={[styles.learnTile, styles.learnTileTeal]}>
                    <View style={styles.learnTileHead}>
                      <MaterialCommunityIcons name="translate" size={13} color={COLOR.tealMid} />
                      <Text style={styles.learnTileLabel}>English</Text>
                    </View>
                    <Text style={styles.learnEnglish}>{card.english}</Text>
                  </View>
                  <View style={styles.learnTile}>
                    <View style={styles.learnTileHead}>
                      <MaterialCommunityIcons name="comment-text-outline" size={13} color={COLOR.inkFaint} />
                      <Text style={styles.learnTileLabel}>Tagalog</Text>
                    </View>
                    <Text style={styles.learnTagalog}>{card.tagalog}</Text>
                  </View>
                </View>
              </View>

              <ScrollView
                ref={jumpRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.jumpRow}
                contentContainerStyle={styles.jumpContent}
              >
                {lessonPhrases.map((p, i) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.jumpChip, i === learnIndex && styles.jumpChipActive]}
                    onPress={() => jumpTo(i)}
                    onLayout={(e) => { chipX.current[i] = e.nativeEvent.layout.x; }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.jumpChipText, i === learnIndex && styles.jumpChipTextActive]}>
                      {p.fsl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : isPractice ? (
            <>
              <Text style={styles.heading}>Now you sign it</Text>
              <View style={local.targetCard}>
                <Text style={local.targetEyebrow}>SHOW THIS SIGN</Text>
                <Text style={local.targetFsl}>{practiceCard.fsl}</Text>
                <Text style={local.targetEnglish}>{practiceCard.english}</Text>
              </View>
              <PracticeCamera practice={practice} active={isPractice} />
            </>
          ) : (
            <>
              <Text style={styles.heading}>Which word is this sign?</Text>
              <SignStage
                phraseId={question.id}
                fsl={question.fsl}
                label={`Question ${index + 1} of ${total}`}
                showHint
              />

              <View style={styles.optionsWrap}>
                {question.options.map((opt, i) => (
                  <Option
                    key={opt.id}
                    option={opt}
                    letter={LETTERS[i]}
                    selectedId={selectedId}
                    answerId={question.answerId}
                    onPress={handleSelect}
                  />
                ))}
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Footer */}
      {isPractice ? (
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          {practice.matched ? (
            <TouchableOpacity style={[styles.primaryBtn, styles.btnCorrect]} onPress={handlePracticeNext} activeOpacity={0.88}>
              <MaterialCommunityIcons name="check" size={20} color={COLOR.white} />
              <Text style={[styles.primaryBtnText, styles.btnTextLight]}>
                {practiceIndex + 1 >= practicePhrases.length ? 'Start quiz' : 'Next sign'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 0 }]} onPress={handlePracticeNext} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>
                {practiceIndex + 1 >= practicePhrases.length ? 'Skip to quiz' : 'Skip this sign'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : isLearn ? (
        <View style={[styles.footer, styles.footerRow, { paddingBottom: bottomPad }]}>
          {learnIndex > 0 && (
            <TouchableOpacity style={styles.backStepBtn} onPress={handleLearnBack} activeOpacity={0.85}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={COLOR.inkMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleLearnNext} activeOpacity={0.88}>
            <Text style={styles.primaryBtnText}>
              {learnIndex + 1 >= lessonPhrases.length
                ? practicePhrases.length > 0 ? 'Practice on camera' : 'Start quiz'
                : 'Next sign'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.sheet,
            answered && (isCorrect ? styles.sheetCorrect : styles.sheetWrong),
            { paddingBottom: bottomPad, transform: [{ translateY: sheetSlide }] },
          ]}
        >
          {answered ? (
            <>
              <View style={styles.sheetRow}>
                <View style={[styles.sheetIcon, isCorrect ? styles.sheetIconCorrect : styles.sheetIconWrong]}>
                  <MaterialCommunityIcons name={isCorrect ? 'check' : 'close'} size={22} color={COLOR.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, isCorrect ? styles.sheetTitleCorrect : styles.sheetTitleWrong]}>
                    {isCorrect ? 'Correct' : 'Not quite'}
                  </Text>
                  {!isCorrect && (
                    <Text style={styles.sheetAnswer}>
                      Answer: {question.fsl} ({question.english})
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, isCorrect ? styles.btnCorrect : styles.btnWrong]}
                onPress={handleQuizContinue}
                activeOpacity={0.88}
              >
                <Text style={[styles.primaryBtnText, styles.btnTextLight]}>
                  {index + 1 >= total ? 'See results' : 'Continue'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.hintText}>Tap the word that matches the sign</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}