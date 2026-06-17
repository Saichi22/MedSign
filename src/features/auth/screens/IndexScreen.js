import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Animated,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { indexStyles as styles } from '../../../styles/colors/AuthStyle';

const { width } = Dimensions.get('window');

// ── Animated feature pill ─────────────────────────────────────────────────────
function FeaturePill({ icon, label, delay }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.pill,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={14} color="#7EDDE3" />
      <Text style={styles.pillText}>{label}</Text>
    </Animated.View>
  );
}

// ── Floating stat card ────────────────────────────────────────────────────────
function StatCard({ value, label, delay }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.statCard,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ── Main IndexScreen ──────────────────────────────────────────────────────────
export default function IndexScreen({ navigation }) {
  // Entrance animations
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(30)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(24)).current;
  const decorScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      // Decorative circle blooms first
      Animated.spring(decorScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      // Hero text fades up
      Animated.parallel([
        Animated.timing(heroFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(heroSlide, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      // CTA fades up last
      Animated.parallel([
        Animated.timing(ctaFade, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(ctaSlide, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3D40" />

      {/* ── Decorative background blobs ───────────────────────────────────── */}
      <Animated.View
        style={[styles.blobTopRight, { transform: [{ scale: decorScale }] }]}
      />
      <Animated.View
        style={[styles.blobBottomLeft, { transform: [{ scale: decorScale }] }]}
      />
      {/* Fine grid overlay (simulated with small dots) */}
      <View style={styles.gridOverlay} />

      {/* ── Brand row ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandIconWrap}>
            <Image
              source={require('../../../assets/images/logo.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandName}>
            Med<Text style={styles.brandAccent}>Sign</Text>
          </Text>
        </View>

      </View>

      {/* ── Hero copy ─────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.heroBlock,
          {
            opacity: heroFade,
            transform: [{ translateY: heroSlide }],
          },
        ]}
      >
      

        <Text style={styles.headline}>
          Your sign,{'\n'}
          <Text style={styles.headlineAccent}>spoken clearly.</Text>
        </Text>

        <Text style={styles.subheadline}>
          MedSign bridges the gap for Non-verbal community — with
          real-time ASL interpretation.
        </Text>
      </Animated.View>

    
      {/* ── CTA buttons ───────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.ctaBlock,
          {
            opacity: ctaFade,
            transform: [{ translateY: ctaSlide }],
          },
        ]}
      >
        {/* Primary CTA */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Sign In</Text>
          {/* <View style={styles.primaryBtnArrow}>
            <MaterialCommunityIcons
              name="arrow-right"
              size={16}
              color="#0D3D40"
            />
          </View> */}
        </TouchableOpacity>

        {/* Secondary CTA */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>Create account</Text>
        </TouchableOpacity>

        {/* Tiny disclaimer */}
        <Text style={styles.disclaimer}>
          By continuing you agree to our{' '}
          <Text style={styles.disclaimerLink}>Terms</Text> &{' '}
          <Text style={styles.disclaimerLink}>Privacy Policy</Text>
        </Text>
      </Animated.View>
    </View>
  );
}
