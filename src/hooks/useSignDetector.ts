import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A', 'B', 'C', 'D', 'E', 'Eight', 'F', 'Family', 'Fine', 'Five',
  'Four', 'G', 'H', 'Help', 'Home', 'Hungry', 'I', 'I_hate_you',
  'I_love_you', 'K', 'L', 'M', 'N', 'Nine', 'No', 'O', 'Okay', 'One',
  'P', 'Pray', 'Q', 'R', 'S', 'Seven', 'Six', 'Sorry', 'T', 'Three',
  'Time', 'Two', 'U', 'V', 'W', 'X', 'Y', 'Zero', 'J', 'Z',
];

// Exported so TranslatorScreen can use them in the worklet
export const NUM_CLASSES = LABELS.length; // 48
export const NUM_ANCHORS = 8400;
export const CONFIDENCE_THRESHOLD = 0.25;

const VOTE_CONFIRM_THRESHOLD = 0.28;
const VOTE_WINDOW = 3;
const HOLD_TIME_MS = 1200;

const MODEL_SIZE = 640;
const EXPECTED_INPUT_SIZE = MODEL_SIZE * MODEL_SIZE * 3;

export interface Prediction {
  label: string;
  confidence: number;
  isMedical: boolean;
}

const PHRASE_LABELS = new Set([
  'Eight', 'Family', 'Fine', 'Five', 'Four',
  'Help', 'Home', 'Hungry', 'I_hate_you', 'I_love_you',
  'Nine', 'No', 'Okay', 'One', 'Pray',
  'Seven', 'Six', 'Sorry', 'Three', 'Time',
  'Two', 'Zero',
]);

// Pre-allocated buffers — never allocate inside runInference
const _windowMeans = new Float32Array(NUM_CLASSES);

function evaluateVotes(buffer: Float32Array[], count: number): { classIdx: number; meanScore: number } | null {
  if (count === 0) return null;

  _windowMeans.fill(0);
  for (let f = 0; f < count; f++) {
    const frame = buffer[f]!;
    for (let c = 0; c < NUM_CLASSES; c++) {
      _windowMeans[c] += frame[c]!;
    }
  }

  let bestIdx = -1;
  let bestMean = 0;
  for (let c = 0; c < NUM_CLASSES; c++) {
    const mean = _windowMeans[c]! / count;
    if (mean > bestMean) {
      bestMean = mean;
      bestIdx = c;
    }
  }

  if (bestIdx === -1 || bestMean < VOTE_CONFIRM_THRESHOLD) return null;
  return { classIdx: bestIdx, meanScore: bestMean };
}

export function useSignDetector() {
  const plugin = useTensorflowModel(
    require('../assets/besta_float16.tflite'),
    [],
  );

  const isReady = plugin.state === 'loaded' && plugin.model != null;
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  useEffect(() => {
    if (__DEV__) console.log(`[SignDetector] model state → ${plugin.state}`);
  }, [plugin.state]);

  const modelRef = useRef(plugin.model);
  useEffect(() => { modelRef.current = plugin.model; }, [plugin.model]);

  const voteBuffer = useRef<Float32Array[]>(
    Array.from({ length: VOTE_WINDOW }, () => new Float32Array(NUM_CLASSES))
  );
  const voteCount = useRef(0);
  const voteHead  = useRef(0);
  const holdUntil = useRef(0);

  const reset = useCallback(() => {
    setPrediction(null);
    voteCount.current = 0;
    voteHead.current  = 0;
    holdUntil.current = 0;
    for (const f of voteBuffer.current) f.fill(0);
  }, []);

  // Now receives pre-computed class scores (48 numbers) from the worklet,
  // OR an empty array meaning "no hand visible".
  // The model is no longer called here — it runs inside the worklet via
  // the resize plugin output fed directly to the TFLite runtime.
  const runInference = useCallback((classScores: number[]) => {
    // Empty array = no hand signal from worklet
    if (classScores.length === 0) {
      voteCount.current = 0;
      voteHead.current  = 0;
      for (const f of voteBuffer.current) f.fill(0);
      setPrediction(null);
      return;
    }

    if (classScores.length !== NUM_CLASSES) return;

    // Write scores into the ring buffer slot
    const slot = voteBuffer.current[voteHead.current]!;
    for (let c = 0; c < NUM_CLASSES; c++) slot[c] = classScores[c]!;
    voteHead.current = (voteHead.current + 1) % VOTE_WINDOW;
    if (voteCount.current < VOTE_WINDOW) voteCount.current++;

    if (voteCount.current < VOTE_WINDOW) return;

    const winner = evaluateVotes(voteBuffer.current, voteCount.current);

    if (winner == null) {
      if (Date.now() > holdUntil.current) setPrediction(null);
      return;
    }

    const now   = Date.now();
    const label = LABELS[winner.classIdx] ?? `Class ${winner.classIdx}`;

    setPrediction(prev => {
      if (prev !== null && now < holdUntil.current && prev.label !== label) {
        return prev;
      }
      holdUntil.current = now + HOLD_TIME_MS;
      return {
        label,
        confidence: Math.round(winner.meanScore * 100),
        isMedical: PHRASE_LABELS.has(label),
      };
    });
  }, []);

  return { state: plugin.state, isReady, prediction, reset, runInference };
}