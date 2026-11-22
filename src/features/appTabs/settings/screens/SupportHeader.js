// SupportHeader.js
// Shared header with a back button, used by the Help, Contact and Privacy screens.
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/SupportScreenStyle';

export default function SupportHeader({ eyebrow = 'SUPPORT', title, subtitle, children }) {
  const navigation = useNavigation();

  return (
    <View style={styles.header}>
      <View style={styles.headerBlob} />
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLOR.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>{eyebrow}</Text>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      </View>
      {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}