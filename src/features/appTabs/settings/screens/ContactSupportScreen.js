// ContactSupportScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuth } from '../../../auth/services/AuthContext';
import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/SupportScreenStyle';
import SupportHeader from './SupportHeader';

// TODO: replace with your real helpdesk details.
const SUPPORT = {
  email: 'danielmapile22@gmail.com',
  phone: '+63 924 411 3375',
  hours: '24/7 helpdesk',
};

const CATEGORIES = ['Bug', 'Translation accuracy', 'Account', 'Other'];
const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

async function openLink(url, failMessage) {
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert('Unable to open', failMessage);
  }
}

function ContactRow({ icon, title, sub, onPress, isLast }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.contactRow, isLast && styles.contactRowLast]}
      accessibilityRole="button"
    >
      <View style={styles.rowIconWrap}>
        <MaterialCommunityIcons name={icon} size={20} color={COLOR.tealBright} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={COLOR.borderIdle} />
    </TouchableOpacity>
  );
}

export default function ContactSupportScreen() {
  const { user } = useAuth();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState('');

  const canSend = message.trim().length >= MIN_LENGTH;

  const handleSend = () => {
    if (!canSend) return;

    const subject = `[MedSign] ${category} report`;
    const body = [
      message.trim(),
      '',
      '---',
      `Account: ${user?.email || 'unknown'}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
    ].join('\n');

    const url = `mailto:${SUPPORT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    openLink(url, `No email app was found. You can write to us at ${SUPPORT.email}.`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SupportHeader
        eyebrow="SUPPORT"
        title="Contact IT Support"
        subtitle="We can help with technical problems, account issues and bug reports."
      >
        <View style={styles.availBadge}>
          <View style={styles.availDot} />
          <Text style={styles.availText}>{SUPPORT.hours.toUpperCase()}</Text>
        </View>
      </SupportHeader>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Direct contact */}
        <Text style={[styles.sectionLabel, { marginTop: 4 }]}>Reach us directly</Text>
        <View style={styles.card}>
          <ContactRow
            icon="email-outline"
            title="Email"
            sub={SUPPORT.email}
            onPress={() =>
              openLink(`mailto:${SUPPORT.email}`, `No email app was found. You can write to us at ${SUPPORT.email}.`)
            }
          />
          <ContactRow
            icon="phone-outline"
            title="Call helpdesk"
            sub={SUPPORT.phone}
            isLast
            onPress={() =>
              openLink(`tel:${SUPPORT.phone.replace(/\s/g, '')}`, `Unable to start a call. Our number is ${SUPPORT.phone}.`)
            }
          />
        </View>

        {/* Report form */}
        <Text style={styles.sectionLabel}>Send a report</Text>
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>WHAT IS THIS ABOUT?</Text>
          <View style={styles.chipWrap}>
            {CATEGORIES.map(c => {
              const active = c === category;
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.8}
                  onPress={() => setCategory(c)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.formLabel}>DESCRIBE THE PROBLEM</Text>
          <TextInput
            style={styles.input}
            multiline
            value={message}
            onChangeText={t => setMessage(t.slice(0, MAX_LENGTH))}
            placeholder="What happened? What were you doing when it happened?"
            placeholderTextColor={COLOR.inkFaint}
          />
          <Text style={styles.helperText}>
            {message.length}/{MAX_LENGTH} · Please do not include patient names or other patient-identifying details.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, !canSend && styles.primaryBtnDisabled]}
            activeOpacity={0.85}
            disabled={!canSend}
            onPress={handleSend}
          >
            <MaterialCommunityIcons name="send" size={16} color={COLOR.white} />
            <Text style={styles.primaryBtnText}>Send Report</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>
            This opens your email app with the report filled in. Your account email and device type are included to
            help us investigate.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}