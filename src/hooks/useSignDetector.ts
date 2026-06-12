/**
 * useSignDetector.ts
 *
 * Loads sign_model.tflite via react-native-fast-tflite.
 * Exposes `isReady`, `prediction`, and `runInference`.
 *
 * File placement:
 *   <project-root>/assets/sign_model.tflite
 *   metro.config.js → resolver.assetExts: [...defaultAssetExts, 'tflite']
 *
 * Hermes compatibility notes
 * ──────────────────────────
 * Typed arrays that cross the JSI bridge from native C++ into Hermes JS do
 * NOT preserve their prototype chain. This means:
 *
 *   resizedBuffer instanceof Float32Array  →  false  (input from resize plugin)
 *   outputs[0] instanceof Float32Array     →  false  (output from runSync)
 *
 * Both guards must use Hermes-safe alternatives (see FIX A and FIX B below).
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

/**
 * Hermes-safe typed-array check.
 *
 * `instanceof Float32Array` breaks for native JSI objects under Hermes
 * because the prototype chain is stripped at the bridge boundary.
 * `ArrayBuffer.isView()` tests whether the value IS a typed array view
 * (any subclass of TypedArray or DataView) at the C++ level, which works
 * correctly regardless of prototype chain — it's a structural check, not
 * an identity check.
 *
 * We additionally confirm `.BYTES_PER_ELEMENT === 4` to rule out Uint8Array
 * / Int32Array etc., and `.length > 0` to reject empty views.
 */
function isValidFloat32ArrayLike(v: unknown): v is ArrayBufferView & { length: number } {
  return (
    ArrayBuffer.isView(v) &&
    (v as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT === 4 &&
    (v as { length?: number }).length! > 0
  );
}

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

  const runInference = useCallback((resizedBuffer: unknown) => {
    const model = modelRef.current;

    if (model == null) {
      console.warn('[SignDetector] runInference called but model is null — skipping');
      return;
    }

    const now = Date.now();
    if (now - lastRunRef.current < DEBOUNCE_MS) return;
    lastRunRef.current = now;

    /**
     * FIX A — Hermes-safe input buffer check.
     *
     * The old code used `instanceof Float32Array`, which returns false for
     * native JSI objects under Hermes. `isValidFloat32ArrayLike` uses
     * `ArrayBuffer.isView()` instead, which works at the C++ level across
     * the JSI boundary and correctly accepts the resize plugin's output.
     */
let inputArray: Float32Array;

if (ArrayBuffer.isView(resizedBuffer)) {
  // ✅ NO COPY — just reinterpret the view
  inputArray = new Float32Array(
  (resizedBuffer as ArrayBufferView).buffer,
  (resizedBuffer as ArrayBufferView).byteOffset,
  (resizedBuffer as ArrayBufferView).byteLength / 4
);
} else if (resizedBuffer && typeof resizedBuffer === 'object') {
  // ⚠️ still need conversion here (object case is unavoidable)
  inputArray = Float32Array.from(
    Object.values(resizedBuffer as Record<string, number>)
  );
} else {
  console.warn(
    '[SignDetector] invalid input buffer:',
    typeof resizedBuffer
  );
  return;
}

    console.log(`[SignDetector] running inference on buffer length=${resizedBuffer.length}`);

    try {
      /**
       * Safe buffer copy that respects byteOffset.
       *
       * vision-camera-resize-plugin returns a view into a shared pool.
       * Float32Array.from() copies only the view's logical elements into a
       * fresh offset-0 array — `.buffer` on that is exactly 224×224×3×4
       * bytes starting at 0, which is what runSync expects.
       *
       * We cast to Float32Array here because isValidFloat32ArrayLike already
       * confirmed it has BYTES_PER_ELEMENT===4 and a length > 0.
       */
const safeBuffer = inputArray.buffer.slice(
  inputArray.byteOffset,
  inputArray.byteOffset + inputArray.byteLength
);

      const inferenceStart = Date.now();
      const outputs = model.runSync([safeBuffer as ArrayBuffer]);
      const inferenceMs = Date.now() - inferenceStart;

      const raw = outputs[0];
      if (raw == null) {
        console.warn('[SignDetector] model returned empty output');
        return;
      }

      /**
       * FIX B — Hermes-safe output handling.
       *
       * Under Hermes, runSync() output tensors are native JSI objects that
       * also fail `instanceof Float32Array`. We use the same structural
       * check: if it passes isValidFloat32ArrayLike it is a 4-byte typed
       * array view we can read directly. If it does NOT (e.g. some versions
       * return a raw ArrayBuffer), we wrap it. This covers both cases.
       */
      let scores: Float32Array;
      if (isValidFloat32ArrayLike(raw)) {
        // Already a typed array view (Hermes JSI tensor output, most common)
        scores = Float32Array.from(raw as Float32Array);
      } else if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
        // Raw ArrayBuffer fallback (older fast-tflite versions)
        scores = new Float32Array(raw as ArrayBuffer);
      } else {
        console.warn('[SignDetector] unrecognised output type:', typeof raw);
        return;
      }

      if (scores.length === 0) {
        console.warn('[SignDetector] scores array is empty after unwrap');
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
      console.log(
        `[SignDetector] ${inferenceMs}ms | scores.length=${scores.length} | top3: ${top3} | threshold=${CONFIDENCE_THRESHOLD * 100}%`,
      );

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