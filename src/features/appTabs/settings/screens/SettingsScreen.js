import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { useAuth } from '../../../auth/services/AuthContext';

const SettingsRow = ({
  icon,
  label,
  sublabel,
  onPress,
  danger,
  rightElement,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={styles.settingsRow}
  >
    <View
      style={[
        styles.rowIcon,
        { backgroundColor: danger ? '#FEE2E2' : '#EEF2FF' },
      ]}
    >
      <Text style={{ fontSize: 18 }}>{icon}</Text>
    </View>
    <View style={{ flex: 1, marginLeft: 12 }}>
      <Text style={[styles.rowLabel, danger && { color: '#DC2626' }]}>
        {label}
      </Text>
      {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
    </View>
    {rightElement || <Text style={{ color: '#CBD5E1', fontSize: 18 }}>›</Text>}
  </TouchableOpacity>
);

const SectionHeader = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = React.useState(false);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to end your session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            console.error('Logout Error:', error);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSub}>MedSign · v1.0</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={{ fontSize: 28 }}>👤</Text>
          </View>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={styles.profileName}>
              {user?.displayName || 'Staff Member'}
            </Text>
            <Text style={styles.profileEmail}>{user?.email || 'No email'}</Text>
            <View style={styles.roleBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.roleText}>MD · Active Session</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.editBtn}>
            <Text style={{ fontSize: 16 }}>✏️</Text>
          </TouchableOpacity>
        </View>

        {/* Account */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <SettingsRow
            icon="👤"
            label="Edit Profile"
            sublabel="Name, photo, specialty"
          />
          <SettingsRow
            icon="📧"
            label="Email Address"
            sublabel={user?.email || '—'}
          />
          <SettingsRow
            icon="🔑"
            label="Change Password"
            sublabel="Last changed 30 days ago"
          />
        </View>

        {/* Security */}
        <SectionHeader title="Security" />
        <View style={styles.card}>
          <SettingsRow
            icon="🔔"
            label="Push Notifications"
            sublabel="Alerts and reminders"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
                thumbColor={notificationsEnabled ? '#1A56DB' : '#CBD5E1'}
              />
            }
          />
          <SettingsRow
            icon="🫆"
            label="Biometric Login"
            sublabel="Face ID / Fingerprint"
            rightElement={
              <Switch
                value={biometricsEnabled}
                onValueChange={setBiometricsEnabled}
                trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
                thumbColor={biometricsEnabled ? '#1A56DB' : '#CBD5E1'}
              />
            }
          />
          <SettingsRow
            icon="📱"
            label="Active Sessions"
            sublabel="Manage logged-in devices"
          />
        </View>

        {/* Hospital */}
        <SectionHeader title="Hospital" />
        <View style={styles.card}>
          <SettingsRow
            icon="🏥"
            label="Department"
            sublabel="General Medicine"
          />
          <SettingsRow
            icon="🪪"
            label="Staff ID"
            sublabel="View credentials & clearance"
          />
          <SettingsRow
            icon="📋"
            label="Shift Schedule"
            sublabel="View your roster"
          />
        </View>

        {/* Support */}
        <SectionHeader title="Support" />
        <View style={styles.card}>
          <SettingsRow icon="❓" label="Help & FAQ" />
          <SettingsRow
            icon="📞"
            label="Contact IT Support"
            sublabel="24/7 helpdesk"
          />
          <SettingsRow icon="📄" label="Privacy Policy" />
        </View>

        {/* Sign Out */}
        <SectionHeader title="Session" />
        <View style={styles.card}>
          <SettingsRow
            icon="🚪"
            label="Sign Out"
            sublabel="End your current session"
            danger
            onPress={handleSignOut}
          />
        </View>

        <Text style={styles.footerText}>
          MedSign v1.0 · All rights reserved
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#1A56DB',
    paddingTop: 56,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    color: '#93C5FD',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 4,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#C7D2FE',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  profileEmail: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    backgroundColor: '#F0FDF4',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    marginRight: 5,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  rowSublabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  footerText: {
    textAlign: 'center',
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 28,
    fontWeight: '500',
  },
});
