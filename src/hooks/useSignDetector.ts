import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
];

// Temporarily lowered threshold to catch and show lower-confidence alternative predictions
export const CONFIDENCE_THRESHOLD = 0.15;

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

  useEffect(() => {
    if (__DEV__) {
      console.log(`[SignDetector] model state → ${plugin.state}`);
    }
  }, [plugin.state]);

  const modelRef = useRef(plugin.model);
  useEffect(() => { modelRef.current = plugin.model; }, [plugin.model]);

  const reset = useCallback(() => setPrediction(null), []);

  const runInference = useCallback((resizedData: unknown) => {
    const model = modelRef.current;
    if (model == null) return;

    let inputArray: Float32Array;

    if (resizedData instanceof Float32Array) {
      inputArray = resizedData;
    } else if (Array.isArray(resizedData)) {
      inputArray = new Float32Array(resizedData);
    } else if (resizedData && typeof resizedData === 'object' && 'buffer' in resizedData) {
      const view = resizedData as ArrayBufferView;
      inputArray = new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4);
    } else {
      return;
    }

    if (inputArray.length === 0) return;

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

      let maxIdx = 0;
      let maxVal = scores[0]!;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i]! > maxVal) { 
          maxVal = scores[i]!; 
          maxIdx = i; 
        }
      }

      if (__DEV__) {
        const indexed = Array.from(scores).map((s, i) => ({ s, i }));
        indexed.sort((a, b) => b.s - a.s);
        const top3 = indexed.slice(0, 3)
          .map(({ s, i }) => `${LABELS[i] ?? i}=${(s * 100).toFixed(1)}%`)
          .join(' | ');
        console.log(`[SignDetector] Vector Elements: ${inputArray.length} | Top 3: ${top3}`);
      }

      if (maxVal < CONFIDENCE_THRESHOLD) return;

      const label = LABELS[maxIdx] ?? `Class ${maxIdx}`;
      setPrediction({
        label,
        confidence: Math.round(maxVal * 100),
        isMedical: MEDICAL_LABELS.has(label),
      });
    } catch (e) {
      if (__DEV__) console.error('[SignDetector] Runtime execution inference error:', e);
    }
  }, []);

  return { state: plugin.state, isReady, prediction, reset, runInference };
}