import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Animated,
  Dimensions,
  PanResponder,
  Keyboard,
} from 'react-native';
import { sendPasswordResetEmail } from '@react-native-firebase/auth';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../auth/services/AuthContext';
import { signInStyles as styles } from '../../../styles/colors/AuthStyle';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_TOP = SCREEN_HEIGHT * 0.28;
const DISMISS_THRESHOLD = 80;

// Simple, standard email regex - good enough for client-side validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { auth } = useAuth();

  // Guards against setState after unmount (e.g. user dismisses sheet
  // while the network request is still in flight).
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ── Animation refs ────────────────────────────────────────────────────
  const sheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  // Guards against double-navigation if dismissSheet fires twice
  // (e.g. backdrop tap + drag release racing each other).
  const hasNavigatedAway = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sheetY, {
        toValue: SHEET_TOP,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();

    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      Animated.timing(keyboardOffset, {
        toValue: Platform.OS === 'ios' ? -80 : -115,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Pan responder ─────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 4,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) dragY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD) {
          dismissSheet();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            tension: 80,
            friction: 10,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const dismissSheet = () => {
    if (hasNavigatedAway.current) return;
    hasNavigatedAway.current = true;

    Animated.parallel([
      Animated.timing(sheetY, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => navigation.goBack());
  };

  // ── Auth handler ──────────────────────────────────────────────────────
  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      Alert.alert('Required', 'Please enter your email address.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      if (!isMounted.current) return;
      setSent(true);
    } catch (e) {
      if (!isMounted.current) return;

      // Firebase auth error codes -> friendly copy.
      // Note: deliberately vague on "user not found" to avoid leaking
      // which emails are registered (standard account-enumeration guard).
      let message = 'Something went wrong. Please try again.';
      switch (e.code) {
        case 'auth/invalid-email':
          message = 'That email address looks invalid.';
          break;
        case 'auth/user-not-found':
          // Treat as success from the user's perspective.
          setSent(true);
          setLoading(false);
          return;
        case 'auth/network-request-failed':
          message = 'Network error. Check your connection and try again.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many attempts. Please wait a bit and try again.';
          break;
        default:
          message = e.message || message;
      }
      Alert.alert('Reset Failed', message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const backToSignIn = () => {
    if (hasNavigatedAway.current) return;
    hasNavigatedAway.current = true;

    Animated.parallel([
      Animated.timing(sheetY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      navigation.goBack();
    });
  };

  const translateY = Animated.add(Animated.add(sheetY, dragY), keyboardOffset);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3D40" />

      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={dismissSheet} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.handleWrap} {...panResponder.panHandlers}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>
            {sent ? 'Check your email' : 'Forgot password?'}
          </Text>
          <Text style={styles.sheetSubtitle}>
            {sent
              ? `We've sent a reset link to ${email.trim()}`
              : "Enter your email and we'll send you a reset link"}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {sent ? (
              <>
                <View style={styles.successIconWrap ?? { alignItems: 'center', marginVertical: 24 }}>
                  <MaterialCommunityIcons
                    name="email-check-outline"
                    size={56}
                    color="#0A9BAA"
                  />
                </View>

                <TouchableOpacity
                  style={styles.signInBtn}
                  onPress={backToSignIn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.signInBtnText}>Back to Sign In</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setSent(false);
                  }}
                  style={{ marginTop: 16, alignItems: 'center' }}
                >
                  <Text style={styles.forgotText}>
                    Didn't get it? Try another email
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email Address</Text>
                  <View
                    style={[
                      styles.inputRow,
                      focused && styles.inputRowFocused,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="email"
                      size={20}
                      color={focused ? '#0A9BAA' : '#4A6E72'}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="name@email.com"
                      placeholderTextColor="#B0CCCF"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      returnKeyType="send"
                      onSubmitEditing={handleResetPassword}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      editable={!loading}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.signInBtn,
                    loading && styles.signInBtnDisabled,
                  ]}
                  onPress={handleResetPassword}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.signInBtnText}>Send Reset Link</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>Remembered it? </Text>
                  <TouchableOpacity onPress={backToSignIn} disabled={loading}>
                    <Text style={styles.footerLink}>Back to Sign In</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}