// EmergencyScreen.jsx
// Big, high-contrast urgent phrases. Tap one to show it full-screen to medical staff.
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Modal,
  Linking,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR, FONT, RADIUS, WINDOW_WIDTH as W } from '../../../../styles/colors/theme';

// Edit freely — these are the phrases shown on this screen.
const EMERGENCY_PHRASES = [
  { id: 'e01', fsl: 'TULUNGAN AKO',      english: 'Please help me',                  tagalog: 'Tulungan mo ako',          icon: 'lifebuoy' },
  { id: 'e02', fsl: 'HIRAP HUMINGA',     english: 'I cannot breathe well',           tagalog: 'Hirap akong huminga',      icon: 'lungs' },
  { id: 'e03', fsl: 'MASAKIT DIBDIB',    english: 'I have chest pain',               tagalog: 'Masakit ang dibdib ko',    icon: 'heart-pulse' },
  { id: 'e04', fsl: 'PAGDURUGO',         english: 'I am bleeding',                   tagalog: 'Dumudugo ako',             icon: 'water' },
  { id: 'e05', fsl: 'NAHIHILO',          english: 'I feel faint / dizzy',            tagalog: 'Nahihilo ako',             icon: 'blur' },
  { id: 'e06', fsl: 'NAPAKA-SAKIT',      english: 'I am in severe pain',             tagalog: 'Sobrang sakit',            icon: 'emoticon-sad-outline' },
  { id: 'e07', fsl: 'MAYROON ALLERGY',   english: 'I am having an allergic reaction',tagalog: 'May allergic reaction ako',icon: 'alert-circle-outline' },
  { id: 'e08', fsl: 'BINGI AKO',         english: 'I am Deaf — please write or gesture', tagalog: 'Bingi ako, isulat o ituro mo', icon: 'ear-hearing-off' },
];

export default function EmergencyScreen() {
  const navigation = useNavigation();
  const [shown, setShown] = useState(null);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <View style={s.header}>
        <View style={s.headerBlob} />
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLOR.tealLight} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>URGENT</Text>
            <Text style={s.title}>Emergency Phrases</Text>
          </View>
          <View style={s.headerTile}>
            <MaterialCommunityIcons name="alert-octagon" size={20} color={COLOR.tealLight} />
          </View>
        </View>
        <Text style={s.sub}>Tap a phrase to show it full-screen to medical staff</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={s.callBtn}
          onPress={() => Linking.openURL('tel:911')}
          activeOpacity={0.88}
        >
          <MaterialCommunityIcons name="phone" size={22} color={COLOR.tealDeep} />
          <Text style={s.callText}>Call 911</Text>
        </TouchableOpacity>

        {EMERGENCY_PHRASES.map((p) => (
          <TouchableOpacity key={p.id} style={s.card} onPress={() => setShown(p)} activeOpacity={0.88}>
            <View style={s.cardIcon}>
              <MaterialCommunityIcons name={p.icon} size={24} color={COLOR.tealBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardFsl}>{p.fsl}</Text>
              <Text style={s.cardEnglish}>{p.english}</Text>
              <Text style={s.cardTagalog}>{p.tagalog}</Text>
            </View>
            <MaterialCommunityIcons name="arrow-expand" size={20} color={COLOR.inkFaint} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Full-screen display for the doctor */}
      <Modal visible={!!shown} animationType="fade" onRequestClose={() => setShown(null)}>
<TouchableOpacity style={s.fullscreen} activeOpacity={1} onPress={() => setShown(null)}>
  <StatusBar barStyle="light-content" backgroundColor="#B91C1C" />
  <View style={s.fullBlob} pointerEvents="none" />
  <MaterialCommunityIcons name={shown?.icon || 'alert'} size={72} color={COLOR.white} />
          <Text style={s.fullFsl}>{shown?.fsl}</Text>
          <Text style={s.fullEnglish}>{shown?.english}</Text>
          <Text style={s.fullTagalog}>{shown?.tagalog}</Text>
          <Text style={s.fullHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bgPage },

  header: {
    backgroundColor: COLOR.tealDeep,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute',
    top: -W * 0.2,
    right: -W * 0.1,
    width: W * 0.5,
    height: W * 0.5,
    borderRadius: W * 0.25,
    backgroundColor: 'rgba(10,155,170,0.13)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { fontFamily: FONT.sans, fontSize: 10, fontWeight: '700', color: COLOR.tealLight, letterSpacing: 1.8, marginBottom: 2 },
  title: { fontFamily: FONT.serif, fontSize: 26, color: COLOR.white, letterSpacing: -0.4 },
  sub: { fontFamily: FONT.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', marginTop: 12 },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 12 },

  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealLight,
  },
  callText: { fontFamily: FONT.sans, fontSize: 16, fontWeight: '800', color: COLOR.tealDeep, letterSpacing: 0.4 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFsl: { fontFamily: FONT.serif, fontSize: 18, color: COLOR.inkPrimary },
  cardEnglish: { fontFamily: FONT.sans, fontSize: 13, fontWeight: '600', color: COLOR.tealMid, marginTop: 2 },
  cardTagalog: { fontFamily: FONT.sans, fontSize: 11.5, fontStyle: 'italic', color: COLOR.inkFaint, marginTop: 1 },

fullscreen: {
  flex: 1,
  backgroundColor: '#DC2626',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 28,
  overflow: 'hidden',
},
fullBlob: {
  position: 'absolute',
  top: -W * 0.25,
  right: -W * 0.2,
  width: W * 0.9,
  height: W * 0.9,
  borderRadius: W * 0.45,
  backgroundColor: 'rgba(255,255,255,0.12)',
},
  fullFsl: {
    fontFamily: FONT.serif,
    fontSize: 44,
    color: COLOR.white,
    textAlign: 'center',
    marginTop: 18,
    letterSpacing: -0.6,
  },
  fullEnglish: { fontFamily: FONT.sans, fontSize: 24, fontWeight: '700', color: COLOR.white, textAlign: 'center', marginTop: 14 },
fullTagalog: { fontFamily: FONT.sans, fontSize: 16, fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginTop: 8 },
fullHint: { position: 'absolute', bottom: 40, fontFamily: FONT.sans, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
});