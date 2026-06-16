import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
];

export const CONFIDENCE_THRESHOLD = 0.30;

const EXPECTED_INPUT_SIZE = 224 * 224 * 3;

export interface Prediction {
  label: string;
  confidence: number;
  isMedical: boolean;
}

// ── On-screen debug info (no devtools needed) ──────────────────────────────
export interface DebugInfo {
  inputSize: number;
  minPixel: number;
  maxPixel: number;
  sampleR: number;
  sampleG: number;
  sampleB: number;
  frameCount: number;
  outputClasses: number;
  top5: Array<{ label: string; pct: number }>;
  bestLabel: string;
  bestPct: number;
  belowThreshold: boolean;
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
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

  const frameCountRef = useRef(0);
  const modelRef = useRef(plugin.model);
  useEffect(() => { modelRef.current = plugin.model; }, [plugin.model]);

  const reset = useCallback(() => {
    setPrediction(null);
    setDebugInfo(null);
    frameCountRef.current = 0;
  }, []);

  const runInference = useCallback((resizedData: unknown) => {
    const model = modelRef.current;
    if (model == null) return;

    let inputArray: Float32Array;

    if (resizedData instanceof Float32Array) {
      inputArray = resizedData;
    } else if (Array.isArray(resizedData)) {
      inputArray = new Float32Array(resizedData as number[]);
    } else if (resizedData && typeof resizedData === 'object' && 'buffer' in resizedData) {
      const view = resizedData as ArrayBufferView;
      inputArray = new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4);
    } else {
      if (__DEV__) console.warn('[SignDetector] Unknown input type:', typeof resizedData);
      return;
    }

    if (inputArray.length === 0) return;

    if (inputArray.length !== EXPECTED_INPUT_SIZE) {
      if (__DEV__) {
        console.warn(
          `[SignDetector] Size mismatch: got ${inputArray.length}, expected ${EXPECTED_INPUT_SIZE}`
        );
      }
      return;
    }

    frameCountRef.current += 1;

    // ── Collect pixel stats for the on-screen debug panel ──────────────────
    let minPixel = Infinity;
    let maxPixel = -Infinity;
    for (let i = 0; i < Math.min(600, inputArray.length); i++) {
      const v = inputArray[i]!;
      if (v < minPixel) minPixel = v;
      if (v > maxPixel) maxPixel = v;
    }
    // Sample from the center of the image
    const centerIdx = Math.floor(inputArray.length / 2);
    const sampleR = parseFloat((inputArray[centerIdx] ?? 0).toFixed(3));
    const sampleG = parseFloat((inputArray[centerIdx + 1] ?? 0).toFixed(3));
    const sampleB = parseFloat((inputArray[centerIdx + 2] ?? 0).toFixed(3));

    try {
      const safeBuffer = inputArray.buffer.slice(
        inputArray.byteOffset,
        inputArray.byteOffset + inputArray.byteLength
      ) as ArrayBuffer;

      const outputs = model.runSync([safeBuffer]);
      const raw = outputs[0];
      if (raw == null) return;

      let scores: Float32Array;
      if (ArrayBuffer.isView(raw)) {
        scores = raw as unknown as Float32Array;
      } else if (raw instanceof ArrayBuffer) {
        scores = new Float32Array(raw);
      } else {
        return;
      }

      if (scores.length === 0) return;

      // ── Find best class ────────────────────────────────────────────────────
      let maxIdx = 0;
      let maxVal = scores[0]!;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i]! > maxVal) {
          maxVal = scores[i]!;
          maxIdx = i;
        }
      }

      // ── Build top-5 for debug panel ────────────────────────────────────────
      const indexed = Array.from(scores).map((s, i) => ({ s, i }));
      indexed.sort((a, b) => b.s - a.s);
      const top5 = indexed.slice(0, 5).map(({ s, i }) => ({
        label: LABELS[i] ?? `Cls${i}`,
        pct: Math.round(s * 100),
      }));

      setDebugInfo({
        inputSize: inputArray.length,
        minPixel: parseFloat(minPixel.toFixed(3)),
        maxPixel: parseFloat(maxPixel.toFixed(3)),
        sampleR,
        sampleG,
        sampleB,
        frameCount: frameCountRef.current,
        outputClasses: scores.length,
        top5,
        bestLabel: LABELS[maxIdx] ?? `Cls${maxIdx}`,
        bestPct: Math.round(maxVal * 100),
        belowThreshold: maxVal < CONFIDENCE_THRESHOLD,
      });

      if (maxVal < CONFIDENCE_THRESHOLD) return;

      const label = LABELS[maxIdx] ?? `Class ${maxIdx}`;
      setPrediction({
        label,
        confidence: Math.round(maxVal * 100),
        isMedical: MEDICAL_LABELS.has(label),
      });
    } catch (e) {
      if (__DEV__) console.error('[SignDetector] Inference error:', e);
    }
  }, []);

  return {
    state: plugin.state,
    isReady,
    prediction,
    debugInfo,   // ← NEW: expose to screen
    reset,
    runInference,
  };
}