import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
];

export const CONFIDENCE_THRESHOLD = 0.30;

// Model expects 224x224x3 = 150,528 float32 values
const EXPECTED_INPUT_SIZE = 224 * 224 * 3;

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
      if (__DEV__) console.warn('[SignDetector] Unknown input type:', typeof resizedData);
      return;
    }

    if (inputArray.length === 0) return;
    console.log(
  'sample pixels:',
  inputArray[0],
  inputArray[1],
  inputArray[2]
);

    // ── CRITICAL: Validate input size matches model expectation (224×224×3) ──
    if (inputArray.length !== EXPECTED_INPUT_SIZE) {
      if (__DEV__) {
        console.warn(
          `[SignDetector] Input size mismatch! Got ${inputArray.length} values, ` +
          `expected ${EXPECTED_INPUT_SIZE} (224×224×3). ` +
          `Did you resize to 160×160 instead of 224×224?`
        );
      }
      return;
    }

    // ── Validate normalization: values should be in [0,1], not [0,255] ──
    if (__DEV__) {
      let maxPixel = 0;
      for (let i = 0; i < Math.min(100, inputArray.length); i++) {
        if (inputArray[i]! > maxPixel) maxPixel = inputArray[i]!;
      }
      if (maxPixel > 1.5) {
        console.warn(
          `[SignDetector] Pixel values appear un-normalized (max sampled: ${maxPixel.toFixed(2)}). ` +
          'Divide by 255.0 before passing to runInference.'
        );
      }
    }

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
        const top5 = indexed.slice(0, 5)
          .map(({ s, i }) => `${LABELS[i] ?? i}=${(s * 100).toFixed(1)}%`)
          .join(' | ');
        console.log(`[SignDetector] Input OK (${inputArray.length}) | Top 5: ${top5}`);
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