// Finds the photo window inside a slide mount.
// Used by the build (on every scan) and by the page (as a fallback).
//
// How: the mount is one even paper colour. The window's four edges are long straight lines
// where the paper stops and the photo starts. Each edge is found by scoring every possible
// line for how much of it is a paper→photo change, and taking the outermost strong one —
// so pale or white areas inside the photo (skin, sky, a white wall) can't fool it, and
// neither can the printing on the mount.
//
// data: RGBA (4 channels) or RGB (3 channels) pixels, w × h.  Returns [x, y, width, height]
// as fractions of the image, or null if no believable window is found.
export function findWindow(data, w, h, channels = 4) {
  const n = w * h;
  const at = (x, y) => (y * w + x) * channels;
  const opaque = (i) => channels < 4 || data[i + 3] > 200;

  // 1. the paper colour: per-channel median of the outer band (printing is a minority there)
  const samp = [[], [], []];
  const take = (x, y) => { const i = at(x, y); if (opaque(i)) for (let c = 0; c < 3; c++) samp[c].push(data[i + c]); };
  const step = Math.max(1, Math.round(Math.min(w, h) / 200));
  for (let y = Math.round(h * 0.03); y < h * 0.97; y += step) {
    for (let x = Math.round(w * 0.02); x < w * 0.12; x += step) { take(x, y); take(w - 1 - x, y); }
  }
  for (let x = Math.round(w * 0.12); x < w * 0.88; x += step) {
    for (let y = Math.round(h * 0.02); y < h * 0.1; y += step) { take(x, y); take(x, h - 1 - y); }
  }
  if (samp[0].length < 50) return null;
  const paper = samp.map((v) => { v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; });

  // 2. paper / not paper, for every pixel
  const TOL = 30;
  const isPaper = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * channels;
    if (!opaque(i)) { isPaper[p] = 1; continue; }
    const d = Math.max(Math.abs(data[i] - paper[0]), Math.abs(data[i + 1] - paper[1]), Math.abs(data[i + 2] - paper[2]));
    isPaper[p] = d <= TOL ? 1 : 0;
  }
  const P = (x, y) => isPaper[y * w + x] === 1;

  // 3. score each candidate edge line: the share of it that is one long unbroken paper→photo
  //    change (paper 2–4px outside, photo or the slide's thin dark rim right on the line).
  //    Only stretches longer than 6% of the line count, so the printed letters don't.
  const runScore = (len, hit) => {
    const minRun = Math.max(6, Math.round(len * 0.06));
    let total = 0, run = 0, miss = 0;
    for (let k = 0; k < len; k++) {
      if (hit(k)) { run += 1 + miss; miss = 0; }
      else if (run && miss < 2) miss++;
      else { if (run >= minRun) total += run; run = 0; miss = 0; }
    }
    if (run >= minRun) total += run;
    return total / len;
  };
  const scoreV = (x, dir, y0, y1) =>       // vertical line at x, paper towards x + dir*k
    runScore(y1 - y0, (k) => { const y = y0 + k; return P(x + dir * 2, y) && P(x + dir * 3, y) && P(x + dir * 4, y) && (!P(x, y) || !P(x - dir, y)); });
  const scoreH = (y, dir, x0, x1) =>
    runScore(x1 - x0, (k) => { const x = x0 + k; return P(x, y + dir * 2) && P(x, y + dir * 3) && P(x, y + dir * 4) && (!P(x, y) || !P(x, y - dir)); });
  // the outermost line whose score is at least 60% of the best one
  const pick = (from, to, score) => {
    const dirn = to > from ? 1 : -1, scores = [];
    let best = 0;
    for (let k = from; k !== to; k += dirn) { const s = score(k); scores.push([k, s]); if (s > best) best = s; }
    if (best < 0.25) return -1;
    for (const [k, s] of scores) if (s >= best * 0.6) return k;
    return -1;
  };

  // left and right edges, measured over the middle band of rows
  const ry0 = Math.round(h * 0.3), ry1 = Math.round(h * 0.7);
  const L = pick(5, Math.round(w * 0.5), (x) => scoreV(x, -1, ry0, ry1));
  const R = pick(w - 6, Math.round(w * 0.5), (x) => scoreV(x, 1, ry0, ry1));
  if (L < 0 || R < 0 || R - L < w * 0.2) return null;
  // top and bottom edges, measured between the side edges (clear of the rounded corners)
  const m = Math.round((R - L) * 0.06), cx0 = L + m, cx1 = R - m;
  const T = pick(5, Math.round(h * 0.5), (y) => scoreH(y, -1, cx0, cx1));
  const B = pick(h - 6, Math.round(h * 0.5), (y) => scoreH(y, 1, cx0, cx1));
  if (T < 0 || B < 0 || B - T < h * 0.15) return null;

  const x0 = L / w, y0 = T / h, ww = (R + 1 - L) / w, hh = (B + 1 - T) / h;
  const asp = (ww * w) / (hh * h);
  if (ww < 0.25 || hh < 0.15 || asp < 0.45 || asp > 2.4) return null;
  // pull in a hair so no paper shows at the edges
  const ix = 0.005, iy = 0.005;
  return [x0 + ix, y0 + iy, ww - 2 * ix, hh - 2 * iy];
}
