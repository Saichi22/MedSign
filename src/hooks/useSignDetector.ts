import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

// ── Labels in EXACT order from data.yaml (index = class id the model outputs) ──
export const LABELS = [
  'A',          // 0
  'B',          // 1
  'C',          // 2
  'D',          // 3
  'E',          // 4
  'Eight',      // 5
  'F',          // 6
  'Family',     // 7
  'Fine',       // 8
  'Five',       // 9
  'Four',       // 10
  'G',          // 11
  'H',          // 12
  'Help',       // 13
  'Home',       // 14
  'Hungry',     // 15
  'I',          // 16
  'I_hate_you', // 17
  'I_love_you', // 18
  'K',          // 19
  'L',          // 20
  'M',          // 21
  'N',          // 22
  'Nine',       // 23
  'No',         // 24
  'O',          // 25
  'Okay',       // 26
  'One',        // 27
  'P',          // 28
  'Pray',       // 29
  'Q',          // 30
  'R',          // 31
  'S',          // 32
  'Seven',      // 33
  'Six',        // 34
  'Sorry',      // 35
  'T',          // 36
  'Three',      // 37
  'Time',       // 38
  'Two',        // 39
  'U',          // 40
  'V',          // 41
  'W',          // 42
  'X',          // 43
  'Y',          // 44
  'Zero',       // 45
  'J',          // 46
  'Z',          // 47
];

export const CONFIDENCE_THRESHOLD = 0.20;

// ── besta_float16.tflite: YOLOv8 expects 640×640×3 ──
const MODEL_SIZE = 640;
const EXPECTED_INPUT_SIZE = MODEL_SIZE * MODEL_SIZE * 3; // 1,228,800

// YOLOv8 output: [1, 52, 8400] → 52 = 4 bbox coords + 48 class scores
const NUM_CLASSES = LABELS.length;  // 48
const NUM_ANCHORS = 8400;

export interface Prediction {
  label: string;
  confidence: number;
  isMedical: boolean;
}

// Phrase/word signs (shown with medical-bag icon in UI)
const PHRASE_LABELS = new Set([
  'Eight', 'Family', 'Fine', 'Five', 'Four',
  'Help', 'Home', 'Hungry', 'I_hate_you', 'I_love_you',
  'Nine', 'No', 'Okay', 'One', 'Pray',
  'Seven', 'Six', 'Sorry', 'Three', 'Time',
  'Two', 'Zero',
]);

export function useSignDetector() {
  const plugin = useTensorflowModel(
    require('../assets/besta_float16.tflite'),
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

    if (__DEV__) {
      console.log('sample pixels:', inputArray[0], inputArray[1], inputArray[2]);
    }

    // ── Validate input size ──
    if (inputArray.length !== EXPECTED_INPUT_SIZE) {
      if (__DEV__) {
        console.warn(
          `[SignDetector] Input size mismatch! Got ${inputArray.length}, ` +
          `expected ${EXPECTED_INPUT_SIZE} (640×640×3).`
        );
      }
      return;
    }

    // ── Validate normalization ──
    if (__DEV__) {
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

      // ── YOLOv8 output: [1, 52, 8400] ──
      // Per anchor layout: [cx, cy, w, h, cls0..cls47]
      // Find best class score across all 8400 anchors
      let bestConf = 0;
      let bestClassIdx = 0;

      for (let a = 0; a < NUM_ANCHORS; a++) {
        const base = a * (4 + NUM_CLASSES);
        for (let c = 0; c < NUM_CLASSES; c++) {
          const score = rawScores[base + 4 + c] ?? 0;
          if (score > bestConf) {
            bestConf = score;
            bestClassIdx = c;
          }
        }
      }

      if (__DEV__) {
        // Aggregate best score per class for top-5 log
        const classBest = new Float32Array(NUM_CLASSES);
        for (let a = 0; a < NUM_ANCHORS; a++) {
          const base = a * (4 + NUM_CLASSES);
          for (let c = 0; c < NUM_CLASSES; c++) {
            const score = rawScores[base + 4 + c] ?? 0;
            if (score > classBest[c]!) classBest[c] = score;
          }
        }
        const top5 = Array.from(classBest)
          .map((s, i) => ({ s, i }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 5)
          .map(({ s, i }) => `${LABELS[i] ?? `cls${i}`}=${(s * 100).toFixed(1)}%`)
          .join(' | ');
        console.log(`[SignDetector] Top 5: ${top5}`);
      }

      if (bestConf < CONFIDENCE_THRESHOLD) return;

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