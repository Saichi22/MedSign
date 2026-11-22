// PrivacyPolicyScreen.js
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/SupportScreenStyle';
import SupportHeader from './SupportHeader';

// TODO: fill these in, and have the content reviewed (ideally by legal counsel
// or your data protection officer) before release. In the Philippines this
// should be checked against the Data Privacy Act of 2012 (RA 10173).
const ORG_NAME = 'MedSign';
const CONTACT_EMAIL = 'danielmapile22@gmail.com';
const LAST_UPDATED = 'November 23, 2026';

const SECTIONS = [
  {
    icon: 'information-outline',
    title: 'Overview',
    paragraphs: [
      `${ORG_NAME} is a sign language translation and learning app for medical settings. This policy explains what information the app handles, why, and the choices you have.`,
    ],
  },
  {
    icon: 'database-outline',
    title: 'Information we collect',
    bullets: [
      'Account details: your name, email address and sign-in method (email and password, Google or Facebook).',
      'Profile photo: if you add one, it is saved on your device.',
      'Camera input: used while a translator screen is open so signs can be recognized.',
      'Support messages: anything you choose to send us through Contact IT Support, including your account email and device type.',
    ],
  },
  {
    icon: 'camera-outline',
    title: 'Camera and sign recognition',
    paragraphs: [
      'The camera is used only while a translator is open, and only to recognize signs. You can turn camera access off at any time in your phone settings, but the translators will not work without it.',
    ],
  },
  {
    icon: 'cog-outline',
    title: 'How we use information',
    bullets: [
      'To sign you in and keep your account secure.',
      'To provide translation, lessons, quizzes and the dictionary.',
      'To respond to support requests and fix problems.',
      'To improve accuracy and reliability of the app.',
    ],
  },
  {
    icon: 'share-variant-outline',
    title: 'Sharing',
    paragraphs: [
      'We do not sell your personal information. We share it only with service providers that help run the app (for example, authentication), when the law requires it, or with your consent.',
    ],
  },
  {
    icon: 'shield-lock-outline',
    title: 'Patient information',
    paragraphs: [
      `${ORG_NAME} is not a patient record system. Please do not enter patient names or other patient-identifying details in the app or in support messages.`,
    ],
  },
  {
    icon: 'lock-outline',
    title: 'Security',
    paragraphs: [
      'We use reasonable technical and organizational measures to protect your information. No method of storage or transmission is completely secure, so we cannot guarantee absolute security.',
    ],
  },
  {
    icon: 'tune-variant',
    title: 'Your choices',
    bullets: [
      'Change or remove your profile photo from Settings.',
      'Sign out at any time from Settings.',
      'Turn off camera or notification permissions in your phone settings.',
      `Ask to access, correct or delete your data by emailing ${CONTACT_EMAIL}.`,
    ],
  },
  {
    icon: 'update',
    title: 'Changes to this policy',
    paragraphs: [
      'We may update this policy from time to time. When we do, we will change the date at the top of this page.',
    ],
  },
  {
    icon: 'email-outline',
    title: 'Contact us',
    paragraphs: [`Questions about privacy? Email us at ${CONTACT_EMAIL}.`],
  },
];

function PolicySection({ section, index }) {
  return (
    <View style={styles.policyCard}>
      <View style={styles.policyHeadRow}>
        <View style={[styles.rowIconWrap, { width: 34, height: 34 }]}>
          <MaterialCommunityIcons name={section.icon} size={17} color={COLOR.tealBright} />
        </View>
        <Text style={styles.policyTitle}>
          {index + 1}. {section.title}
        </Text>
      </View>

      {section.paragraphs?.map((p, i) => (
        <Text key={`p${i}`} style={styles.policyPara}>
          {p}
        </Text>
      ))}

      {section.bullets?.map((b, i) => (
        <View key={`b${i}`} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.root}>
      <SupportHeader
        eyebrow="LEGAL"
        title="Privacy Policy"
        subtitle="How MedSign handles your information."
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.updatedBadge}>
          <MaterialCommunityIcons name="calendar-check-outline" size={13} color={COLOR.tealBright} />
          <Text style={styles.updatedText}>Last updated {LAST_UPDATED}</Text>
        </View>

        {SECTIONS.map((s, i) => (
          <PolicySection key={s.title} section={s} index={i} />
        ))}
      </ScrollView>
    </View>
  );
}