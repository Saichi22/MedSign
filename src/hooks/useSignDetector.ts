import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

// ── Labels in EXACT order from data.yaml (index = class id the model outputs) ──
export const LABELS = [
  'A', 'B', 'C', 'D', 'E', 'Eight', 'F', 'Family', 'Fine', 'Five',
  'Four', 'G', 'H', 'Help', 'Home', 'Hungry', 'I', 'I_hate_you',
  'I_love_you', 'K', 'L', 'M', 'N', 'Nine', 'No', 'O', 'Okay', 'One',
  'P', 'Pray', 'Q', 'R', 'S', 'Seven', 'Six', 'Sorry', 'T', 'Three',
  'Time', 'Two', 'U', 'V', 'W', 'X', 'Y', 'Zero', 'J', 'Z',
];

// ── FIX 1: Raise the threshold significantly ──
// YOLOv8 class scores are raw logits. After sigmoid(), a score of 0.20 raw
// maps to ~0.55 probability. Never accept predictions below 0.55 post-sigmoid
// or you'll get constant false positives from background noise.
// Start at 0.60 and raise if you still see noise.
export const CONFIDENCE_THRESHOLD = 0.60;

// ── FIX 2: Temporal smoothing ──
// How many consecutive frames must agree before we accept a prediction.
// At 2s per frame this means 4 seconds of the same sign before committing.
// Lower to 1 if you want faster response (but more noise).
const SMOOTHING_FRAMES = 2;

const MODEL_SIZE = 640;
const EXPECTED_INPUT_SIZE = MODEL_SIZE * MODEL_SIZE * 3;

const NUM_CLASSES = LABELS.length; // 48
const NUM_ANCHORS = 8400;

export interface Prediction {
  label: string;
  confidence: number; // Integer percentage 0–100 (post-sigmoid)
  isMedical: boolean;
}

const PHRASE_LABELS = new Set([
  'Eight', 'Family', 'Fine', 'Five', 'Four',
  'Help', 'Home', 'Hungry', 'I_hate_you', 'I_love_you',
  'Nine', 'No', 'Okay', 'One', 'Pray',
  'Seven', 'Six', 'Sorry', 'Three', 'Time',
  'Two', 'Zero',
]);

// ── FIX 3: Sigmoid helper ──
// YOLOv8 does NOT apply sigmoid inside the model when using TFLite export
// without the --simplify flag. The class score values are raw logits.
// sigmoid(x) = 1 / (1 + e^(-x))
// This converts logits to proper 0–1 probabilities before thresholding.
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function useSignDetector() {
  const plugin = useTensorflowModel(
    require('../assets/besta_float16.tflite'),
    [],
  );

  const isReady = plugin.state === 'loaded' && plugin.model != null;

  useEffect(() => {
    if (plugin.state === 'loaded' && plugin.model != null) {
      console.log('[Model] inputs:', JSON.stringify(plugin.model.inputs));
      console.log('[Model] outputs:', JSON.stringify(plugin.model.outputs));
    }
  }, [plugin.state]);

  const [prediction, setPrediction] = useState<Prediction | null>(null);

  useEffect(() => {
    if (__DEV__) {
      console.log(`[SignDetector] model state → ${plugin.state}`);
    }
  }, [plugin.state]);

  const modelRef = useRef(plugin.model);
  useEffect(() => { modelRef.current = plugin.model; }, [plugin.model]);

  // ── FIX 4: Temporal smoothing state ──
  // Track how many consecutive frames have returned the same top class.
  // Only publish a prediction once it's been stable for SMOOTHING_FRAMES.
  const smoothingRef = useRef<{ classIdx: number; count: number }>({
    classIdx: -1,
    count: 0,
  });

  const reset = useCallback(() => {
    setPrediction(null);
    smoothingRef.current = { classIdx: -1, count: 0 };
  }, []);

  const runInference = useCallback((resizedData: unknown) => {
    const model = modelRef.current;
    if (model == null) return;

    let inputArray: Float32Array;

    if (resizedData instanceof Float32Array) {
      inputArray = resizedData;
    } else if (Array.isArray(resizedData)) {
      inputArray = new Float32Array(resizedData);
    } else if (
      resizedData != null &&
      typeof resizedData === 'object' &&
      '0' in (resizedData as object)
    ) {
      const obj = resizedData as Record<number, number>;
      const length = Object.keys(obj).length;
      inputArray = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        inputArray[i] = obj[i] ?? 0;
      }
    } else if (resizedData != null && typeof resizedData === 'object' && 'buffer' in resizedData) {
      const view = resizedData as ArrayBufferView;
      inputArray = new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4);
    } else {
      console.warn('[SignDetector] Unknown input type:', typeof resizedData);
      return;
    }

    if (inputArray.length === 0) return;

    if (inputArray.length !== EXPECTED_INPUT_SIZE) {
      if (__DEV__) {
        console.warn(
          `[SignDetector] Input size mismatch! Got ${inputArray.length}, ` +
          `expected ${EXPECTED_INPUT_SIZE} (640×640×3).`
        );
      }
      return;
    }

    if (__DEV__) {
      // Check normalization: values should be in [0, 1].
      let maxPixel = 0;
      for (let i = 0; i < Math.min(100, inputArray.length); i++) {
        if (inputArray[i]! > maxPixel) maxPixel = inputArray[i]!;
      }
      if (maxPixel > 1.5) {
        console.warn(
          `[SignDetector] Pixels appear un-normalized (max: ${maxPixel.toFixed(2)}). ` +
          'Divide by 255 before calling runInference.'
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

      let rawScores: Float32Array;
      if (ArrayBuffer.isView(raw)) {
        rawScores = raw as unknown as Float32Array;
      } else if (raw instanceof ArrayBuffer) {
        rawScores = new Float32Array(raw);
      } else {
        return;
      }

      if (rawScores.length === 0) return;

      // ── FIX 5: Apply sigmoid + find best class per anchor ──
      // Iterate anchors, apply sigmoid to each class score, track global winner.
      // This is the correct way to read YOLOv8 classification output from TFLite.
      let bestConf = 0;
      let bestClassIdx = -1;

      for (let a = 0; a < NUM_ANCHORS; a++) {
        for (let c = 0; c < NUM_CLASSES; c++) {
          // Apply sigmoid to convert raw logit → probability
          const prob = sigmoid(rawScores[(4 + c) * NUM_ANCHORS + a] ?? 0);

          if (prob > bestConf) {
            bestConf = prob;
            bestClassIdx = c;
          }
        }
      }

      if (__DEV__) {
        // Build per-class best post-sigmoid scores for the top-5 log.
        const classBest = new Float32Array(NUM_CLASSES);
        for (let a = 0; a < NUM_ANCHORS; a++) {
          for (let c = 0; c < NUM_CLASSES; c++) {
            const prob = sigmoid(rawScores[(4 + c) * NUM_ANCHORS + a] ?? 0);
            if (prob > classBest[c]!) classBest[c] = prob;
          }
        }
        const top5 = Array.from(classBest)
          .map((s, i) => ({ s, i }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 5)
          .map(({ s, i }) => `${LABELS[i] ?? `cls${i}`}=${(s * 100).toFixed(1)}%`)
          .join(' | ');
        console.log(`[SignDetector] Top 5 (post-sigmoid): ${top5}`);
        console.log(`[SignDetector] bestConf (post-sigmoid)=`, bestConf.toFixed(4));
      }

      // ── FIX 6: Temporal smoothing ──
      // Require SMOOTHING_FRAMES consecutive frames with the same top class
      // before surfacing a prediction. Resets the counter on any class change.
      // If confidence is below threshold, clear prediction and reset counter.
      if (bestConf < CONFIDENCE_THRESHOLD || bestClassIdx === -1) {
        smoothingRef.current = { classIdx: -1, count: 0 };
        setPrediction(null);
        return;
      }

      const smooth = smoothingRef.current;
      if (bestClassIdx === smooth.classIdx) {
        smooth.count += 1;
      } else {
        // New class detected — restart the counter.
        smoothingRef.current = { classIdx: bestClassIdx, count: 1 };
        if (__DEV__) {
          console.log(`[SignDetector] New candidate: ${LABELS[bestClassIdx]} (1/${SMOOTHING_FRAMES})`);
        }
        return; // Don't publish yet
      }

      if (smooth.count < SMOOTHING_FRAMES) {
        if (__DEV__) {
          console.log(`[SignDetector] Smoothing: ${LABELS[bestClassIdx]} (${smooth.count}/${SMOOTHING_FRAMES})`);
        }
        return; // Not stable enough yet
      }

      // Stable prediction confirmed — publish it.
      const label = LABELS[bestClassIdx] ?? `Class ${bestClassIdx}`;
      setPrediction({
        label,
        confidence: Math.round(bestConf * 100),
        isMedical: PHRASE_LABELS.has(label),
      });
    } catch (e) {
      if (__DEV__) console.error('[SignDetector] Inference error:', e);
    }
  }, []);

  return { state: plugin.state, isReady, prediction, reset, runInference };
}