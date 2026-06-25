import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

// ── Labels in EXACT order from data.yaml (index = class id the model outputs) ──
// Each string maps to a class index that the YOLOv8 model outputs.
// The position of each label here MUST match its class ID in the trained model.
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

// Minimum confidence score (0–1) required before we accept a detection as valid.
// Detections below this threshold are discarded to avoid false positives.
export const CONFIDENCE_THRESHOLD = 0.20;

// ── besta_float16.tflite: YOLOv8 expects 640×640×3 ──
// The model was trained on 640×640 RGB images, so every camera frame
// must be resized to exactly these dimensions before inference.
const MODEL_SIZE = 640;
const EXPECTED_INPUT_SIZE = MODEL_SIZE * MODEL_SIZE * 3; // 1,228,800 float32 values total

// YOLOv8 output tensor shape: [1, 52, 8400]
//   52  = 4 bounding-box coordinates + 48 class scores
//   8400 = number of candidate anchor boxes the model evaluates per frame
const NUM_CLASSES = LABELS.length;  // 48
const NUM_ANCHORS = 8400;

// Shape of a single detection result exposed to the UI
export interface Prediction {
  label: string;       // Human-readable sign name (e.g. "Hello", "A")
  confidence: number;  // Integer percentage 0–100
  isMedical: boolean;  // True when the sign is a word/phrase rather than a letter
}

// Signs that represent words or phrases (as opposed to individual alphabet letters).
// These are flagged with a medical-bag icon in the UI to make them visually distinct.
const PHRASE_LABELS = new Set([
  'Eight', 'Family', 'Fine', 'Five', 'Four',
  'Help', 'Home', 'Hungry', 'I_hate_you', 'I_love_you',
  'Nine', 'No', 'Okay', 'One', 'Pray',
  'Seven', 'Six', 'Sorry', 'Three', 'Time',
  'Two', 'Zero',
]);

export function useSignDetector() {
  // Load the TFLite model from the app's asset bundle.
  // `plugin.state` transitions: 'loading' → 'loaded' | 'error'
  const plugin = useTensorflowModel(
    require('../assets/besta_float16.tflite'),
    [],
  );

  // The hook is ready to run inference only once the model has fully loaded.
  const isReady = plugin.state === 'loaded' && plugin.model != null;

  // Log model input/output tensor shapes once the model loads — useful for
  // verifying the model matches the expected [1, 52, 8400] output layout.
  useEffect(() => {
  if (plugin.state === 'loaded' && plugin.model != null) {
    console.log('[Model] inputs:', JSON.stringify(plugin.model.inputs));
    console.log('[Model] outputs:', JSON.stringify(plugin.model.outputs));
  }
}, [plugin.state]);

  // The most recent detection result. Null when nothing is detected above threshold.
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  // Log model state changes in development for easier debugging.
  useEffect(() => {
    if (__DEV__) {
      console.log(`[SignDetector] model state → ${plugin.state}`);
    }
  }, [plugin.state]);

  // Keep a ref to the model so the runInference callback can access it
  // without being recreated every time the model reference updates.
  const modelRef = useRef(plugin.model);
  useEffect(() => { modelRef.current = plugin.model; }, [plugin.model]);

  // Clears the current prediction — called when the user stops a session.
  const reset = useCallback(() => setPrediction(null), []);

  // ── Core inference function ──
  // Accepts a flat array of normalised pixel values (R,G,B channels, planar),
  // runs them through the TFLite model, and updates the prediction state.
  const runInference = useCallback((resizedData: unknown) => {
  const model = modelRef.current;
  if (model == null) return;

  // Normalise the incoming data into a Float32Array regardless of how it
  // arrived from the worklet bridge (typed array, plain JS array, or an
  // object with numeric keys — the bridge sometimes serialises typed arrays
  // as plain objects).
  let inputArray: Float32Array;

  if (resizedData instanceof Float32Array) {
    // Already the right type — use directly.
    inputArray = resizedData;
  } else if (Array.isArray(resizedData)) {
    // Plain JS array — wrap it in a typed array.
    inputArray = new Float32Array(resizedData);
  } else if (
    resizedData != null &&
    typeof resizedData === 'object' &&
    '0' in (resizedData as object)
  ) {
    // ← Worklet bridge serializes typed arrays as plain objects with numeric keys.
    // Reconstruct a Float32Array from those keys in order.
    const obj = resizedData as Record<number, number>;
    const length = Object.keys(obj).length;
    inputArray = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      inputArray[i] = obj[i] ?? 0;
    }
  } else if (resizedData != null && typeof resizedData === 'object' && 'buffer' in resizedData) {
    // ArrayBufferView — reinterpret its underlying buffer as Float32.
    const view = resizedData as ArrayBufferView;
    inputArray = new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4);
  } else {
    console.warn('[SignDetector] Unknown input type:', typeof resizedData);
    return;
  }

    // Guard: skip empty arrays that would crash the model.
    if (inputArray.length === 0) return;

    if (__DEV__) {
      // Sample one pixel from each colour channel plane to verify the
      // data layout (R plane @ 0, G plane @ 640*640, B plane @ 640*640*2).
      console.log(
  'sample pixels:',
  inputArray[0],
  inputArray[640 * 640],
  inputArray[640 * 640 * 2]
);
    }

    // ── Validate input size ──
    // If the resize plugin produced a different number of pixels than expected,
    // inference would silently corrupt memory inside the model — bail out early.
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
    // Pixel values should be in [0, 1]. If they're still in [0, 255] the model
    // will produce garbage scores — warn loudly during development.
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
      // Copy the data into a fresh ArrayBuffer so the TFLite runtime gets a
      // clean, offset-free view (some runtimes choke on sliced buffers).
      const safeBuffer = inputArray.buffer.slice(
        inputArray.byteOffset,
        inputArray.byteOffset + inputArray.byteLength
      ) as ArrayBuffer;

      // Run the model synchronously. `outputs[0]` is the raw score tensor.
      const outputs = model.runSync([safeBuffer]);
      const raw = outputs[0];
      if (raw == null) return;

      // Normalise the output to a Float32Array regardless of how the runtime
      // returns it (ArrayBufferView or plain ArrayBuffer).
      let rawScores: Float32Array;
      if (ArrayBuffer.isView(raw)) {
        rawScores = raw as unknown as Float32Array;
      } else if (raw instanceof ArrayBuffer) {
        rawScores = new Float32Array(raw);
      } else {
        return;
      }

      if (rawScores.length === 0) return;

      if (__DEV__) {
        // Print the score for the first anchor across several class offsets
        // to verify the [class * NUM_ANCHORS + anchor] memory layout is correct.
        console.log(
          'first anchor:',
          rawScores[0],
          rawScores[8400],
          rawScores[16800],
          rawScores[25200],
          rawScores[33600],
        );
        console.log(
        'alt first class values:',
        rawScores[4],
        rawScores[5],
        rawScores[6],
        rawScores[7],
        rawScores[8],
        rawScores[9],
        rawScores[10],
      );

        // For each class, find the single highest-scoring anchor and log it.
        // This lets us see which signs the model is "seeing" even below threshold.
        for (let c = 0; c < NUM_CLASSES; c++) {
          let maxScore = -Infinity;

          for (let a = 0; a < NUM_ANCHORS; a++) {
            const score = rawScores[(4 + c) * NUM_ANCHORS + a];

            if (score > maxScore) {
              maxScore = score;
            }
          }
        }
      }

      // ── Find the single best (class, anchor) combination ──
      // YOLOv8 output layout (after the 4 bbox rows):
      //   score for class c at anchor a  =  rawScores[(4 + c) * NUM_ANCHORS + a]
      // We iterate every anchor×class pair and keep the global winner.
      let bestConf = 0;
      let bestClassIdx = -1;
      for (let a = 0; a < NUM_ANCHORS; a++) {
        for (let c = 0; c < NUM_CLASSES; c++) {
          const score = rawScores[(4 + c) * NUM_ANCHORS + a] ?? 0;

          if (score > bestConf) {
            bestConf = score;
            bestClassIdx = c;
          }
        }
      }

      // Sanity-check: log total output length and expected length once per frame.
      console.log('Output length:', rawScores.length);
      console.log('Expected:', 52 * 8400);

      if (__DEV__) {
        // Build a per-class best-score array for a human-readable top-5 log.
        // This is separate from the winner search above so we can see the full
        // ranking without re-running the inner loop.
        const classBest = new Float32Array(NUM_CLASSES);

        for (let a = 0; a < NUM_ANCHORS; a++) {
          for (let c = 0; c < NUM_CLASSES; c++) {
            const score = rawScores[(4 + c) * NUM_ANCHORS + a] ?? 0;

            if (score > classBest[c]!) {
              classBest[c] = score;
            }
          }
        }
        // Log the top-5 classes with their peak confidence scores.
        const top5 = Array.from(classBest)
          .map((s, i) => ({ s, i }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 5)
          .map(({ s, i }) => `${LABELS[i] ?? `cls${i}`}=${(s * 100).toFixed(1)}%`)
          .join(' | ');
        console.log(`[SignDetector] Top 5: ${top5}`);
      }

      console.log('bestConf=', bestConf);

      // If the best score is below our confidence threshold, treat the frame
      // as containing no recognisable sign and clear any previous prediction.
      if (bestConf < CONFIDENCE_THRESHOLD) {
        setPrediction(null);
        return;
      }

      // Map the winning class index back to a human-readable label and
      // publish the prediction to the UI.
      const label = LABELS[bestClassIdx] ?? `Class ${bestClassIdx}`;
      setPrediction({
        label,
        confidence: Math.round(bestConf * 100),
        isMedical: PHRASE_LABELS.has(label), // Flag word/phrase signs separately
      });
    } catch (e) {
      if (__DEV__) console.error('[SignDetector] Inference error:', e);
    }
  }, []);

  return { state: plugin.state, isReady, prediction, reset, runInference };
}