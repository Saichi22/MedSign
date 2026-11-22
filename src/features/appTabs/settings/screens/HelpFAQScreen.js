// HelpFAQScreen.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/SupportScreenStyle';
import SupportHeader from './SupportHeader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CATEGORIES = ['All', 'Translator', 'Learn', 'Account', 'Troubleshooting'];

// Edit these freely; they are plain data. Review the answers so they match
// how your app actually behaves.
const FAQS = [
  {
    id: 't1',
    category: 'Translator',
    q: 'How does the MedSign Translator work?',
    a: 'The translator uses your phone camera to recognize Filipino Sign Language (FSL) and shows the meaning as text in real time. Open the translator, point the camera at the signer, and keep their hands and upper body inside the frame.',
  },
  {
    id: 't2',
    category: 'Translator',
    q: 'What is the difference between the Translator and the Motion Translator?',
    a: 'The MedSign Translator is for real-time recognition during a conversation. The Motion Translator is built for full signs that involve movement, such as greetings, days of the week and family members.',
  },
  {
    id: 't3',
    category: 'Translator',
    q: 'How can I get more accurate results?',
    a: 'Use good, even lighting and a plain background. Keep the phone steady, make sure both hands are fully visible, and have only one signer in the frame. Sign at a natural pace and pause briefly between signs.',
  },
  {
    id: 't4',
    category: 'Translator',
    q: 'Can MedSign replace a certified interpreter?',
    a: 'No. MedSign is an assistive tool. For critical situations such as consent, diagnoses or emergencies, always confirm understanding with the patient and use a certified interpreter when one is available.',
  },
  {
    id: 'l1',
    category: 'Learn',
    q: 'How do lessons and quizzes work?',
    a: 'Learn FSL offers short lessons followed by sign quizzes. You can go at your own pace and come back to any lesson whenever you like.',
  },
  {
    id: 'l2',
    category: 'Learn',
    q: 'How do I look up a sign?',
    a: 'Open the FSL Dictionary from the Home screen and search for a word. Each result shows the sign with its meaning in English and Tagalog.',
  },
  {
    id: 'a1',
    category: 'Account',
    q: 'How do I change my profile photo?',
    a: 'Go to Settings and tap your picture or the pencil icon on your profile card, then choose a photo. The photo is saved on this device.',
  },
  {
    id: 'a2',
    category: 'Account',
    q: 'I signed in with Google or Facebook. How do I change my password?',
    a: 'Accounts created with Google or Facebook are managed by that provider, so password and email changes are made in your Google or Facebook account settings. Only email and password accounts see the Account section in Settings.',
  },
  {
    id: 'a3',
    category: 'Account',
    q: 'How do I sign out?',
    a: 'Open Settings, scroll to Session and tap Sign Out, then confirm. You will need to sign in again to use the app.',
  },
  {
    id: 'x1',
    category: 'Troubleshooting',
    q: 'The camera does not start.',
    a: 'MedSign needs camera permission. Open your phone Settings, find MedSign, and allow Camera access. Then close and reopen the app. Make sure no other app is using the camera.',
  },
  {
    id: 'x2',
    category: 'Troubleshooting',
    q: 'Translations are slow or keep missing signs.',
    a: 'Close other apps running in the background, improve the lighting, and move the phone a little farther back so both hands fit in the frame. Restarting the app often helps too.',
  },
  {
    id: 'x3',
    category: 'Troubleshooting',
    q: 'The app crashes or something looks wrong.',
    a: 'Update MedSign to the latest version and restart your phone. If the problem continues, send us a report from Contact IT Support and describe what you were doing when it happened.',
  },
];

function FaqItem({ item, open, onToggle, isLast }) {
  return (
    <View style={[styles.faqItem, isLast && styles.faqItemLast]}>
      <TouchableOpacity
        style={styles.faqHead}
        activeOpacity={0.7}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.faqQ}>{item.q}</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={open ? COLOR.tealBright : COLOR.inkFaint}
        />
      </TouchableOpacity>
      {open ? (
        <View style={styles.faqBody}>
          <Text style={styles.faqA}>{item.a}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function HelpFAQScreen() {
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [openId, setOpenId] = useState(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter(item => {
      const inCategory = category === 'All' || item.category === category;
      const inQuery = !q || item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
      return inCategory && inQuery;
    });
  }, [query, category]);

  const toggle = id => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId(prev => (prev === id ? null : id));
  };

  return (
    <View style={styles.root}>
      <SupportHeader
        eyebrow="SUPPORT"
        title="Help & FAQ"
        subtitle="Quick answers about translating, learning and your account."
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Search */}
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={20} color={COLOR.inkFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search questions"
            placeholderTextColor={COLOR.inkFaint}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <MaterialCommunityIcons name="close-circle" size={18} color={COLOR.inkFaint} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
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
        </ScrollView>

        {/* Questions */}
        {results.length > 0 ? (
          <View style={styles.card}>
            {results.map((item, i) => (
              <FaqItem
                key={item.id}
                item={item}
                open={openId === item.id}
                onToggle={() => toggle(item.id)}
                isLast={i === results.length - 1}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.emptyWrap]}>
            <MaterialCommunityIcons name="text-search" size={32} color={COLOR.inkFaint} />
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyText}>
              Try different words, or pick another category. You can also contact IT Support below.
            </Text>
          </View>
        )}

        {/* Still need help */}
        <View style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>Still need help?</Text>
          <Text style={styles.ctaSub}>
            Our IT helpdesk can help with technical problems, account issues and bug reports.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ContactSupport')}
          >
            <MaterialCommunityIcons name="headset" size={18} color={COLOR.tealDeep} />
            <Text style={styles.ctaBtnText}>Contact IT Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}