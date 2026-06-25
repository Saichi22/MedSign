import { useCallback, useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

// ─────────────────────────────────────────────────────────────────────────────
// Model: besta_float16.tflite  (YOLOv8-style detector, float16 weights)
//
// Input  tensor  "images"   → [1, 640, 640, 3]  float32  values in [0, 1]
// Output tensor  "Identity" → [1, 52, 8400]     float32
//   • rows 0-3  : bbox  cx, cy, w, h  (normalised to [0,1] relative to 640px)
//   • rows 4-51 : 48 class confidence scores (sigmoid already applied by model)
//   • 8400 anchors = 80×80 + 40×40 + 20×20  (three YOLO detection heads)
// ─────────────────────────────────────────────────────────────────────────────

// ── Model dimensions ──────────────────────────────────────────────────────────
export const MODEL_WIDTH    = 640;
export const MODEL_HEIGHT   = 640;
export const MODEL_CHANNELS = 3;
export const EXPECTED_INPUT_SIZE = MODEL_WIDTH * MODEL_HEIGHT * MODEL_CHANNELS; // 1,228,800

// ── Output layout ─────────────────────────────────────────────────────────────
const NUM_ANCHORS   = 8400; // 80*80 + 40*40 + 20*20
const BBOX_ROWS     = 4;    // cx, cy, w, h
const NUM_CLASSES   = 48;   // rows 4-51
const OUTPUT_ROWS   = BBOX_ROWS + NUM_CLASSES; // 52

// ── Labels ────────────────────────────────────────────────────────────────────
// First 36 preserve the original sign set (A-Z + 10 Filipino medical signs).
// Slots 36-47 are reserved for additional classes trained in besta;
// replace the 'Class_N' placeholders once you have the full YAML/names list.
export const LABELS: string[] = [
  // A-Z (indices 0-25)
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  // Filipino medical / symptom signs (indices 26-35)
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
  // Reserved / additional besta classes (indices 36-47)
  // ⚠️  Replace these once you have the besta model's class list
  'Class_36','Class_37','Class_38','Class_39',
  'Class_40','Class_41','Class_42','Class_43',
  'Class_44','Class_45','Class_46','Class_47',
];

// Sanity-check at module load time
if (LABELS.length !== NUM_CLASSES) {
  console.error(
    `[useSignDetector] LABELS length (${LABELS.length}) does not match ` +
    `model output classes (${NUM_CLASSES}). Update the LABELS array.`
  );
}

export const CONFIDENCE_THRESHOLD = 0.30; // minimum class score to emit a prediction
const NMS_IOU_THRESHOLD           = 0.45; // IoU threshold for Non-Maximum Suppression

const MEDICAL_LABELS = new Set([
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
]);

export interface Prediction {
  label: string;
  confidence: number;
  isMedical: boolean;
  /** Bounding box in [0,1] coords relative to the 640×640 input (cx,cy,w,h). */
  bbox?: [number, number, number, number];
}

// ─────────────────────────────────────────────────────────────────────────────
// NMS helpers (pure JS, runs on the JS thread)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert cx,cy,w,h → x1,y1,x2,y2 */
function cxcywh_to_xyxy(cx: number, cy: number, w: number, h: number): [number,number,number,number] {
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

function iou(a: [number,number,number,number], b: [number,number,number,number]): number {
  const interX1 = Math.max(a[0], b[0]);
  const interY1 = Math.max(a[1], b[1]);
  const interX2 = Math.min(a[2], b[2]);
  const interY2 = Math.min(a[3], b[3]);
  const interW  = Math.max(0, interX2 - interX1);
  const interH  = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;
  if (interArea === 0) return 0;
  const aArea = (a[2] - a[0]) * (a[3] - a[1]);
  const bArea = (b[2] - b[0]) * (b[3] - b[1]);
  return interArea / (aArea + bArea - interArea);
}

interface RawDetection {
  classIdx: number;
  score: number;
  bbox: [number,number,number,number]; // xyxy in [0,1]
}

/**
 * Parse the raw [52, 8400] output into a list of detections above the
 * confidence threshold, then apply per-class NMS.
 *
 * @param output  Flat Float32Array of length 52*8400, row-major [52][8400]
 *                i.e.  output[row * 8400 + anchor]
 */
function parseYoloOutput(output: Float32Array): RawDetection[] {
  const raw: RawDetection[] = [];

  for (let a = 0; a < NUM_ANCHORS; a++) {
    // Find best class for this anchor
    let bestCls   = 0;
    let bestScore = 0;

    for (let c = 0; c < NUM_CLASSES; c++) {
      const score = output[(BBOX_ROWS + c) * NUM_ANCHORS + a] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestCls   = c;
      }
    }

    if (bestScore < CONFIDENCE_THRESHOLD) continue;

    const cx = output[0 * NUM_ANCHORS + a] ?? 0;
    const cy = output[1 * NUM_ANCHORS + a] ?? 0;
    const w  = output[2 * NUM_ANCHORS + a] ?? 0;
    const h  = output[3 * NUM_ANCHORS + a] ?? 0;

    raw.push({
      classIdx: bestCls,
      score:    bestScore,
      bbox:     cxcywh_to_xyxy(cx, cy, w, h),
    });
  }

  if (raw.length === 0) return [];

  // ── Per-class NMS ──────────────────────────────────────────────────────────
  // Group by class, sort by score desc, greedily suppress overlapping boxes.
  const classGroups = new Map<number, RawDetection[]>();
  for (const det of raw) {
    if (!classGroups.has(det.classIdx)) classGroups.set(det.classIdx, []);
    classGroups.get(det.classIdx)!.push(det);
  }

  const kept: RawDetection[] = [];
  for (const group of classGroups.values()) {
    group.sort((a, b) => b.score - a.score);
    const suppressed = new Uint8Array(group.length);
    for (let i = 0; i < group.length; i++) {
      if (suppressed[i]) continue;
      kept.push(group[i]!);
      for (let j = i + 1; j < group.length; j++) {
        if (!suppressed[j] && iou(group[i]!.bbox, group[j]!.bbox) > NMS_IOU_THRESHOLD) {
          suppressed[j] = 1;
        }
      }
    }
  }

  return kept;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSignDetector() {
  const plugin = useTensorflowModel(
    // ⚠️  Make sure you copy besta_float16.tflite into your assets folder
    //     and update this require() path accordingly.
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

    // ── Coerce input to Float32Array ──────────────────────────────────────────
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

    // ── Validate input size (640×640×3 = 1,228,800) ──────────────────────────
    if (inputArray.length !== EXPECTED_INPUT_SIZE) {
      if (__DEV__) {
        console.warn(
          `[SignDetector] Input size mismatch! Got ${inputArray.length} floats, ` +
          `expected ${EXPECTED_INPUT_SIZE} (640×640×3). ` +
          `Ensure the frame is resized to 640×640 before calling runInference.`
        );
      }
      return;
    }

    // ── Normalisation sanity check (values must be in [0,1]) ─────────────────
    if (__DEV__) {
      let maxPixel = 0;
      const sampleLen = Math.min(300, inputArray.length);
      for (let i = 0; i < sampleLen; i++) {
        if ((inputArray[i] ?? 0) > maxPixel) maxPixel = inputArray[i]!;
      }
      if (maxPixel > 1.5) {
        console.warn(
          `[SignDetector] Pixel values appear un-normalised (sampled max: ${maxPixel.toFixed(2)}). ` +
          'Divide by 255 before passing to runInference.'
        );
      }
    }

    try {
      // react-native-fast-tflite requires an owned ArrayBuffer (no shared memory)
      const safeBuffer = inputArray.buffer.slice(
        inputArray.byteOffset,
        inputArray.byteOffset + inputArray.byteLength,
      ) as ArrayBuffer;

      const outputs = model.runSync([safeBuffer]);
      const raw = outputs[0];
      if (raw == null) return;

      // Coerce output to Float32Array
      let scores: Float32Array;
      if (raw instanceof Float32Array) {
        scores = raw;
      } else if (ArrayBuffer.isView(raw)) {
        scores = new Float32Array((raw as ArrayBufferView).buffer);
      } else if (raw instanceof ArrayBuffer) {
        scores = new Float32Array(raw);
      } else {
        if (__DEV__) console.warn('[SignDetector] Unexpected output type:', typeof raw);
        return;
      }

      // Expected: 52 * 8400 = 436,800 floats
      const expectedOutputSize = OUTPUT_ROWS * NUM_ANCHORS;
      if (scores.length !== expectedOutputSize) {
        if (__DEV__) {
          console.warn(
            `[SignDetector] Output size mismatch! Got ${scores.length}, ` +
            `expected ${expectedOutputSize} (${OUTPUT_ROWS}×${NUM_ANCHORS}).`
          );
        }
        return;
      }

      // ── Parse YOLO output ──────────────────────────────────────────────────
      const detections = parseYoloOutput(scores);

      if (__DEV__) {
        if (detections.length === 0) {
          console.log('[SignDetector] No detections above threshold.');
        } else {
          const top5 = detections
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(d => `${LABELS[d.classIdx] ?? d.classIdx}=${(d.score * 100).toFixed(1)}%`)
            .join(' | ');
          console.log(`[SignDetector] Detections: ${top5}`);
        }
      }

      if (detections.length === 0) return;

      // Pick highest-confidence detection across all classes
      const best = detections.reduce((a, b) => (a.score >= b.score ? a : b));
      const label = LABELS[best.classIdx] ?? `Class ${best.classIdx}`;

      setPrediction({
        label,
        confidence: Math.round(best.score * 100),
        isMedical:  MEDICAL_LABELS.has(label),
        bbox:       best.bbox,
      });
    } catch (e) {
      if (__DEV__) console.error('[SignDetector] Inference error:', e);
    }
  }, []);

  return { state: plugin.state, isReady, prediction, reset, runInference };
}