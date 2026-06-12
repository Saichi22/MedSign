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

import { useCallback, useRef, useState } from 'react';
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
  /**
   * Do NOT pass a second argument to useTensorflowModel.
   *
   * Passing [] (empty array) is not a valid delegate value — the hook
   * resolves state:'loaded' but leaves plugin.model undefined, causing
   * "undefined is not a function" when runSync is called.
   *
   * Omitting the argument uses the CPU delegate by default, which works
   * on every Android/iOS device without extra setup.
   */
  const plugin = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/sign_model.tflite'),
  );

  /**
   * Double-guard: check BOTH plugin.state AND plugin.model.
   *
   * state:'loaded' is necessary but not sufficient — on some devices/versions
   * the state transitions before the JSI binding is fully registered.
   * Checking plugin.model directly ensures runSync actually exists before
   * we expose isReady as true.
   */
  const isReady = plugin.state === 'loaded' && plugin.model != null;
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const lastRunRef = useRef<number>(0);

  const runInference = useCallback(
    (resizedBuffer: Float32Array) => {
      // Re-check both guards inside the callback — state can change between
      // the time runInference was exposed and when it is actually called.
      if (plugin.state !== 'loaded' || plugin.model == null) return;

      const now = Date.now();
      if (now - lastRunRef.current < DEBOUNCE_MS) return;
      lastRunRef.current = now;

      try {
        /**
         * slice() before .buffer — covers two problems:
         *
         * a) byteOffset: vision-camera-resize-plugin may return a view into a
         *    shared pool. .buffer starts at 0, not your frame. slice() copies
         *    exactly your bytes into a fresh ArrayBuffer starting at 0.
         *
         * b) Race condition: slice() gives runSync its own copy so the camera
         *    thread cannot mutate the buffer while TFLite is reading it.
         */
        const safeBuffer = resizedBuffer.slice().buffer;
        const outputs = plugin.model.runSync([safeBuffer]);

        const raw = outputs[0];
        if (raw == null || raw.length === 0) return;

        // Index the typed array directly — no Array.from() allocation needed
        const scores = raw as Float32Array | Int32Array | Uint8Array;

        let maxIdx = 0;
        let maxVal = scores[0]!;
        for (let i = 1; i < scores.length; i++) {
          if (scores[i]! > maxVal) {
            maxVal = scores[i]!;
            maxIdx = i;
          }
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
        console.warn('[useSignDetector] inference error:', e);
      }
    },
    // isReady captures both state AND model presence — safe dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isReady],
  );

  return {
    state: plugin.state,
    isReady,
    prediction,
    runInference: isReady ? runInference : null,
  };
}