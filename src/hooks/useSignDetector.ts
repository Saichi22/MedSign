/**
 * useSignDetector.ts
 *
 * Loads sign_model.tflite via react-native-fast-tflite (JSI / native bridge).
 * Exposes `model` and `isReady` so the frame processor in HomeScreen can call
 * model.runSync() directly inside the 'worklet' context.
 *
 * ─── File placement ──────────────────────────────────────────────────────────
 *  Place  sign_model.tflite  at:
 *    <project-root>/assets/sign_model.tflite          ← Metro bundles this
 *
 *  Then inside metro.config.js make sure .tflite is an asset extension:
 *    resolver: { assetExts: [...defaultAssetExts, 'tflite'] }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

export const LABELS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Tumutusok','Lalamunan','Mahirap','Masakit',
  'Nagtatae','Nahihilo','Naiihi','Namamanas','Nanghihina','Nasusuka',
];

export const CONFIDENCE_THRESHOLD = 0.75;
export const DEBOUNCE_FRAMES = 3;

/**
 * FIX 1 ─ Use useTensorflowModel (hook variant) instead of loadTensorflowModel
 *          so the model lifecycle is tied to the component tree.
 *
 * FIX 2 ─ require() path must resolve from the PROJECT ROOT, not from this
 *          file's location.  Metro resolves require() paths relative to the
 *          file that calls them, so put the .tflite in  assets/  at the root
 *          and write the require exactly as shown below.
 *
 * FIX 3 ─ Pass [] as the second argument (no delegate overrides) so it falls
 *          back to the CPU delegate, which works on every Android device
 *          without extra setup.
 */
export function useSignDetector() {
  // useTensorflowModel returns { state: 'loading' | 'loaded' | 'error', model }
  const plugin = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/sign_model.tflite'),
    [] // CPU delegate — safe default; add 'android-gpu' later if needed
  );

  const isReady = plugin.state === 'loaded';
  // Expose the raw model so the frame-processor worklet can call runSync()
  const model = plugin.state === 'loaded' ? plugin.model : undefined;

  return { isReady, model };
}