import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
];

export const CONFIDENCE_THRESHOLD = 0.75;
// FIX 4: Match debounce to worklet interval so resize isn't called wastefully
const DEBOUNCE_MS = 1500;

export interface Prediction {
  label: string;
  confidence: number;
  isMedical: boolean;
}

const MEDICAL_LABELS = new Set([
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
]);

export function useSignDetector() {
  const plugin = useTensorflowModel(
    require('../assets/sign_model.tflite'),
    [],
  );

  const isReady = plugin.state === 'loaded' && plugin.model != null;
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (__DEV__) {
      console.log(`[SignDetector] model state → ${plugin.state}`);
      if (plugin.state === 'loaded') console.log('[SignDetector] ✅ model ready');
      if (plugin.state === 'error') console.error('[SignDetector] ❌ model failed to load');
    }
  }, [plugin.state, plugin.model]);

  const modelRef = useRef(plugin.model);
  useEffect(() => { modelRef.current = plugin.model; }, [plugin.model]);

  const runInference = useCallback((resizedBuffer: unknown) => {
    const model = modelRef.current;
    if (model == null) return;

    const now = Date.now();
    if (now - lastRunRef.current < DEBOUNCE_MS) return;
    lastRunRef.current = now;

    let inputArray: Float32Array;

    if (ArrayBuffer.isView(resizedBuffer)) {
      // FIX 1: Zero-copy reinterpret — no Float32Array.from()
      inputArray = new Float32Array(
        (resizedBuffer as ArrayBufferView).buffer,
        (resizedBuffer as ArrayBufferView).byteOffset,
        (resizedBuffer as ArrayBufferView).byteLength / 4,
      );
    } else if (resizedBuffer && typeof resizedBuffer === 'object') {
      // FIX 2: Single-pass typed copy instead of Object.values + Float32Array.from
      const vals = Object.values(resizedBuffer as Record<string, number>);
      inputArray = new Float32Array(vals.length);
      for (let i = 0; i < vals.length; i++) inputArray[i] = vals[i]!;
    } else {
      if (__DEV__) console.warn('[SignDetector] invalid input buffer:', typeof resizedBuffer);
      return;
    }

    try {
      // FIX 3: Skip the .slice() copy when byteOffset is already 0
      const safeBuffer = inputArray.byteOffset === 0
        ? inputArray.buffer
        : inputArray.buffer.slice(
            inputArray.byteOffset,
            inputArray.byteOffset + inputArray.byteLength,
          );

      const outputs = model.runSync([safeBuffer as ArrayBuffer]);
      const raw = outputs[0];
      if (raw == null) return;

      // FIX 5: No Float32Array.from() — read JSI view directly
      let scores: Float32Array;
      if (ArrayBuffer.isView(raw)) {
        scores = raw as Float32Array; // zero-copy
      } else if (raw instanceof ArrayBuffer) {
        scores = new Float32Array(raw);
      } else {
        if (__DEV__) console.warn('[SignDetector] unrecognised output type:', typeof raw);
        return;
      }

      if (scores.length === 0) return;

      let maxIdx = 0;
      let maxVal = scores[0]!;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i]! > maxVal) { maxVal = scores[i]!; maxIdx = i; }
      }

      // FIX 6: Dev-only logging — no Array.from in production
      if (__DEV__) {
        const indexed = Array.from(scores).map((s, i) => ({ s, i }));
        indexed.sort((a, b) => b.s - a.s);
        const top3 = indexed.slice(0, 3)
          .map(({ s, i }) => `${LABELS[i] ?? i}=${(s * 100).toFixed(1)}%`)
          .join(' | ');
        console.log(`[SignDetector] scores.length=${scores.length} | top3: ${top3}`);
      }

      if (maxVal < CONFIDENCE_THRESHOLD) {
        setPrediction(null);
        return;
      }

      const label = LABELS[maxIdx] ?? `Class ${maxIdx}`;
      setPrediction({
        label,
        confidence: Math.round(maxVal * 100),
        isMedical: MEDICAL_LABELS.has(label),
      });
    } catch (e) {
      if (__DEV__) console.error('[SignDetector] ❌ inference error:', e);
    }
  }, []);

  return { state: plugin.state, isReady, prediction, runInference };
}