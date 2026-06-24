import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A', 'B', 'C', 'D', 'E', 'Eight', 'F', 'Family', 'Fine', 'Five',
  'Four', 'G', 'H', 'Help', 'Home', 'Hungry', 'I', 'I_hate_you',
  'I_love_you', 'K', 'L', 'M', 'N', 'Nine', 'No', 'O', 'Okay', 'One',
  'P', 'Pray', 'Q', 'R', 'S', 'Seven', 'Six', 'Sorry', 'T', 'Three',
  'Time', 'Two', 'U', 'V', 'W', 'X', 'Y', 'Zero', 'J', 'Z',
];

export const CONFIDENCE_THRESHOLD = 0.20;
const NUM_CLASSES = LABELS.length; // 48
const NUM_ANCHORS = 8400;
const EXPECTED_INPUT_SIZE = 640 * 640 * 3; // 1,228,800

const PHRASE_LABELS = new Set([
  'Eight', 'Family', 'Fine', 'Five', 'Four',
  'Help', 'Home', 'Hungry', 'I_hate_you', 'I_love_you',
  'Nine', 'No', 'Okay', 'One', 'Pray',
  'Seven', 'Six', 'Sorry', 'Three', 'Time',
  'Two', 'Zero',
]);

export interface Prediction {
  label: string;
  confidence: number;
  isMedical: boolean;
}

export function useSignDetector() {
  const plugin = useTensorflowModel(
    require('../assets/besta_float16.tflite'),
    [],
  );

  const isReady = plugin.state === 'loaded' && plugin.model != null;
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const modelRef = useRef(plugin.model);
  useEffect(() => { modelRef.current = plugin.model; }, [plugin.model]);

  const reset = useCallback(() => setPrediction(null), []);

  const runInference = useCallback((resizedData: unknown) => {
    const model = modelRef.current;
    if (model == null) return;

    // Accept Float32Array directly from the worklet (vision-camera-resize-plugin returns this)
    let inputArray: Float32Array;
    if (resizedData instanceof Float32Array) {
      inputArray = resizedData;
    } else if (Array.isArray(resizedData)) {
      inputArray = new Float32Array(resizedData);
    } else if (resizedData && typeof resizedData === 'object' && 'buffer' in resizedData) {
      const v = resizedData as ArrayBufferView;
      inputArray = new Float32Array(v.buffer, v.byteOffset, v.byteLength / 4);
    } else {
      return;
    }

    if (inputArray.length !== EXPECTED_INPUT_SIZE) return;

    // Slice to ensure a clean standalone ArrayBuffer with byteOffset = 0
    const safeBuffer = inputArray.buffer.slice(
      inputArray.byteOffset,
      inputArray.byteOffset + inputArray.byteLength,
    ) as ArrayBuffer;

    try {
      const outputs = model.runSync([safeBuffer]);
      const raw = outputs[0];
      if (raw == null) return;

      const rawScores = raw instanceof ArrayBuffer
        ? new Float32Array(raw)
        : new Float32Array((raw as ArrayBufferView).buffer);

      if (rawScores.length === 0) return;

      // YOLOv8 output shape [1, 52, 8400] — channel-first flat layout:
      // class c at anchor a → rawScores[(4 + c) * NUM_ANCHORS + a]
      let bestConf = 0;
      let bestClassIdx = 0;
      for (let c = 0; c < NUM_CLASSES; c++) {
        const rowOffset = (4 + c) * NUM_ANCHORS;
        for (let a = 0; a < NUM_ANCHORS; a++) {
          const score = rawScores[rowOffset + a];
          if (score > bestConf) {
            bestConf = score;
            bestClassIdx = c;
          }
        }
      }

      if (bestConf < CONFIDENCE_THRESHOLD) return;

      const label = LABELS[bestClassIdx];
      if (label == null) return;

      setPrediction({
        label,
        confidence: Math.round(bestConf * 100),
        isMedical: PHRASE_LABELS.has(label),
      });
    } catch (_) {}
  }, []);

  return { state: plugin.state, isReady, prediction, reset, runInference };
}