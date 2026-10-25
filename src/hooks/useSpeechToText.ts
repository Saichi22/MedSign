import { NativeModules } from 'react-native';
console.log('Voice native module:', NativeModules.Voice);

import { useState, useRef, useEffect, useCallback } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@react-native-voice/voice';
import Speech from '@mhpdev/react-native-speech';

export type SttLanguage = 'en-US' | 'fil-PH';

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS prompts on first start()
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<SttLanguage>('fil-PH');

  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  useEffect(() => {
    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);

    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      setPartialText(e.value?.[0] ?? '');
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] ?? '';
      setFinalText(text);
      setPartialText('');
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setIsListening(false);
      // code "7" (no match) and "5" are common/harmless on Android
      setError(e.error?.message ?? 'Speech recognition failed');
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => {});
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPartialText('');
    setFinalText('');

    if (!(await ensureMicPermission())) {
      setError('Microphone permission denied');
      return;
    }

    // Don't let the TTS from the sign-to-speech side talk into the mic
    await Speech.stop().catch(() => {});

    try {
      await Voice.start(languageRef.current);
    } catch (e: any) {
      setError(e?.message ?? 'Could not start recognition');
    }
  }, []);

  const stop = useCallback(async () => {
    try { await Voice.stop(); } catch {}
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setPartialText('');
    setFinalText('');
    setError(null);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => (prev === 'en-US' ? 'fil-PH' : 'en-US'));
  }, []);

  return {
    isListening,
    partialText,
    finalText,
    error,
    language,
    toggleLanguage,
    start,
    stop,
    reset,
  };
}