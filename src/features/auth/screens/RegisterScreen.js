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
import { createUserWithEmailAndPassword } from '@react-native-firebase/auth';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../auth/services/AuthContext';
import { signInStyles as styles } from '../../../styles/colors/AuthStyle';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_TOP = SCREEN_HEIGHT * 0.3;
const DISMISS_THRESHOLD = 80;

export default function SignUpScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const { auth } = useAuth();

  // ── Animation refs ──────────────────────────────────────────────────────────
  const sheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation
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

    // Keyboard handling
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, e => {
      Animated.timing(keyboardOffset, {
        toValue: Platform.OS === 'ios' ? -120 : -205,
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

  // ── Logic ───────────────────────────────────────────────────────────────────
  const passwordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 6)
      return { label: 'TOO SHORT', color: '#EF4444', width: '25%' };
    if (password.length < 8)
      return { label: 'WEAK', color: '#F59E0B', width: '50%' };
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password))
      return { label: 'FAIR', color: '#0A9BAA', width: '75%' };
    return { label: 'STRONG', color: '#22C55E', width: '100%' };
  };

  const strength = passwordStrength();

  const signUp = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Required', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const dismissSheet = () => {
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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 4,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) dragY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD) dismissSheet();
        else
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  // ── Navigation with exit animation ─────────────────────────────────────────
  const navigateToLogin = () => {
    // 1. Slide the Register sheet down
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
      // 2. Swap back to Login
      navigation.replace('Login');
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
          <Text style={styles.sheetTitle}>Join MedSign</Text>
          <Text style={styles.sheetSubtitle}>
            Create your secure healthcare account
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email Address</Text>
              <View
                style={[
                  styles.inputRow,
                  focusedField === 'email' && styles.inputRowFocused,
                ]}
              >
                <MaterialCommunityIcons
                  name="email"
                  size={20}
                  color={focusedField === 'email' ? '#0A9BAA' : '#4A6E72'}
                />
                <TextInput
                  style={styles.input}
                  placeholder="name@hospital.com"
                  placeholderTextColor="#B0CCCF"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Create Password</Text>
              <View
                style={[
                  styles.inputRow,
                  focusedField === 'pass' && styles.inputRowFocused,
                ]}
              >
                <MaterialCommunityIcons
                  name="lock"
                  size={20}
                  color={focusedField === 'pass' ? '#0A9BAA' : '#4A6E72'}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Min. 6 characters"
                  placeholderTextColor="#B0CCCF"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('pass')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye' : 'eye-off'}
                    size={20}
                    color="#8AACAF"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Strength Bar */}
            {strength && (
              <View style={{ marginBottom: 16 }}>
                <View
                  style={{
                    height: 4,
                    backgroundColor: '#E2EDED',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: strength.width,
                      height: '100%',
                      backgroundColor: strength.color,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: strength.color,
                    marginTop: 4,
                    letterSpacing: 0.5,
                  }}
                >
                  {strength.label}
                </Text>
              </View>
            )}

            {/* Confirm Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm Password</Text>
              <View
                style={[
                  styles.inputRow,
                  focusedField === 'conf' && styles.inputRowFocused,
                ]}
              >
                <MaterialCommunityIcons
                  name="lock-check"
                  size={20}
                  color={focusedField === 'conf' ? '#0A9BAA' : '#4A6E72'}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Re-type password"
                  placeholderTextColor="#B0CCCF"
                  secureTextEntry={!showConfirm}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('conf')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                  <MaterialCommunityIcons
                    name={showConfirm ? 'eye' : 'eye-off'}
                    size={20}
                    color="#8AACAF"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.signInBtn, loading && styles.signInBtnDisabled]}
              onPress={signUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.signInBtnText}>Create Account</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={navigateToLogin}>
                <Text style={styles.footerLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}
