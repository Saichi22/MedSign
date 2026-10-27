// LessonScreen.jsx
// Two steps: 1) LEARN each sign (sign + word + meaning), 2) QUIZ on those same signs.
// UI only: no points, streaks or saved progress.
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated, Easing, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { learnStyles as styles } from '../../../../styles/colors/LearnStyle';
import { PHRASES, LESSON_GROUPS, phrasesForGroup } from '../../../../data/phrasebookData';
import { SIGN_MEDIA } from '../../../../data/signMedia';

const SIGNS_PER_LESSON = 8;
const OPTIONS_PER_QUESTION = 4;
const LETTERS = ['A', 'B', 'C', 'D'];

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

      <View style={styles.footer}>
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
  const { groupKey } = useRoute().params;
  const group = LESSON_GROUPS.find((g) => g.key === groupKey);

  const lessonPhrases = useMemo(
    () => phrasesForGroup(groupKey).slice(0, SIGNS_PER_LESSON),
    [groupKey],
  );

  const [phase, setPhase] = useState('learn'); // 'learn' | 'quiz' | 'result'
  const [round, setRound] = useState(0);
  const questions = useMemo(() => buildQuestions(lessonPhrases, groupKey), [lessonPhrases, groupKey, round]);

  const [learnIndex, setLearnIndex] = useState(0);
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
  }, [phase, learnIndex, index, round]);

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

  const handleLearnNext = () => {
    dirRef.current = 1;
    if (learnIndex + 1 >= lessonPhrases.length) return startQuiz();
    setLearnIndex((i) => i + 1);
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
  const segCount = isLearn ? lessonPhrases.length : total;
  const counter = isLearn ? `${learnIndex + 1}/${lessonPhrases.length}` : `${index + 1}/${total}`;

  const segStyle = (i) => {
    if (isLearn) return i <= learnIndex ? styles.segLearn : null;
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
            <Text style={styles.headerEyebrow}>{isLearn ? 'LEARN' : 'QUIZ'}</Text>
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
      {isLearn ? (
        <View style={[styles.footer, styles.footerRow]}>
          {learnIndex > 0 && (
            <TouchableOpacity style={styles.backStepBtn} onPress={handleLearnBack} activeOpacity={0.85}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={COLOR.inkMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleLearnNext} activeOpacity={0.88}>
            <Text style={styles.primaryBtnText}>
              {learnIndex + 1 >= lessonPhrases.length ? 'Start quiz' : 'Next sign'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.sheet,
            answered && (isCorrect ? styles.sheetCorrect : styles.sheetWrong),
            { transform: [{ translateY: sheetSlide }] },
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