import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../../auth/services/AuthContext';

const { width: W } = Dimensions.get('window');

// ─── Design Tokens (mirrors AuthStyle) ───────────────────────────────────────
const COLOR = {
  tealDeep: '#0D3D40',
  tealMid: '#0A5C62',
  tealBright: '#0A9BAA',
  tealLight: '#7EDDE3',
  tealGlow: 'rgba(10,155,170,0.10)',
  inkPrimary: '#1A2E35',
  inkMuted: '#4A6E72',
  inkFaint: '#8AACAF',
  bgPage: '#F0F5F5',
  bgCard: '#FFFFFF',
  borderCard: '#E2EDED',
  borderIdle: '#D0E2E3',
  white: '#FFFFFF',
  danger: '#EF4444',
  dangerBg: 'rgba(239,68,68,0.08)',
  dangerBorder: 'rgba(239,68,68,0.18)',
};

const FONT = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
};

const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28, pill: 100 };

// ─── Settings Row ─────────────────────────────────────────────────────────────
function SettingsRow({
  icon,
  iconColor,
  label,
  sublabel,
  onPress,
  danger,
  rightElement,
  isLast,
}) {
  const iconBg = danger ? COLOR.dangerBg : COLOR.tealGlow;
  const iconBorder = danger ? COLOR.dangerBorder : 'rgba(10,155,170,0.15)';
  const resolvedIconColor = danger
    ? COLOR.danger
    : iconColor || COLOR.tealBright;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.settingsRow, isLast && styles.settingsRowLast]}
    >
      <View
        style={[
          styles.rowIconWrap,
          { backgroundColor: iconBg, borderColor: iconBorder },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={resolvedIconColor}
        />
      </View>

      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && { color: COLOR.danger }]}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>

      {rightElement || (
        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color={COLOR.borderIdle}
        />
      )}
    </TouchableOpacity>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, icon }) {
  return (
    <View style={styles.sectionHeaderRow}>
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={12}
          color={COLOR.inkFaint}
          style={{ marginRight: 5 }}
        />
      )}
      <Text style={styles.sectionHeader}>{title}</Text>
    </View>
  );
}

// ─── Main SettingsScreen ──────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = React.useState(false);
  const [aslSoundEnabled, setAslSoundEnabled] = React.useState(true);

  // Entrance animations
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(headerFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(headerSlide, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to end your session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (e) {
            console.error(e);
          }
        },
      },
    ]);
  };

  const switchTrack = {
    false: COLOR.borderIdle,
    true: 'rgba(10,155,170,0.35)',
  };
  const switchThumb = val => (val ? COLOR.tealBright : '#CBD5E1');

  return (
    <View style={styles.root}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.header,
          { opacity: headerFade, transform: [{ translateY: headerSlide }] },
        ]}
      >
        <View style={styles.headerBlob} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>MEDSIGN</Text>
            <Text style={styles.headerTitle}>Settings</Text>
          </View>
          <View style={styles.headerVersionBadge}>
            <View style={styles.headerVersionDot} />
            <Text style={styles.headerVersionText}>v1.0</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: contentFade }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Profile Card ──────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          {/* Avatar */}
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons
                name="account-outline"
                size={28}
                color={COLOR.tealBright}
              />
            </View>
            <View style={styles.avatarOnline} />
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.displayName || 'Staff Member'}
            </Text>
            <Text style={styles.profileEmail}>{user?.email || 'No email'}</Text>
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons
                name="stethoscope"
                size={10}
                color={COLOR.tealBright}
              />
              <Text style={styles.roleText}>MD · Active Session</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.editBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons
              name="pencil-outline"
              size={16}
              color={COLOR.inkMuted}
            />
          </TouchableOpacity>
        </View>

        {/* ── Account ───────────────────────────────────────────────── */}
        <SectionHeader title="ACCOUNT" icon="account-circle-outline" />
        <View style={styles.card}>
          <SettingsRow
            icon="account-edit-outline"
            label="Edit Profile"
            sublabel="Name, photo, specialty"
          />
          <SettingsRow
            icon="email-outline"
            label="Email Address"
            sublabel={user?.email || '—'}
          />
          <SettingsRow
            icon="lock-reset"
            label="Change Password"
            sublabel="Last changed 30 days ago"
            isLast
          />
        </View>

        {/* ── Preferences ───────────────────────────────────────────── */}
        <SectionHeader title="PREFERENCES" icon="tune-variant" />
        <View style={styles.card}>
          <SettingsRow
            icon="bell-outline"
            label="Push Notifications"
            sublabel="Alerts and appointment reminders"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={switchTrack}
                thumbColor={switchThumb(notificationsEnabled)}
              />
            }
          />
          <SettingsRow
            icon="volume-high"
            label="ASL Audio Output"
            sublabel="Read translations aloud"
            rightElement={
              <Switch
                value={aslSoundEnabled}
                onValueChange={setAslSoundEnabled}
                trackColor={switchTrack}
                thumbColor={switchThumb(aslSoundEnabled)}
              />
            }
          />
          <SettingsRow
            icon="translate"
            label="Translation Language"
            sublabel="English (US)"
            isLast
          />
        </View>

        {/* ── Security ──────────────────────────────────────────────── */}
        <SectionHeader title="SECURITY" icon="shield-outline" />
        <View style={styles.card}>
          <SettingsRow
            icon="fingerprint"
            label="Biometric Login"
            sublabel="Face ID / Fingerprint"
            rightElement={
              <Switch
                value={biometricsEnabled}
                onValueChange={setBiometricsEnabled}
                trackColor={switchTrack}
                thumbColor={switchThumb(biometricsEnabled)}
              />
            }
          />
          <SettingsRow
            icon="cellphone-lock"
            label="Active Sessions"
            sublabel="Manage logged-in devices"
          />
          <SettingsRow
            icon="two-factor-authentication"
            label="Two-Factor Auth"
            sublabel="Add extra security layer"
            isLast
          />
        </View>

        {/* ── Hospital ──────────────────────────────────────────────── */}
        <SectionHeader title="HOSPITAL" icon="hospital-building" />
        <View style={styles.card}>
          <SettingsRow
            icon="office-building-outline"
            label="Department"
            sublabel="General Medicine"
          />
          <SettingsRow
            icon="card-account-details-outline"
            label="Staff ID"
            sublabel="View credentials & clearance"
          />
          <SettingsRow
            icon="calendar-clock-outline"
            label="Shift Schedule"
            sublabel="View your roster"
            isLast
          />
        </View>

        {/* ── Support ───────────────────────────────────────────────── */}
        <SectionHeader title="SUPPORT" icon="lifebuoy" />
        <View style={styles.card}>
          <SettingsRow
            icon="help-circle-outline"
            label="Help & FAQ"
            sublabel="Browse common questions"
          />
          <SettingsRow
            icon="headset"
            label="Contact IT Support"
            sublabel="24/7 helpdesk"
          />
          <SettingsRow
            icon="file-document-outline"
            label="Privacy Policy"
            isLast
          />
        </View>

        {/* ── Session ───────────────────────────────────────────────── */}
        <SectionHeader title="SESSION" icon="power-plug-outline" />
        <View style={styles.card}>
          <SettingsRow
            icon="logout"
            label="Sign Out"
            sublabel="End your current session"
            danger
            onPress={handleSignOut}
            isLast
          />
        </View>

        <Text style={styles.footerText}>MedSign · All rights reserved</Text>
      </Animated.ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR.bgPage,
  },

  // ── Header
  header: {
    backgroundColor: COLOR.tealDeep,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute',
    top: -W * 0.18,
    right: -W * 0.12,
    width: W * 0.5,
    height: W * 0.5,
    borderRadius: W * 0.25,
    backgroundColor: 'rgba(10,155,170,0.13)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerEyebrow: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: FONT.serif,
    fontSize: 30,
    color: COLOR.white,
    letterSpacing: -0.5,
  },
  headerVersionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: RADIUS.pill,
    paddingVertical: 5,
    paddingHorizontal: 11,
    marginBottom: 4,
  },
  headerVersionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR.tealLight,
  },
  headerVersionText: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  // ── Scroll
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },

  // ── Profile Card
  profileCard: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarRing: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 2,
    borderColor: 'rgba(10,155,170,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOnline: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: COLOR.bgCard,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontFamily: FONT.serif,
    fontSize: 17,
    color: COLOR.inkPrimary,
    letterSpacing: -0.2,
  },
  profileEmail: {
    fontFamily: FONT.sans,
    fontSize: 12,
    color: COLOR.inkFaint,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  roleText: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.tealMid,
    letterSpacing: 0.3,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.bgPage,
    borderWidth: 1,
    borderColor: COLOR.borderIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Section Header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 9,
    marginLeft: 2,
  },
  sectionHeader: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── Card
  card: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    overflow: 'hidden',
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  // ── Settings Row
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.borderCard,
  },
  settingsRowLast: {
    borderBottomWidth: 0,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    marginLeft: 13,
    marginRight: 8,
  },
  rowLabel: {
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLOR.inkPrimary,
  },
  rowSublabel: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    marginTop: 2,
  },

  // ── Footer
  footerText: {
    textAlign: 'center',
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    marginTop: 28,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
