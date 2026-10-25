// useSpeechToText.native.ts - live speech-to-text through our own tiny Android module
// (SpeechRecognizerModule.kt) that wraps Android's SpeechRecognizer (Google).
// Same return shape as the other hooks, so SpeechToSignScreen needs no changes.
// To use: rename this file to useSpeechToText.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import Speech from '@mhpdev/react-native-speech';

export type SttLanguage = 'en-US' | 'fil-PH';

const Native = NativeModules.SpeechRecognizerModule;

// Android SpeechRecognizer error codes that are not real failures
const BENIGN_CODES = new Set([5, 6, 7]); // client, speech timeout, no match

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<SttLanguage>('fil-PH');

  const languageRef = useRef<SttLanguage>(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (!Native) return;
    const emitter = new NativeEventEmitter(Native);
    const subs = [
      emitter.addListener('onSpeechStart', () => setIsListening(true)),
      emitter.addListener('onSpeechEnd', () => setIsListening(false)),
      emitter.addListener('onSpeechPartial', (e: { text: string }) => setPartialText(e.text ?? '')),
      emitter.addListener('onSpeechResult', (e: { text: string }) => {
        setFinalText(e.text ?? '');
        setPartialText('');
        setIsListening(false);
      }),
      emitter.addListener('onSpeechError', (e: { code: number }) => {
        setIsListening(false);
        if (BENIGN_CODES.has(e.code)) return;
        setError(
          e.code === 9
            ? 'Microphone permission denied'
            : e.code === 2 || e.code === 1 || e.code === 4
            ? 'Network problem. Check your internet or download the offline language pack.'
            : `Speech recognition error ${e.code}`,
        );
      }),
    ];
    return () => {
      subs.forEach(s => s.remove());
      Native.destroy?.().catch(() => {});
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPartialText('');
    setFinalText('');

    if (!Native) {
      setError('SpeechRecognizerModule is missing from this build. Uninstall the app and rebuild.');
      return;
    }
    if (!(await ensureMicPermission())) {
      setError('Microphone permission denied');
      return;
    }

    await Speech.stop().catch(() => {});

    try {
      await Native.start(languageRef.current);
    } catch (e: any) {
      setError(e?.message ?? 'Could not start recognition');
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await Native?.stop();
    } catch {}
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
    isTranscribing: false,
    partialText,
    finalText,
    error,
    language,
    toggleLanguage,
    start,
    stop,
    reset,
    modelReady: true,
  };
}