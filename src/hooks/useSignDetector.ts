/**
 * useSignDetector.ts
 *
 * Loads sign_model.tflite via react-native-fast-tflite.
 * Exposes `isReady`, `prediction`, and `runInference`.
 *
 * File placement:
 *   <project-root>/assets/sign_model.tflite
 *   metro.config.js → resolver.assetExts: [...defaultAssetExts, 'tflite']
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
];

export const CONFIDENCE_THRESHOLD = 0.75;
const DEBOUNCE_MS = 600;

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/sign_model.tflite'),
    [],
  );

  const isReady = plugin.state === 'loaded' && plugin.model != null;
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    console.log(`[SignDetector] model state → ${plugin.state}`);
    if (plugin.state === 'loaded') {
      console.log('[SignDetector] ✅ model ready, runSync available:', plugin.model != null);
    }
    if (plugin.state === 'error') {
      console.error('[SignDetector] ❌ model failed to load');
    }
  }, [plugin.state, plugin.model]);

  const modelRef = useRef(plugin.model);
  useEffect(() => {
    modelRef.current = plugin.model;
  }, [plugin.model]);

  const runInference = useCallback((resizedBuffer: Float32Array) => {
    const model = modelRef.current;

    if (model == null) {
      console.warn('[SignDetector] runInference called but model is null — skipping');
      return;
    }

    const now = Date.now();
    if (now - lastRunRef.current < DEBOUNCE_MS) return;
    lastRunRef.current = now;

    if (resizedBuffer == null || !(resizedBuffer instanceof Float32Array)) {
      console.warn('[SignDetector] received invalid buffer — skipping, got:', typeof resizedBuffer);
      return;
    }

    console.log(`[SignDetector] running inference on buffer length=${resizedBuffer.length}`);

    try {
      /**
       * FIX 1 — Buffer copy that respects byteOffset.
       *
       * vision-camera-resize-plugin returns a Float32Array *view* into a
       * shared pool buffer. The view's `.buffer` property refers to the
       * entire pool (starts at byte 0), while the actual frame data starts
       * at `.byteOffset`. Calling `.slice().buffer` on the old code copied
       * the view correctly into a new Float32Array, but then grabbed
       * `.buffer` which is the pool — not the slice — causing TFLite to
       * read from the wrong offset.
       *
       * Float32Array.from() copies only the elements in the view's range
       * into a brand-new, offset-0 typed array, and `.buffer` on THAT is
       * exactly 224*224*3*4 bytes starting at 0. This is what runSync
       * expects.
       */
      const safeArray = Float32Array.from(resizedBuffer);
      const safeBuffer = safeArray.buffer;

      const inferenceStart = Date.now();
      const outputs = model.runSync([safeBuffer]);
      const inferenceMs = Date.now() - inferenceStart;

      const raw = outputs[0];
      if (raw == null) {
        console.warn('[SignDetector] model returned empty output');
        return;
      }

      /**
       * FIX 2 — Do NOT re-wrap the output.
       *
       * react-native-fast-tflite's runSync() already returns a Float32Array
       * for each output tensor — it does NOT return a raw ArrayBuffer.
       * The old code did `new Float32Array(raw as unknown as ArrayBuffer)`,
       * which treated the Float32Array object *reference* as an ArrayBuffer.
       * That produced a 1–4 element array of garbage values (memory address
       * bytes interpreted as floats), which never crossed the 0.75 threshold.
       *
       * Cast directly to Float32Array; if the runtime type is wrong the
       * length check below will catch it.
       */
      const scores = raw as unknown as Float32Array;

      if (!scores || scores.length === 0) {
        console.warn('[SignDetector] scores array is empty');
        return;
      }

      let maxIdx = 0;
      let maxVal = scores[0]!;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i]! > maxVal) {
          maxVal = scores[i]!;
          maxIdx = i;
        }
      }

      const indexed = Array.from(scores).map((s, i) => ({ s, i }));
      indexed.sort((a, b) => b.s - a.s);
      const top3 = indexed.slice(0, 3)
        .map(({ s, i }) => `${LABELS[i] ?? i}=${(s * 100).toFixed(1)}%`)
        .join(' | ');
      console.log(`[SignDetector] ${inferenceMs}ms | top3: ${top3} | threshold=${CONFIDENCE_THRESHOLD * 100}%`);

      if (maxVal < CONFIDENCE_THRESHOLD) {
        console.log('[SignDetector] below threshold — no prediction emitted');
        setPrediction(null);
        return;
      }

      const label = LABELS[maxIdx] ?? `Class ${maxIdx}`;
      console.log(`[SignDetector] ✅ prediction accepted: ${label} (${Math.round(maxVal * 100)}%)`);
      setPrediction({
        label,
        confidence: Math.round(maxVal * 100),
        isMedical: MEDICAL_LABELS.has(label),
      });
    } catch (e) {
      console.error('[SignDetector] ❌ inference threw an error:', e);
    }
  }, []);

  return {
    state: plugin.state,
    isReady,
    prediction,
    runInference,
  };
}