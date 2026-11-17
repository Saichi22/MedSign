// ModeTabs.jsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { COLOR, FONT, RADIUS } from '../../../../styles/colors/theme';

// Which screen "Sign to Speech" should open. A sign screen tells ModeTabs about itself
// (signRoute prop); without it we assume the image translator. This is what lets
// Speech to Sign -> Sign to Speech return to the Motion translator when you came from there.
let lastSignRoute = 'Translator';

export const MODE_TABS = [
  { key: 'sign', label: 'Sign to Speech', route: null }, // resolved at press time
  { key: 'speech', label: 'Speech to Sign', route: 'SpeechToSign' },
];

export default function ModeTabs({ active, signRoute }) {
  const navigation = useNavigation();

  if (active === 'sign') lastSignRoute = signRoute || 'Translator';

  return (
    <View style={s.wrap}>
      {MODE_TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, isActive && s.tabActive]}
            onPress={() => !isActive && navigation.replace(t.route || lastSignRoute)}
            activeOpacity={0.85}
          >
            <Text style={[s.text, isActive && s.textActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(10,155,170,0.14)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: RADIUS.pill,
  },
  tabActive: {
    backgroundColor: COLOR.white,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  text: { fontFamily: FONT.sans, fontSize: 13, fontWeight: '600', color: COLOR.inkFaint },
  textActive: { color: COLOR.inkPrimary, fontWeight: '700' },
});