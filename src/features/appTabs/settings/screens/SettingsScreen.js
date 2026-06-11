// SettingsScreen.js
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Switch,
  Animated,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../../auth/services/AuthContext';

// Import local styling and shared global design tokens
import { COLOR } from '../../../../styles/colors/theme'; 
import { styles } from '../../../../styles/colors/SettingsScreenStyle';

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
  const resolvedIconColor = danger ? COLOR.danger : iconColor || COLOR.tealBright;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.settingsRow, isLast && styles.settingsRowLast]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBg, borderColor: iconBorder }]}>
        <MaterialCommunityIcons name={icon} size={18} color={resolvedIconColor} />
      </View>

      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && { color: COLOR.danger }]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>

      {rightElement || (
        <MaterialCommunityIcons name="chevron-right" size={18} color={COLOR.borderIdle} />
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
        Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(contentFade, { toValue: 1, duration: 400, useNativeDriver: true }),
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

  const switchTrack = { false: COLOR.borderIdle, true: 'rgba(10,155,170,0.35)' };
  const switchThumb = val => (val ? COLOR.tealBright : '#CBD5E1');

  return (
    <View style={styles.root}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
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
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons name="account-outline" size={28} color={COLOR.tealBright} />
            </View>
            <View style={styles.avatarOnline} />
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.displayName || 'Staff Member'}</Text>
            <Text style={styles.profileEmail}>{user?.email || 'No email'}</Text>
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons name="stethoscope" size={10} color={COLOR.tealBright} />
              <Text style={styles.roleText}>MD · Active Session</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.editBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={COLOR.inkMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Account ───────────────────────────────────────────────── */}
        <SectionHeader title="ACCOUNT" icon="account-circle-outline" />
        <View style={styles.card}>
          <SettingsRow icon="account-edit-outline" label="Edit Profile" sublabel="Name, photo, specialty" />
          <SettingsRow icon="email-outline" label="Email Address" sublabel={user?.email || '—'} />
          <SettingsRow icon="lock-reset" label="Change Password" sublabel="Last changed 30 days ago" isLast />
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
          <SettingsRow icon="translate" label="Translation Language" sublabel="English (US)" isLast />
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
          <SettingsRow icon="cellphone-lock" label="Active Sessions" sublabel="Manage logged-in devices" />
          <SettingsRow icon="two-factor-authentication" label="Two-Factor Auth" sublabel="Add extra security layer" isLast />
        </View>

        {/* ── Hospital ──────────────────────────────────────────────── */}
        <SectionHeader title="HOSPITAL" icon="hospital-building" />
        <View style={styles.card}>
          <SettingsRow icon="office-building-outline" label="Department" sublabel="General Medicine" />
          <SettingsRow icon="card-account-details-outline" label="Staff ID" sublabel="View credentials & clearance" />
          <SettingsRow icon="calendar-clock-outline" label="Shift Schedule" sublabel="View your roster" isLast />
        </View>

        {/* ── Support ───────────────────────────────────────────────── */}
        <SectionHeader title="SUPPORT" icon="lifebuoy" />
        <View style={styles.card}>
          <SettingsRow icon="help-circle-outline" label="Help & FAQ" sublabel="Browse common questions" />
          <SettingsRow icon="headset" label="Contact IT Support" sublabel="24/7 helpdesk" />
          <SettingsRow icon="file-document-outline" label="Privacy Policy" isLast />
        </View>

        {/* ── Session ───────────────────────────────────────────────── */}
        <SectionHeader title="SESSION" icon="power-plug-outline" />
        <View style={styles.card}>
          <SettingsRow icon="logout" label="Sign Out" sublabel="End your current session" danger onPress={handleSignOut} isLast />
        </View>

        <Text style={styles.footerText}>MedSign · All rights reserved</Text>
      </Animated.ScrollView>
    </View>
  );
}