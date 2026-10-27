// LearnScreen.jsx
import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { learnStyles as styles } from '../../../../styles/colors/LearnStyle';
import { PHRASES, LESSON_GROUPS, phrasesForGroup } from '../../../../data/phrasebookData';

const PREVIEW_COUNT = 3;
const NODE_CENTER = 36; // marginTop (14) + half node (22)

// ─── Hero: textured card that starts the first lesson ────────────────────────
function Hero({ onStart, firstTitle }) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroGlowTop} pointerEvents="none" />
      <View style={styles.heroGlow} pointerEvents="none" />
      <View style={styles.heroGrid} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.heroGridH, { top: i * 38 }]} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.heroGridV, { left: i * 44 }]} />
        ))}
      </View>
      <MaterialCommunityIcons
        name="hand-wave-outline"
        size={150}
        color="rgba(126,221,227,0.10)"
        style={styles.heroWatermark}
      />
      <View style={styles.heroScrim} pointerEvents="none" />

      <Text style={styles.heroTitle}>Learn the signs you'll use at the clinic</Text>
      <Text style={styles.heroSub}>
        See each sign, learn what it means, then quiz yourself.
      </Text>

      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <MaterialCommunityIcons name="layers-outline" size={14} color={COLOR.tealLight} />
          <Text style={styles.heroStatText}>{LESSON_GROUPS.length} lessons</Text>
        </View>
        <View style={styles.heroStat}>
          <MaterialCommunityIcons name="hand-wave-outline" size={14} color={COLOR.tealLight} />
          <Text style={styles.heroStatText}>{PHRASES.length} signs</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.heroCta} onPress={onStart} activeOpacity={0.88}>
        <MaterialCommunityIcons name="play" size={18} color={COLOR.tealDeep} />
        <Text style={styles.heroCtaText}>Start with {firstTitle}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── One stop on the lesson path ─────────────────────────────────────────────
function PathRow({ group, isFirst, isLast, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, tension: 120, friction: 8 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start();

  const phrases = phrasesForGroup(group.key);
  const preview = phrases.slice(0, PREVIEW_COUNT);
  const more = phrases.length - preview.length;

  const lineStyle = isFirst
    ? { top: NODE_CENTER, bottom: 0 }
    : isLast
    ? { top: 0, height: NODE_CENTER }
    : { top: 0, bottom: 0 };

  return (
    <View style={styles.pathRow}>
      <View style={styles.rail}>
        <View style={[styles.railLine, lineStyle]} />
        <View style={[styles.node, { backgroundColor: group.tint.bg, borderColor: group.tint.icon }]}>
          <MaterialCommunityIcons name={group.icon} size={20} color={group.tint.icon} />
        </View>
      </View>

      <Animated.View style={[styles.pathCardWrap, isLast && { paddingBottom: 0 }, { transform: [{ scale }] }]}>
        <TouchableOpacity
          style={styles.lessonCard}
          onPress={onPress}
          onPressIn={pressIn}
          onPressOut={pressOut}
          activeOpacity={1}
        >
          <View style={[styles.accentStrip, { backgroundColor: group.tint.icon }]} pointerEvents="none" />
          <MaterialCommunityIcons
            name={group.icon}
            size={110}
            color={group.tint.icon}
            style={styles.cardWatermark}
          />

          <View style={styles.lessonTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lessonTitle}>{group.title}</Text>
              <Text style={styles.lessonSub}>{group.subtitle}</Text>
              <View style={styles.countPill}>
                <MaterialCommunityIcons name="hand-wave-outline" size={13} color={group.tint.icon} />
                <Text style={[styles.countText, { color: group.tint.icon }]}>{phrases.length} signs</Text>
              </View>
            </View>
            <View style={[styles.startBtn, { backgroundColor: group.tint.bg }]}>
              <MaterialCommunityIcons name="play" size={20} color={group.tint.icon} />
            </View>
          </View>

          <View style={styles.chipsRow}>
            {preview.map((p) => (
              <View key={p.id} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{p.fsl}</Text>
              </View>
            ))}
            {more > 0 && (
              <View style={styles.chipMore}>
                <Text style={styles.chipMoreText}>+{more} more</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function LearnScreen() {
  const navigation = useNavigation();
  const openLesson = (key) => navigation.navigate('Lesson', { groupKey: key });

  // One orchestrated entrance: hero, then each lesson in turn.
  const anims = useRef(Array.from({ length: LESSON_GROUPS.length + 1 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      70,
      anims.map((v) => Animated.timing(v, { toValue: 1, duration: 380, useNativeDriver: true })),
    ).start();
  }, []);

  const enter = (v) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <View style={styles.header}>
        <View style={styles.headerBlob} />
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLOR.tealLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerEyebrow}>FILIPINO SIGN LANGUAGE</Text>
            <Text style={styles.headerTitle}>Learn FSL</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.learnContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={enter(anims[0])}>
          <Hero firstTitle={LESSON_GROUPS[0].title} onStart={() => openLesson(LESSON_GROUPS[0].key)} />
        </Animated.View>

        <Text style={styles.listHeading}>Lessons</Text>

        <View>
          {LESSON_GROUPS.map((group, i) => (
            <Animated.View key={group.key} style={enter(anims[i + 1])}>
              <PathRow
                group={group}
                isFirst={i === 0}
                isLast={i === LESSON_GROUPS.length - 1}
                onPress={() => openLesson(group.key)}
              />
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}