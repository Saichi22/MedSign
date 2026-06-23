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

// ── besta_float16.tflite: YOLOv8n
//    Input  tensor: [1, 640, 640, 3]  — NHWC, float32
//    Output tensor: [1,  52, 8400]    — float32
//      52   = 4 bbox coords (cx, cy, w, h) + 48 class scores
//      8400 = number of anchors
// ──────────────────────────────────────────────────────────────────────────────
const MODEL_SIZE = 640;
const EXPECTED_INPUT_SIZE = MODEL_SIZE * MODEL_SIZE * 3; // 1,228,800

// Memory layout is ROW-MAJOR (C order).
// Element at feature row `f`, anchor column `a`:
//   rawScores[f * NUM_ANCHORS + a]
//
// Class score for class `c` at anchor `a`:
//   rawScores[(NUM_BBOX_COORDS + c) * NUM_ANCHORS + a]
//
// ⚠️  Do NOT use anchor-first indexing (a * 52 + f) — that would be correct
//     for shape [1, 8400, 52], which is NOT what this model produces.
const NUM_CLASSES = LABELS.length;    // 48
const NUM_ANCHORS = 8400;
const NUM_BBOX_COORDS = 4;
const EXPECTED_OUTPUT_SIZE = (NUM_BBOX_COORDS + NUM_CLASSES) * NUM_ANCHORS; // 436,800

export interface Prediction {
  label: string;
  confidence: number;
  /** True for phrase/word signs (numbers, emotions, common words) vs single letters */
  isPhrase: boolean;
}

// Phrase/word signs (shown with a distinct icon in UI).
// These are multi-meaning gestures rather than single alphabet letters.
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

    // ── Validate input size: must be 640×640×3 = 1,228,800 floats ──
    if (inputArray.length !== EXPECTED_INPUT_SIZE) {
      if (__DEV__) {
        console.warn(
          `[SignDetector] Input size mismatch! Got ${inputArray.length}, ` +
          `expected ${EXPECTED_INPUT_SIZE} (640×640×3).`,
        );
      }
      return;
    }

    // ── Validate normalization (values should be in [0, 1]) ──
    if (__DEV__) {
      let maxPixel = 0;
      for (let i = 0; i < Math.min(100, inputArray.length); i++) {
        if (inputArray[i]! > maxPixel) maxPixel = inputArray[i]!;
      }
      if (maxPixel > 1.5) {
        console.warn(
          `[SignDetector] Pixels appear un-normalized (max: ${maxPixel.toFixed(2)}). ` +
          'Divide by 255 before calling runInference.',
        );
      }
    }

    try {
      const safeBuffer = inputArray.buffer.slice(
        inputArray.byteOffset,
        inputArray.byteOffset + inputArray.byteLength,
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

      // ── Validate output size: must be 52×8400 = 436,800 floats ──
      if (__DEV__ && rawScores.length !== EXPECTED_OUTPUT_SIZE) {
        console.warn(
          `[SignDetector] Output size mismatch! Got ${rawScores.length}, ` +
          `expected ${EXPECTED_OUTPUT_SIZE} (52×8400).`,
        );
      }

      // ── Decode YOLOv8 output: shape [1, 52, 8400] ──
      //
      // Memory is row-major, so for feature row `f` and anchor column `a`:
      //   rawScores[f * NUM_ANCHORS + a]
      //
      // Class score for class `c` at anchor `a`:
      //   rawScores[(NUM_BBOX_COORDS + c) * NUM_ANCHORS + a]
      //
      // We scan all (class, anchor) pairs to find the globally highest score.
      let bestConf = 0;
      let bestClassIdx = 0;

      for (let c = 0; c < NUM_CLASSES; c++) {
        const rowBase = (NUM_BBOX_COORDS + c) * NUM_ANCHORS;
        for (let a = 0; a < NUM_ANCHORS; a++) {
          const score = rawScores[rowBase + a] ?? 0;
          if (score > bestConf) {
            bestConf = score;
            bestClassIdx = c;
          }
        }
      }

      if (__DEV__) {
        // Aggregate the best score per class for a top-5 summary log
        const classBest = new Float32Array(NUM_CLASSES);
        for (let c = 0; c < NUM_CLASSES; c++) {
          const rowBase = (NUM_BBOX_COORDS + c) * NUM_ANCHORS;
          for (let a = 0; a < NUM_ANCHORS; a++) {
            const score = rawScores[rowBase + a] ?? 0;
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
        isPhrase: PHRASE_LABELS.has(label),
      });
    } catch (e) {
      if (__DEV__) console.error('[SignDetector] Inference error:', e);
    }
  }, []);

  return { state: plugin.state, isReady, prediction, reset, runInference };
}