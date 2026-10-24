import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { COLOR } from '../../../../styles/colors/theme';
import { styles } from '../../../../styles/colors/TranslatorScreenStyle';
import { useSpeechToText } from '../../../../hooks/useSpeechToText';

const local = StyleSheet.create({
  headerRightRow: { flexDirection: 'row', alignItems: 'center' },
  flexFill: { flex: 1 },
  transcript: { fontSize: 22, lineHeight: 30, color: COLOR.tealDeep, marginTop: 6 },
  transcriptPartial: { opacity: 0.55 },
  error: { color: COLOR.red, marginTop: 10 },
});

export default function SpeechToSignScreen() {
  const navigation = useNavigation();
  const { isListening, partialText, finalText, error, language, toggleLanguage, start, stop, reset } =
    useSpeechToText();

  const hasText = !!(partialText || finalText);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLOR.tealDeep} />

      <View style={styles.header}>
        <View style={styles.headerBlob} />
        <View style={styles.headerTop}>
          <View style={local.headerRightRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.liveBadge, { marginRight: 12 }]}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="arrow-left" size={16} color={COLOR.tealBright} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerEyebrow}>SPEECH TO SIGN</Text>
              <Text style={styles.headerTitle}>Voice Input</Text>
            </View>
          </View>

          <View style={local.headerRightRow}>
            <TouchableOpacity
              onPress={toggleLanguage}
              style={[styles.liveBadge, { marginRight: 8 }]}
              activeOpacity={0.8}
              disabled={isListening}
            >
              <Text style={[styles.liveText, { color: COLOR.tealBright }]}>
                {language === 'en-US' ? 'EN' : 'FIL'}
              </Text>
            </TouchableOpacity>
            <View style={[styles.liveBadge, isListening && styles.liveBadgeActive]}>
              <View style={[styles.liveDot, isListening && styles.liveDotActive]} />
              <Text style={[styles.liveText, isListening && styles.liveTextActive]}>
                {isListening ? 'LISTENING' : 'IDLE'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={local.flexFill}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.outputBox}>
            <View style={styles.outputIconWrap}>
              <MaterialCommunityIcons name="microphone" size={20} color={COLOR.tealDeep} />
            </View>
            {hasText ? (
              <Text style={[local.transcript, !finalText && local.transcriptPartial]}>
                {partialText || finalText}
              </Text>
            ) : (
              <Text style={styles.outputTextMuted}>
                {isListening
                  ? 'Listening… start speaking'
                  : `Tap Start Listening and speak in ${language === 'en-US' ? 'English' : 'Filipino'}`}
              </Text>
            )}
            {error && <Text style={local.error}>{error}</Text>}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isListening && styles.stopBtn]}
          onPress={isListening ? stop : start}
          activeOpacity={0.88}
        >
          <MaterialCommunityIcons
            name={isListening ? 'stop' : 'microphone'}
            size={22}
            color={isListening ? COLOR.red : COLOR.tealDeep}
          />
          <Text style={[styles.primaryBtnText, isListening && styles.stopBtnText]}>
            {isListening ? 'Stop Listening' : 'Start Listening'}
          </Text>
        </TouchableOpacity>

        {hasText && !isListening && (
          <TouchableOpacity onPress={reset} style={{ alignSelf: 'center', marginTop: 16 }} activeOpacity={0.7}>
            <Text style={styles.outputTextMuted}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}