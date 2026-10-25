// useSpeechToText.ts — whisper.rn, on-device, offline.
//
// Does NOT use RealtimeTranscriber / the Silero VAD (the VAD never reported speech on this
// setup). Instead: mic stream -> simple loudness-based speech detector -> Whisper per phrase.
//
// Files that must exist in android/app/src/main/assets/:
//   ggml-base-q5_1.bin   (multilingual Whisper model, NOT *.en; must match WHISPER_MODEL_ASSET)
import { useState, useRef, useEffect, useCallback } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { initWhisper } from 'whisper.rn';
import { AudioPcmStreamAdapter } from 'whisper.rn/src/realtime-transcription/adapters/AudioPcmStreamAdapter';
import Speech from '@mhpdev/react-native-speech';

export type SttLanguage = 'en-US' | 'fil-PH';

const WHISPER_MODEL_ASSET = 'ggml-base-q5_1.bin';
const WHISPER_LANG: Record<SttLanguage, string> = { 'en-US': 'en', 'fil-PH': 'tl' };

// ── Speech detector tuning (16 kHz, 16-bit mono => 32 bytes per ms) ─────────────
const BYTES_PER_MS = 32;
// Hysteresis: starting a phrase needs a clearly louder chunk; continuing one only needs
// a chunk a bit above the noise floor, so quiet syllables and pauses don't cut you off.
const START_MIN_RMS = 500;      // a phrase starts when rms exceeds max(this, floor * START_MULT)
const START_MULT = 2.0;
const CONTINUE_MIN_RMS = 380;   // while speaking, rms above max(this, floor * CONTINUE_MULT) counts as speech
const CONTINUE_MULT = 1.4;
const SILENCE_END_MS = 1000;    // this much quiet after speech ends a phrase
const MIN_UTTERANCE_MS = 600;   // ignore blips shorter than this
const MAX_UTTERANCE_MS = 15000; // force-cut very long phrases
const MAX_QUEUE = 3;            // phrases waiting for Whisper; oldest dropped beyond this
const DEBUG_SAVE_WAV = true;    // save each phrase as a .wav so you can listen to what Whisper receives
const BENCHMARK = true;         // log how long Whisper takes on 2s of silence at load

type WhisperCtx = Awaited<ReturnType<typeof initWhisper>>;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

async function copyAssetOnce(assetName: string): Promise<string> {
  const dest = `${RNFS.CachesDirectoryPath}/${assetName}`;
  if (!(await RNFS.exists(dest))) {
    await RNFS.copyFileAssets(assetName, dest);
  }
  return `file://${dest}`;
}

// Whisper emits things like "[BLANK_AUDIO]" or "(music)" on silence/noise
function cleanText(t: string): string {
  const s = (t ?? '').trim();
  if (/^[\[(].*[\])]$/.test(s)) return '';
  return s;
}

function toU8(raw: any): Uint8Array {
  if (raw instanceof Uint8Array) return raw.slice(); // copy: native may reuse the buffer
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw.slice(0));
  return new Uint8Array(0);
}

function rmsOf(u8: Uint8Array): number {
  const len = u8.byteLength - (u8.byteLength % 2);
  if (len < 2) return 0;
  const view = new DataView(u8.buffer, u8.byteOffset, len);
  let sum = 0;
  const n = len / 2;
  for (let i = 0; i < len; i += 2) {
    const s = view.getInt16(i, true);
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// Whisper does much better on quiet recordings if they're boosted first.
// Scales 16-bit PCM in place so the loudest sample reaches ~24000 (max gain 8x).
function normalizeGain(u8: Uint8Array): void {
  const len = u8.byteLength - (u8.byteLength % 2);
  if (len < 2) return;
  const view = new DataView(u8.buffer, u8.byteOffset, len);
  let peak = 0;
  for (let i = 0; i < len; i += 2) {
    const s = Math.abs(view.getInt16(i, true));
    if (s > peak) peak = s;
  }
  if (peak < 200) return; // effectively silence; don't amplify noise
  const gain = Math.min(8, 24000 / peak);
  if (gain <= 1.05) return;
  for (let i = 0; i < len; i += 2) {
    const v = Math.max(-32768, Math.min(32767, Math.round(view.getInt16(i, true) * gain)));
    view.setInt16(i, v, true);
  }
  console.log('[STT] boosted phrase: peak', peak, 'gain x', gain.toFixed(1));
}

// ── Debug: write the phrase Whisper receives to a .wav file ─────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(u8: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i];
    const b = i + 1 < u8.length ? u8[i + 1] : 0;
    const c = i + 2 < u8.length ? u8[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    parts.push(
      B64[(n >> 18) & 63] +
        B64[(n >> 12) & 63] +
        (i + 1 < u8.length ? B64[(n >> 6) & 63] : '=') +
        (i + 2 < u8.length ? B64[n & 63] : '='),
    );
  }
  return parts.join('');
}

async function saveWav(pcm: Uint8Array): Promise<void> {
  try {
    const header = new Uint8Array(44);
    const v = new DataView(header.buffer);
    const str = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
    };
    str(0, 'RIFF');
    v.setUint32(4, 36 + pcm.byteLength, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);      // PCM
    v.setUint16(22, 1, true);      // mono
    v.setUint32(24, 16000, true);  // sample rate
    v.setUint32(28, 32000, true);  // byte rate
    v.setUint16(32, 2, true);      // block align
    v.setUint16(34, 16, true);     // bits per sample
    str(36, 'data');
    v.setUint32(40, pcm.byteLength, true);
    const wav = concat([header, pcm]);
    const path = `${RNFS.ExternalDirectoryPath}/last_phrase.wav`;
    await RNFS.writeFile(path, toBase64(wav), 'base64');
    console.log('[STT] saved phrase to', path);
  } catch (e) {
    console.log('[STT] could not save wav:', e);
  }
}

export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<SttLanguage>('fil-PH');
  const [modelReady, setModelReady] = useState(false);

  const languageRef = useRef<SttLanguage>(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const whisperRef = useRef<WhisperCtx | null>(null);
  const streamRef = useRef<any>(null);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const unmountedRef = useRef(false);

  // Speech detector state
  const det = useRef({
    speaking: false,
    chunks: [] as Uint8Array[],
    preRoll: null as Uint8Array | null,
    silenceMs: 0,
    totalMs: 0,
    noiseFloor: 0,
  });

  // Whisper work queue (one transcription at a time)
  const queueRef = useRef<Uint8Array[]>([]);
  const workingRef = useRef(false);
  const currentReqRef = useRef<any>(null);
  const textsRef = useRef<string[]>([]);

  // ── Load model once ──────────────────────────────────────────────────────────
  useEffect(() => {
    unmountedRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const modelPath = await copyAssetOnce(WHISPER_MODEL_ASSET);
        const whisper = await initWhisper({ filePath: modelPath });
        if (cancelled) {
          whisper.release?.();
          return;
        }
        whisperRef.current = whisper;

        if (BENCHMARK) {
          try {
            const t0 = Date.now();
            const req: any = (whisper as any).transcribeData(new ArrayBuffer(16000 * 2 * 2), {
              language: 'en',
            });
            await req.promise;
            console.log('[STT] benchmark: Whisper on 2s silence took', Date.now() - t0, 'ms');
          } catch (e) {
            console.log('[STT] benchmark failed:', e);
          }
        }

        if (!cancelled) setModelReady(true);
      } catch (e: any) {
        console.warn('[STT] model load error:', e);
        if (!cancelled) setError(`Could not load speech model: ${e?.message ?? e}`);
      }
    })();

    return () => {
      cancelled = true;
      unmountedRef.current = true;
      activeRef.current = false;
      queueRef.current = [];

      const s = streamRef.current;
      const w = whisperRef.current;
      streamRef.current = null;
      whisperRef.current = null;
      try { currentReqRef.current?.stop?.(); } catch {}

      (async () => {
        try { await s?.stop(); } catch {}
        try { await s?.release?.(); } catch {}
        // let any in-flight inference finish before freeing the native context
        for (let i = 0; i < 20 && workingRef.current; i++) await sleep(150);
        await sleep(300);
        try { await w?.release?.(); } catch {}
      })();
    };
  }, []);

  // ── Whisper queue ────────────────────────────────────────────────────────────
  const pump = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setIsTranscribing(true);
    try {
      while (queueRef.current.length > 0) {
        const pcm = queueRef.current.shift()!;
        const whisper = whisperRef.current;
        if (!whisper) break;
        try {
          const t0 = Date.now();
          const buf = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
          const req: any = (whisper as any).transcribeData(buf, {
            language: WHISPER_LANG[languageRef.current],
          });
          currentReqRef.current = req;
          const res = await req.promise;
          currentReqRef.current = null;
          console.log('[STT] raw whisper result:', (JSON.stringify(res) ?? 'undefined').slice(0, 500));
          const text = cleanText(res?.result ?? '');
          console.log('[STT] transcribed in', Date.now() - t0, 'ms:', JSON.stringify(text));
          if (text && !unmountedRef.current) {
            textsRef.current.push(text);
            setPartialText(textsRef.current.join(' '));
          }
        } catch (e: any) {
          currentReqRef.current = null;
          console.warn('[STT] transcribe error:', e);
          if (!unmountedRef.current) setError(`Transcription failed: ${e?.message ?? e}`);
        }
      }
    } finally {
      workingRef.current = false;
      if (!unmountedRef.current) setIsTranscribing(false);
    }
  }, []);

  const enqueue = useCallback(
    (pcm: Uint8Array) => {
      if (queueRef.current.length >= MAX_QUEUE) {
        console.log('[STT] queue full, dropping oldest phrase');
        queueRef.current.shift();
      }
      queueRef.current.push(pcm);
      pump();
    },
    [pump],
  );

  // ── Speech detector ──────────────────────────────────────────────────────────
  const finishUtterance = useCallback(() => {
    const d = det.current;
    const chunks = d.chunks;
    const ms = d.totalMs - d.silenceMs; // approx. voiced duration
    d.speaking = false;
    d.chunks = [];
    d.silenceMs = 0;
    d.totalMs = 0;
    if (chunks.length === 0) return;
    if (ms < MIN_UTTERANCE_MS) {
      console.log('[STT] phrase too short, ignored (', Math.round(ms), 'ms )');
      return;
    }
    const pcm = concat(chunks);
    normalizeGain(pcm);
    if (DEBUG_SAVE_WAV) saveWav(pcm.slice());
    console.log('[STT] phrase captured:', Math.round(pcm.byteLength / BYTES_PER_MS), 'ms -> Whisper');
    enqueue(pcm);
  }, [enqueue]);

  const onChunk = useCallback(
    (raw: any) => {
      if (!activeRef.current) return;
      const data = toU8(raw);
      if (data.byteLength < 2) return;

      const d = det.current;
      const chunkMs = data.byteLength / BYTES_PER_MS;
      const rms = rmsOf(data);

      // Noise floor: only learns from quiet chunks, so speech can't drag it upward.
      // Drops fast, rises slowly, and ignores anything well above the current floor.
      if (d.noiseFloor === 0) d.noiseFloor = Math.min(rms, 450);
      else if (rms < d.noiseFloor) d.noiseFloor = 0.5 * d.noiseFloor + 0.5 * rms;
      else if (!d.speaking && rms < d.noiseFloor * 1.6) d.noiseFloor = 0.95 * d.noiseFloor + 0.05 * rms;

      const threshold = d.speaking
        ? Math.max(CONTINUE_MIN_RMS, d.noiseFloor * CONTINUE_MULT)
        : Math.max(START_MIN_RMS, d.noiseFloor * START_MULT);
      const isSpeech = rms > threshold;
      console.log(
        `[STT] rms=${Math.round(rms)} floor=${Math.round(d.noiseFloor)} thr=${Math.round(threshold)}`,
        isSpeech ? 'SPEECH' : '-',
      );

      if (isSpeech) {
        if (!d.speaking) {
          d.speaking = true;
          if (d.preRoll) {
            d.chunks.push(d.preRoll); // keep a little lead-in so first word isn't clipped
            d.totalMs += d.preRoll.byteLength / BYTES_PER_MS;
          }
        }
        d.chunks.push(data);
        d.totalMs += chunkMs;
        d.silenceMs = 0;
        if (d.totalMs >= MAX_UTTERANCE_MS) finishUtterance();
      } else if (d.speaking) {
        d.chunks.push(data); // keep trailing quiet so words aren't cut off
        d.totalMs += chunkMs;
        d.silenceMs += chunkMs;
        if (d.silenceMs >= SILENCE_END_MS) finishUtterance();
      }
      d.preRoll = data;
    },
    [finishUtterance],
  );

  // ── Public API ───────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (startingRef.current || stoppingRef.current || activeRef.current) return;
    startingRef.current = true;

    let stepName = 'begin';
    const step = (s: string) => {
      stepName = s;
      console.log('[STT] step:', s);
    };

    try {
      setError(null);
      setPartialText('');
      setFinalText('');
      textsRef.current = [];
      queueRef.current = [];
      det.current = { speaking: false, chunks: [], preRoll: null, silenceMs: 0, totalMs: 0, noiseFloor: 0 };

      step('check model');
      if (!whisperRef.current) {
        setError('Speech model is still loading, try again in a moment');
        return;
      }

      step('mic permission');
      if (!(await ensureMicPermission())) {
        setError('Microphone permission denied');
        return;
      }

      step('speech stop');
      await Speech.stop().catch(() => {});

      step('create adapter');
      const stream: any = new AudioPcmStreamAdapter();
      stream.onData((e: any) => onChunk(e?.data ?? e));
      stream.onError((e: any) => {
        console.warn('[STT] audio error:', e);
        setError(typeof e === 'string' ? e : e?.message ?? 'Audio error');
      });
      stream.onStatusChange?.(() => {});

      step('stream.initialize');
      await stream.initialize({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6,
        bufferSize: 16 * 1024,
      });

      step('stream.start');
      await stream.start();
      streamRef.current = stream;
      activeRef.current = true;
      setIsListening(true);
      step('running');
    } catch (e: any) {
      console.warn('[STT] FAILED at step:', stepName, '|', e?.message, '|', e?.stack);
      setError(`${stepName}: ${e?.message ?? 'failed'}`);
      setIsListening(false);
      activeRef.current = false;
    } finally {
      startingRef.current = false;
    }
  }, [onChunk]);

  const stop = useCallback(async () => {
    if (!activeRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    activeRef.current = false;
    setIsListening(false); // instant UI feedback

    const stream = streamRef.current;
    streamRef.current = null;
    try { await stream?.stop(); } catch {}

    // If you were mid-phrase when you tapped Stop, send what we have
    if (det.current.speaking) finishUtterance();

    // Wait for Whisper to finish queued phrases (bounded, so it can't hang forever)
    const deadline = Date.now() + 60000;
    while ((workingRef.current || queueRef.current.length > 0) && Date.now() < deadline) {
      await sleep(200);
    }

    try { await stream?.release?.(); } catch {}

    if (!unmountedRef.current) {
      const text = textsRef.current.join(' ').trim();
      if (text) {
        setFinalText(text);
        setPartialText('');
      }
    }
    stoppingRef.current = false;
  }, [finishUtterance]);

  const reset = useCallback(() => {
    textsRef.current = [];
    setPartialText('');
    setFinalText('');
    setError(null);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => (prev === 'en-US' ? 'fil-PH' : 'en-US'));
  }, []);

  return {
    isListening,
    isTranscribing,
    partialText,
    finalText,
    error,
    language,
    toggleLanguage,
    start,
    stop,
    reset,
    modelReady,
  };
}