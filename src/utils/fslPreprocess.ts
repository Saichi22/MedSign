// utils/fslPreprocess.ts
// TypeScript port of fsl_common.py (FSL16 TCN, spec v2.0, sections 4-7).
// Pure functions only (no React Native imports) so it can be unit-tested in Node against
// fsl16_test_vectors.json.  If this file and fsl_common.py ever disagree, fsl_common.py is right.
//
// Frame layout: Float32Array(59 * 3), NaN = not detected
//   points 0..16  pose (nose, eyes, ears, mouth, shoulders 11/12, elbows, wrists 15/16)
//   points 17..37 signer's LEFT hand (21)
//   points 38..58 signer's RIGHT hand (21)
// Coordinates are in image-HEIGHT units (x * W/H), image NOT mirrored.

export const T_FRAMES = 40;
export const POSE_N = 17;
export const HAND_N = 21;
export const L_OFF = POSE_N; // 17
export const R_OFF = POSE_N + HAND_N; // 38
export const N_POINTS = POSE_N + 2 * HAND_N; // 59
export const FRAME_LEN = N_POINTS * 3; // 177
export const FEATURE_DIM = 272;
export const REST_Y = 1.2;

// Decision rule (spec section 7)
export const MIN_CONF = 0.55;
export const MIN_MARGIN = 0.15;

export type RawFrame = Float32Array;
export type Group = [number, number];

/** What the native plugin returns per camera frame (all coords normalised 0..1 of the UPRIGHT image). */
export type LandmarkResult = {
  w: number; // width of the upright image given to MediaPipe
  h: number; // height of the upright image
  ts: number; // monotonic ms timestamp of this frame
  pose: number[]; // 17 * (x, y) flattened, or [] if no pose
  hands: { lm: number[]; label: string }[]; // lm = 21 * (x, y, z) flattened; label = MediaPipe handedness
};

const HAND_GROUPS: Group[] = [
  [L_OFF, L_OFF + HAND_N],
  [R_OFF, R_OFF + HAND_N],
];
const POSE_GROUP: Group[] = [[0, POSE_N]];

// ============================================================================
// 4. Per-frame array from MediaPipe results (spec 4.3 - 4.5)
// ============================================================================
export function newEmptyFrame(): RawFrame {
  return new Float32Array(FRAME_LEN).fill(NaN);
}

export function resultsToFrame(res: LandmarkResult): RawFrame {
  const out = newEmptyFrame();
  const ar = res.w / res.h;

  if (res.pose && res.pose.length >= POSE_N * 2) {
    for (let i = 0; i < POSE_N; i++) {
      out[i * 3] = res.pose[i * 2] * ar;
      out[i * 3 + 1] = res.pose[i * 2 + 1];
      out[i * 3 + 2] = 0; // pose z is unreliable
    }
  }

  const hands = (res.hands ?? [])
    .filter(h => h.lm && h.lm.length >= HAND_N * 3)
    .map(h => {
      const arr = new Float32Array(HAND_N * 3);
      for (let i = 0; i < HAND_N; i++) {
        arr[i * 3] = h.lm[i * 3] * ar;
        arr[i * 3 + 1] = h.lm[i * 3 + 1];
        arr[i * 3 + 2] = h.lm[i * 3 + 2] * ar;
      }
      return { arr, label: h.label as string | null };
    });
  if (hands.length === 0) return out;

  const havePose = !Number.isNaN(out[15 * 3]);
  const dist = (a: Float32Array, wx: number, wy: number) => Math.hypot(a[0] - wx, a[1] - wy);
  let left: Float32Array | null = null;
  let right: Float32Array | null = null;

  if (havePose) {
    // nearest pose wrist: 15 = signer's left, 16 = signer's right
    const lwx = out[15 * 3], lwy = out[15 * 3 + 1];
    const rwx = out[16 * 3], rwy = out[16 * 3 + 1];
    if (hands.length === 1) {
      const a = hands[0].arr;
      if (dist(a, lwx, lwy) <= dist(a, rwx, rwy)) left = a;
      else right = a;
    } else {
      const a = hands[0].arr, b = hands[1].arr;
      const c1 = dist(a, lwx, lwy) + dist(b, rwx, rwy);
      const c2 = dist(a, rwx, rwy) + dist(b, lwx, lwy);
      if (c1 <= c2) { left = a; right = b; } else { left = b; right = a; }
    }
  } else if (hands.length >= 2) {
    // un-mirrored image: the signer's left hand appears on the image RIGHT
    const a = hands[0].arr, b = hands[1].arr;
    if (a[0] > b[0]) { left = a; right = b; } else { left = b; right = a; }
  } else {
    // MediaPipe labels assume a mirrored image, so on our un-mirrored frame "Left" = signer's right
    if (hands[0].label === 'Left') right = hands[0].arr;
    else left = hands[0].arr;
  }
  if (left) out.set(left, L_OFF * 3);
  if (right) out.set(right, R_OFF * 3);
  return out;
}

// ============================================================================
// 2. Sequence cleaning, trimming, resampling (spec 6.1 - 6.5)
// ============================================================================
function fillGaps(raw: RawFrame[], maxGap: number | null, groups: Group[]): RawFrame[] {
  const out = raw.map(f => f.slice());
  const n = out.length;
  for (const [a, b] of groups) {
    const valid: number[] = [];
    for (let t = 0; t < n; t++) if (!Number.isNaN(out[t][a * 3])) valid.push(t);
    if (valid.length === 0) continue;
    for (let k = 0; k + 1 < valid.length; k++) {
      const i0 = valid[k], i1 = valid[k + 1];
      const gap = i1 - i0 - 1;
      if (gap > 0 && (maxGap === null || gap <= maxGap)) {
        for (let g = 1; g <= gap; g++) {
          const w = g / (gap + 1);
          for (let j = a * 3; j < b * 3; j++) {
            out[i0 + g][j] = out[i0][j] * (1 - w) + out[i1][j] * w;
          }
        }
      }
    }
    if (maxGap === null) {
      for (let t = 0; t < valid[0]; t++) for (let j = a * 3; j < b * 3; j++) out[t][j] = out[valid[0]][j];
      const last = valid[valid.length - 1];
      for (let t = last + 1; t < n; t++) for (let j = a * 3; j < b * 3; j++) out[t][j] = out[last][j];
    }
  }
  return out;
}

function median(v: number[]): number {
  const s = v.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type BodyRef = { cx: Float64Array; cy: Float64Array; s: number };

function bodyRef(seq: RawFrame[]): BodyRef {
  const n = seq.length;
  const cx = new Float64Array(n), cy = new Float64Array(n);
  const ws: number[] = [];
  const okIdx: number[] = [];
  for (let t = 0; t < n; t++) {
    const f = seq[t];
    const lx = f[11 * 3], ly = f[11 * 3 + 1], rx = f[12 * 3], ry = f[12 * 3 + 1];
    cx[t] = (lx + rx) / 2;
    cy[t] = (ly + ry) / 2;
    const w = Math.hypot(lx - rx, ly - ry);
    if (Number.isFinite(w) && w > 1e-4) { ws.push(w); okIdx.push(t); }
  }
  if (ws.length > 0) {
    const s = Math.fround(median(ws));
    const mx = Math.fround(median(okIdx.map(t => cx[t])));
    const my = Math.fround(median(okIdx.map(t => cy[t])));
    for (let t = 0; t < n; t++) {
      cx[t] = Number.isNaN(cx[t]) ? mx : Math.fround(cx[t]);
      cy[t] = Number.isNaN(cy[t]) ? my : Math.fround(cy[t]);
    }
    return { cx, cy, s };
  }
  // fallback: no valid shoulders in the whole segment
  let sx = 0, sy = 0, cnt = 0;
  for (const f of seq) {
    for (let p = 0; p < N_POINTS; p++) {
      const x = f[p * 3], y = f[p * 3 + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) { sx += x; sy += y; cnt++; }
    }
  }
  const mx = cnt ? sx / cnt : 0, my = cnt ? sy / cnt : 0;
  cx.fill(Math.fround(mx));
  cy.fill(Math.fround(my));
  return { cx, cy, s: 0.3 };
}

export function isActiveFrame(fr: RawFrame, cy: number, s: number, restY = REST_Y): boolean {
  for (const off of [L_OFF, R_OFF]) {
    const wy = fr[off * 3 + 1];
    if (Number.isFinite(wy) && (wy - cy) / s < restY) return true;
  }
  return false;
}

function trimActive(raw: RawFrame[], restY = REST_Y, pad = 3): RawFrame[] {
  const { cy, s } = bodyRef(raw);
  let first = -1, last = -1, count = 0;
  for (let t = 0; t < raw.length; t++) {
    if (isActiveFrame(raw[t], cy[t], s, restY)) {
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  if (count < 4) return raw;
  return raw.slice(Math.max(0, first - pad), Math.min(raw.length, last + pad + 1));
}

function resample(seq: RawFrame[], T = T_FRAMES): RawFrame[] {
  const n = seq.length;
  if (n === 1) return Array.from({ length: T }, () => seq[0].slice());
  const out: RawFrame[] = [];
  for (let k = 0; k < T; k++) {
    const pos = Math.min(Math.max((k * (n - 1)) / (T - 1), 0), n - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, n - 1);
    const w = pos - i0;
    const a = seq[i0], b = seq[i1];
    const f = new Float32Array(FRAME_LEN);
    for (let j = 0; j < FRAME_LEN; j++) {
      const v = a[j] * (1 - w) + b[j] * w;
      f[j] = Number.isNaN(v) ? (Number.isNaN(a[j]) ? b[j] : a[j]) : v;
    }
    out.push(f);
  }
  return out;
}

// ============================================================================
// 3. Features (spec 6.6)
// ============================================================================
const SHAPE_TIPS = [0, 4, 8, 12, 16, 20];
const KEY_PTS = [0, 4, 8, 12];
const VEL_SCALE = T_FRAMES / 10.0; // 4.0

/** seq: T frames -> Float32Array(T * 272), row-major. */
function computeFeatures(seq: RawFrame[]): Float32Array {
  const T = seq.length;
  const { cx, cy, s } = bodyRef(seq);
  const out = new Float32Array(T * FEATURE_DIM);

  // normalised xy for every point of every frame
  const xy = seq.map((f, t) => {
    const a = new Float64Array(N_POINTS * 2);
    for (let p = 0; p < N_POINTS; p++) {
      a[p * 2] = (f[p * 3] - cx[t]) / s;
      a[p * 2 + 1] = (f[p * 3 + 1] - cy[t]) / s;
    }
    return a;
  });

  for (let t = 0; t < T; t++) {
    const f = seq[t];
    const n = xy[t];
    const o = t * FEATURE_DIM;

    // pose block (34)
    for (let i = 0; i < POSE_N * 2; i++) out[o + i] = n[i];

    // face anchors
    const ex = (n[2 * 2] + n[5 * 2]) / 2, ey = (n[2 * 2 + 1] + n[5 * 2 + 1]) / 2;
    const mx = (n[9 * 2] + n[10 * 2]) / 2, my = (n[9 * 2 + 1] + n[10 * 2 + 1]) / 2;
    const anchors: [number, number][] = [
      [n[0], n[1]],
      [mx, my],
      [ex + (ex - mx) * 1.2, ey + (ey - my) * 1.2],
      [mx + (mx - ex) * 1.0, my + (my - ey) * 1.0],
      [n[7 * 2], n[7 * 2 + 1]],
      [n[8 * 2], n[8 * 2 + 1]],
      [n[11 * 2], n[11 * 2 + 1]],
      [n[12 * 2], n[12 * 2 + 1]],
    ];

    [L_OFF, R_OFF].forEach((off, hi) => {
      const base = o + 34 + hi * 117;
      const present = !Number.isNaN(f[off * 3]);
      if (!present) return; // block stays 0
      // shape (60): un-normalised 3D, wrist-relative, scaled by palm size (wrist -> point 9, xy)
      const wx = f[off * 3], wy = f[off * 3 + 1], wz = f[off * 3 + 2];
      const palm = Math.max(Math.hypot(f[(off + 9) * 3] - wx, f[(off + 9) * 3 + 1] - wy), 1e-6);
      for (let j = 1; j < HAND_N; j++) {
        const q = (off + j) * 3;
        out[base + (j - 1) * 3] = (f[q] - wx) / palm;
        out[base + (j - 1) * 3 + 1] = (f[q + 1] - wy) / palm;
        out[base + (j - 1) * 3 + 2] = (f[q + 2] - wz) / palm;
      }
      // location (12) + velocity (12)
      SHAPE_TIPS.forEach((tip, k) => {
        const px = n[(off + tip) * 2], py = n[(off + tip) * 2 + 1];
        out[base + 60 + k * 2] = px;
        out[base + 60 + k * 2 + 1] = py;
        if (t > 0) {
          const pv = xy[t - 1];
          out[base + 104 + k * 2] = (px - pv[(off + tip) * 2]) * VEL_SCALE;
          out[base + 104 + k * 2 + 1] = (py - pv[(off + tip) * 2 + 1]) * VEL_SCALE;
        } // t = 0: velocity is 0
      });
      // distances (32): key points (outer) x anchors (inner)
      KEY_PTS.forEach((kp, ki) => {
        const px = n[(off + kp) * 2], py = n[(off + kp) * 2 + 1];
        for (let a = 0; a < 8; a++) {
          out[base + 72 + ki * 8 + a] = Math.hypot(px - anchors[a][0], py - anchors[a][1]);
        }
      });
      out[base + 116] = 1;
    });

    // two-hand relation (4): (R - L) wrist xy, (R - L) index-tip xy
    out[o + 268] = n[R_OFF * 2] - n[L_OFF * 2];
    out[o + 269] = n[R_OFF * 2 + 1] - n[L_OFF * 2 + 1];
    out[o + 270] = n[(R_OFF + 8) * 2] - n[(L_OFF + 8) * 2];
    out[o + 271] = n[(R_OFF + 8) * 2 + 1] - n[(L_OFF + 8) * 2 + 1];
  }

  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) out[i] = 0;
  return out;
}

/** Spec section 6: segment (n frames) -> Float32Array(40 * 272), ready for the model. */
export function preprocess(segment: RawFrame[], restY = REST_Y): Float32Array {
  let raw = fillGaps(segment, null, POSE_GROUP); // 6.1 pose: fill everything
  raw = trimActive(raw, restY); // 6.3
  raw = fillGaps(raw, 6, HAND_GROUPS); // 6.4 hands: short dropouts only
  return computeFeatures(resample(raw, T_FRAMES)); // 6.5 + 6.6
}

// ============================================================================
// 7. Decision rule
// ============================================================================
export type Decision =
  | { kind: 'sign'; label: string; confidence: number; margin: number }
  | { kind: 'unsure'; top: { label: string; p: number }[] }
  | { kind: 'other' };

export function decide(probs: ArrayLike<number>, labels: string[]): Decision {
  const ranked = Array.from(probs, (p, i) => ({ i, p })).sort((a, b) => b.p - a.p);
  const top = ranked.slice(0, 3).map(r => ({ label: labels[r.i] ?? `Class_${r.i}`, p: r.p }));
  const p1 = ranked[0].p;
  const p2 = ranked[1]?.p ?? 0;
  const l1 = labels[ranked[0].i];
  if (l1 === 'OTHER') return { kind: 'other' };
  if (p1 >= MIN_CONF && p1 - p2 >= MIN_MARGIN) {
    return { kind: 'sign', label: l1, confidence: p1, margin: p1 - p2 };
  }
  return { kind: 'unsure', top };
}

// ============================================================================
// 5. Sign segmentation (live capture)
// ============================================================================
const PREROLL = 6;
const START_FRAMES = 2;
const MAX_SEG_SEC = 6;
const MIN_SEG_SEC = 0.3;
const END_SEC = 0.45;

export type SegState = 'idle' | 'recording';
export type SegmentEvent =
  | { type: 'none' }
  | { type: 'started' }
  | { type: 'segment'; frames: RawFrame[] }
  | { type: 'discarded' }; // ended but shorter than 0.3 s

export class SignSegmenter {
  state: SegState = 'idle';
  fps = 15;
  private refC: [number, number] | null = null;
  private refS = 0;
  private lastTs: number | null = null;
  private preroll: RawFrame[] = [];
  private seg: RawFrame[] = [];
  private activeRun = 0;
  private inactiveRun = 0;
  private segStartTs = 0;

  reset() {
    this.state = 'idle';
    this.refC = null;
    this.refS = 0;
    this.lastTs = null;
    this.preroll = [];
    this.seg = [];
    this.activeRun = 0;
    this.inactiveRun = 0;
  }

  /** ms since the current sign started (0 while idle) */
  get recordingMs(): number {
    return this.state === 'recording' && this.lastTs !== null ? this.lastTs - this.segStartTs : 0;
  }
  get segmentLength(): number {
    return this.seg.length;
  }
  get maxMs(): number {
    return MAX_SEG_SEC * 1000;
  }

  private isActive(f: RawFrame): boolean {
    let anyHand = false;
    for (const off of [L_OFF, R_OFF]) {
      const wy = f[off * 3 + 1];
      if (Number.isNaN(f[off * 3])) continue;
      anyHand = true;
      if (this.refC && (wy - this.refC[1]) / this.refS < REST_Y) return true;
    }
    return this.refC ? false : anyHand; // no body reference yet: any hand counts
  }

  push(f: RawFrame, tsMs: number): SegmentEvent {
    // fps estimate (EMA)
    if (this.lastTs !== null) {
      const dt = (tsMs - this.lastTs) / 1000;
      if (dt > 0 && dt < 1) this.fps = 0.9 * this.fps + 0.1 / dt;
    }
    this.lastTs = tsMs;

    // smoothed body reference (5.1)
    const lx = f[11 * 3], ly = f[11 * 3 + 1], rx = f[12 * 3], ry = f[12 * 3 + 1];
    if ([lx, ly, rx, ry].every(Number.isFinite)) {
      const s = Math.hypot(lx - rx, ly - ry);
      if (s > 0.001) {
        const c: [number, number] = [(lx + rx) / 2, (ly + ry) / 2];
        if (!this.refC) { this.refC = c; this.refS = s; }
        else {
          this.refC = [0.8 * this.refC[0] + 0.2 * c[0], 0.8 * this.refC[1] + 0.2 * c[1]];
          this.refS = 0.8 * this.refS + 0.2 * s;
        }
      }
    }
    const active = this.isActive(f);

    if (this.state === 'idle') {
      this.preroll.push(f);
      if (this.preroll.length > PREROLL) this.preroll.shift();
      this.activeRun = active ? this.activeRun + 1 : 0;
      if (this.activeRun >= START_FRAMES) {
        this.seg = this.preroll.slice();
        this.preroll = [];
        this.state = 'recording';
        this.inactiveRun = 0;
        this.activeRun = 0;
        this.segStartTs = tsMs - (this.seg.length / this.fps) * 1000;
        return { type: 'started' };
      }
      return { type: 'none' };
    }

    // recording
    this.seg.push(f);
    this.inactiveRun = active ? 0 : this.inactiveRun + 1;
    const endGap = Math.max(4, Math.floor(END_SEC * this.fps));
    if (this.inactiveRun >= endGap || this.seg.length > MAX_SEG_SEC * this.fps) {
      const frames = this.seg;
      this.seg = [];
      this.preroll = [];
      this.activeRun = 0;
      this.inactiveRun = 0;
      this.state = 'idle';
      if (frames.length / this.fps < MIN_SEG_SEC) return { type: 'discarded' };
      return { type: 'segment', frames };
    }
    return { type: 'none' };
  }
}
