import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════
// Nothing to edit here. Slides come from the "slides" folder and settings from
// settings.json — the build turns both into slides.json, which this page reads.
// ═══════════════════════════════════════════════════════════

type Settings = {
  title: string; slideSeconds: number; transition: "cut" | "dissolve"; beam: number;
  sounds: { advance: string; hum: string };
  wallPhoto: string;
  musicVolume: number; musicAutoplay: boolean; musicShuffle: boolean;
};
type Track = { src: string; title: string };
const DEFAULT_SETTINGS: Settings = {
  title: "YOURS & OWLS 2026", slideSeconds: 4, transition: "cut", beam: 1, sounds: { advance: "", hum: "" }, wallPhoto: "",
  musicVolume: 0.6, musicAutoplay: true, musicShuffle: false,
};
// Used when a slide's photo window can't be found automatically (measured from a Kodachrome card mount)
const DEFAULT_WINDOW: [number, number, number, number] = [0.161, 0.269, 0.673, 0.448];

type Win = [number, number, number, number];
type Photo = { id: number; file: string; slug: string; full: string; screen: string; small: string; tags: string[]; caption: string; window?: Win };
type SlideEntry = { file: string; slug: string; full: string; screen: string; small: string; tags: string[]; caption: string; window?: Win };
type Meta = { src: string; w: number; h: number; win: Win } | "error" | undefined;

// Load with CORS first (needed for downloads); fall back to a plain load so it still displays
function loadImg(src: string): Promise<{ img: HTMLImageElement; cors: boolean }> {
  const attempt = (cors: boolean) =>
    new Promise<{ img: HTMLImageElement; cors: boolean }>((res, rej) => {
      const i = new Image();
      if (cors) i.crossOrigin = "anonymous";
      i.onload = () => res({ img: i, cors });
      i.onerror = rej;
      i.src = src;
    });
  return attempt(true).catch(() => attempt(false));
}

// Finds the photo window inside a slide mount: the big region that isn't mount-coloured.
function detectWindow(img: HTMLImageElement): Win | null {
  try {
    const S = 320, sc = S / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(40, Math.round(img.naturalWidth * sc)), h = Math.max(40, Math.round(img.naturalHeight * sc));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h), sat = new Float32Array(w * h), alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      lum[i] = (r + gg + b) / 3; sat[i] = Math.max(r, gg, b) - Math.min(r, gg, b); alpha[i] = d[i * 4 + 3];
    }
    const ring: number[] = [];
    for (let y = Math.round(h * 0.05); y < h * 0.12; y++) for (let x = Math.round(w * 0.2); x < w * 0.8; x += 2) {
      for (const yy of [y, h - 1 - y]) { const i = yy * w + x; if (alpha[i] > 200) ring.push(lum[i]); }
    }
    if (ring.length < 40) return null;
    ring.sort((a, b) => a - b);
    const mL = ring[Math.floor(ring.length / 2)];
    const isMount = (i: number) => alpha[i] < 200 || (Math.abs(lum[i] - mL) < 38 && sat[i] < 60);
    const longest = (len: number, get: (k: number) => boolean) => {
      const gap = Math.max(2, Math.round(len * 0.03));
      let best: [number, number] = [0, -1], start = -1, last = -1;
      for (let k = 0; k < len; k++) {
        if (get(k)) continue;
        if (start < 0 || k - last - 1 > gap) start = k;
        last = k;
        if (last - start > best[1] - best[0]) best = [start, last];
      }
      return best;
    };
    const med = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const L: number[] = [], R: number[] = [], T: number[] = [], B: number[] = [];
    for (let y = Math.round(h * 0.36); y < h * 0.64; y += 2) {
      const [a, b] = longest(w, (x) => isMount(y * w + x)); if (b > a) { L.push(a); R.push(b); }
    }
    for (let x = Math.round(w * 0.36); x < w * 0.64; x += 2) {
      const [a, b] = longest(h, (y) => isMount(y * w + x)); if (b > a) { T.push(a); B.push(b); }
    }
    if (L.length < 5 || T.length < 5) return null;
    const x0 = med(L) / w, x1 = (med(R) + 1) / w, y0 = med(T) / h, y1 = (med(B) + 1) / h;
    const ww = x1 - x0, hh = y1 - y0, asp = (ww * w) / (hh * h);
    if (ww < 0.3 || hh < 0.2 || x0 < 0.02 || y0 < 0.02 || x1 > 0.98 || y1 > 0.98 || asp < 0.45 || asp > 2.3) return null;
    return [x0 + 0.006, y0 + 0.006, ww - 0.012, hh - 0.012];
  } catch (e) {
    return null;
  }
}

// Baseline uncompressed RGB TIFF
function encodeTIFF(rgba: Uint8ClampedArray, width: number, height: number) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  const N = 11, HDR = 8, IFD = 2 + N * 12 + 4, BPS = HDR + IFD, XRES = BPS + 6, YRES = XRES + 8, IMG = YRES + 8;
  const buf = new ArrayBuffer(IMG + rgb.byteLength);
  const v = new DataView(buf);
  v.setUint16(0, 0x4949, true); v.setUint16(2, 42, true); v.setUint32(4, HDR, true);
  let p = HDR;
  v.setUint16(p, N, true); p += 2;
  const ifd = (tag: number, type: number, count: number, val: number) => {
    v.setUint16(p, tag, true); v.setUint16(p + 2, type, true);
    v.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(p + 8, val, true); else v.setUint32(p + 8, val, true);
    p += 12;
  };
  ifd(256, 4, 1, width); ifd(257, 4, 1, height); ifd(258, 3, 3, BPS);
  ifd(259, 3, 1, 1); ifd(262, 3, 1, 2); ifd(273, 4, 1, IMG);
  ifd(277, 3, 1, 3); ifd(278, 4, 1, height); ifd(279, 4, 1, rgb.byteLength);
  ifd(282, 5, 1, XRES); ifd(283, 5, 1, YRES);
  v.setUint32(p, 0, true);
  v.setUint16(BPS, 8, true); v.setUint16(BPS + 2, 8, true); v.setUint16(BPS + 4, 8, true);
  v.setUint32(XRES, 72, true); v.setUint32(XRES + 4, 1, true);
  v.setUint32(YRES, 72, true); v.setUint32(YRES + 4, 1, true);
  new Uint8Array(buf, IMG).set(rgb);
  return new Blob([buf], { type: "image/tiff" });
}

// fine fabric texture for the projector screen
const GRAIN = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
})();

// uneven painted plaster, for the wall
const PLASTER = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='520'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.016' numOctaves='4' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.86  0 0 0 0 0.82  0 0 0 0 0.75  0 0 0 0.9 0.05'/><feComponentTransfer><feFuncA type='linear' slope='0.55' intercept='0.45'/></feComponentTransfer></filter><rect width='100%' height='100%' fill='#c9c2b5'/><rect width='100%' height='100%' filter='url(#p)'/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
})();

// Repeatable "random" numbers, so each slide always sits in the gate the same slightly-off way
function rand(seed: number, salt: number) {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
type Quirks = { rot: number; dx: number; dy: number; soft: boolean; specks: { x: number; y: number; r: number; o: number }[]; hair: null | { x: number; y: number; len: number; rot: number } };
function quirksFor(id: number): Quirks {
  const specks = Array.from({ length: Math.floor(rand(id, 6) * 4) }, (_, k) => ({
    x: 0.08 + rand(id, 10 + k) * 0.84, y: 0.08 + rand(id, 20 + k) * 0.84, r: 1 + rand(id, 30 + k) * 2.4, o: 0.35 + rand(id, 40 + k) * 0.4,
  }));
  return {
    rot: (rand(id, 1) - 0.5) * 1.1,          // degrees: not quite square in the gate
    dx: (rand(id, 2) - 0.5) * 0.014,         // fraction of the picture's width
    dy: (rand(id, 3) - 0.5) * 0.012,
    soft: id > 0 && rand(id, 4) < 0.16,                // now and then a slide pops and needs refocusing
    specks,
    hair: rand(id, 5) < 0.12 ? { x: 0.1 + rand(id, 51) * 0.8, y: 0.1 + rand(id, 52) * 0.8, len: 0.06 + rand(id, 53) * 0.08, rot: rand(id, 54) * 180 } : null,
  };
}
// dust that lives in the projector itself, so it stays put from slide to slide
const GATE_DUST = [{ x: 0.83, y: 0.21, r: 1.6, o: 0.45 }, { x: 0.12, y: 0.77, r: 2.2, o: 0.35 }];

const MOTES = Array.from({ length: 22 }, (_, i) => ({
  x: rand(i, 70), y: rand(i, 71), r: 0.5 + rand(i, 72) * 1.1, d: 9 + rand(i, 73) * 9, delay: -rand(i, 74) * 12,
}));

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════
export default function YoursAndOwlsSlideshow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<{ settings: Settings; photos: Photo[]; music: Track[] } | null>(null);
  const [dataError, setDataError] = useState("");
  useEffect(() => {
    fetch("slides.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j: { settings?: Partial<Settings>; slides?: SlideEntry[]; music?: Track[] }) => {
        const settings = { ...DEFAULT_SETTINGS, ...(j.settings || {}), sounds: { ...DEFAULT_SETTINGS.sounds, ...((j.settings && j.settings.sounds) || {}) } };
        let music = (j.music || []).slice();
        if (settings.musicShuffle) for (let i = music.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [music[i], music[k]] = [music[k], music[i]]; }
        setData({ settings, photos: (j.slides || []).map((e, id) => ({ ...e, id })), music });
      })
      .catch(() => setDataError("Couldn't load slides.json"));
  }, []);
  const settings = data ? data.settings : DEFAULT_SETTINGS;
  const photos = useMemo(() => (data ? data.photos : []), [data]);
  const [meta, setMeta] = useState<Record<number, Meta>>({});
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const cache = useRef(new Map<string, { img: HTMLImageElement; cors: boolean }>());

  const [size, setSize] = useState({ w: 1280, h: 800 });
  const [touch, setTouch] = useState(false);
  const [navH, setNavH] = useState(90);

  const [filters, setFilters] = useState<string[]>([]);
  const [curIdx, setCurIdx] = useState(0);
  const [shownId, setShownId] = useState<number | null>(null);
  const [prevId, setPrevId] = useState<number | null>(null);     // the outgoing slide during a dissolve
  const [dissolveKey, setDissolveKey] = useState(0);
  const [lit, setLit] = useState(false);
  const [mode, setMode] = useState<"cut" | "dissolve">("cut");
  useEffect(() => { if (data) setMode(data.settings.transition === "dissolve" ? "dissolve" : "cut"); }, [data]);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState(false);
  const [tray, setTray] = useState(false);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(true);
  soundRef.current = soundOn;

  const [loading, setLoading] = useState<"on" | "fading" | "off">("on");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [flip, setFlip] = useState<string | null>(null);
  const [toast, setToast] = useState({ msg: "", show: false });
  const toastTimer = useRef<any>(null);

  const busy = useRef(false);
  const timers = useRef<any[]>([]);
  const pending = useRef<0 | 1 | -1>(0);

  const compact = touch || size.w < 900;

  // ─── sound: a projector somewhere behind you ───────────
  const actx = useRef<AudioContext | null>(null);
  const hum = useRef<{ g: GainNode } | null>(null);
  const realSounds = useRef<{ advance?: AudioBuffer; hum?: AudioBuffer }>({});
  const ctx = () => {
    if (!actx.current) actx.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    if (actx.current!.state === "suspended") actx.current!.resume();
    return actx.current!;
  };
  const loadReal = (key: "advance" | "hum") => {
    const url = settings.sounds[key];
    if (!url || realSounds.current[key]) return Promise.resolve();
    return fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx().decodeAudioData(b))
      .then((buf) => { realSounds.current[key] = buf; }).catch(() => {});
  };
  const playBuffer = (buf: AudioBuffer, gain: number) => {
    try {
      const c = ctx(), s = c.createBufferSource(), g = c.createGain();
      s.buffer = buf; g.gain.value = gain; s.connect(g); g.connect(c.destination); s.start();
    } catch (e) {}
  };
  const noise = (len: number, gain: number, freq: number, q: number, pow = 4, at = 0) => {
    if (!soundRef.current) return;
    try {
      const c = ctx(), now = c.currentTime + at;
      const n = Math.floor(c.sampleRate * len);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, pow);
      const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
      src.buffer = buf; g.gain.setValueAtTime(gain, now);
      src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(now);
    } catch (e) {}
  };
  const tone = (from: number, to: number, dur: number, gain: number, at = 0) => {
    if (!soundRef.current) return;
    try {
      const c = ctx(), now = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(from, now);
      o.frequency.exponentialRampToValueAtTime(to, now + dur * 0.7);
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + dur + 0.01);
    } catch (e) {}
  };
  const playTap = () => noise(0.012, 0.22, 1800, 1.5);
  const playShutter = () => { if (!realSounds.current.advance) noise(0.02, 0.22, 1500, 1, 3); };
  const playClunk = (quiet = 1) => {
    if (!soundRef.current) return;
    if (realSounds.current.advance) { playBuffer(realSounds.current.advance, 0.9 * quiet); return; }
    noise(0.012, 0.24 * quiet, 2600, 2); tone(120, 55, 0.14, 0.28 * quiet, 0.03); noise(0.03, 0.28 * quiet, 900, 0.9, 3, 0.03);
  };
  const playLamp = () => { if (!realSounds.current.advance) noise(0.015, 0.14, 3000, 1.5); };
  const startHum = () => {
    if (hum.current || !soundRef.current) return;
    try {
      const c = ctx();
      const g = c.createGain(); g.gain.value = 0; g.connect(c.destination);
      const begin = (buf: AudioBuffer, level: number) => {
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        if (realSounds.current.hum) src.connect(g);
        else { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; src.connect(lp); lp.connect(g); }
        src.start(); g.gain.linearRampToValueAtTime(level, c.currentTime + 1.2);
      };
      hum.current = { g };
      loadReal("advance");
      loadReal("hum").then(() => {
        if (realSounds.current.hum) { begin(realSounds.current.hum, soundRef.current ? 0.35 : 0); return; }
        const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
        begin(buf, soundRef.current ? 0.05 : 0);
      });
    } catch (e) {}
  };
  useEffect(() => {
    const go = () => startHum();
    window.addEventListener("pointerdown", go); window.addEventListener("keydown", go);
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  });
  useEffect(() => {
    const h = hum.current, c = actx.current;
    if (h && c) h.g.gain.linearRampToValueAtTime(soundOn ? (realSounds.current.hum ? 0.35 : 0.05) : 0, c.currentTime + 0.3);
  }, [soundOn]);

  // ─── music: the tracks in the "music" folder, played in a loop ───
  const music = data ? data.music : [];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [trackIdx, setTrackIdx] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const musicWanted = useRef(false);      // the visitor wants music on (survives track changes)
  const musicStarted = useRef(false);
  const fadeTimer = useRef<any>(null);
  const musicVol = () => Math.max(0, Math.min(1, settings.musicVolume));
  const fadeTo = (target: number, ms: number, done?: () => void) => {
    const a = audioRef.current; if (!a) return;
    clearInterval(fadeTimer.current);
    const start = a.volume, t0 = performance.now();
    fadeTimer.current = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = start + (target - start) * k;
      if (k >= 1) { clearInterval(fadeTimer.current); done && done(); }
    }, 30);
  };
  const ensureAudio = () => {
    if (!audioRef.current) {
      const a = new Audio(); a.preload = "auto"; a.volume = 0;
      a.addEventListener("ended", () => setTrackIdx((i) => (i + 1) % Math.max(1, musicRef.current.length)));
      a.addEventListener("play", () => setMusicPlaying(true));
      a.addEventListener("pause", () => setMusicPlaying(false));
      a.addEventListener("error", () => { if (musicRef.current.length > 1) setTrackIdx((i) => (i + 1) % musicRef.current.length); });
      audioRef.current = a;
    }
    return audioRef.current;
  };
  const musicRef = useRef<Track[]>([]);
  musicRef.current = music;
  const playMusic = () => {
    if (!music.length) return;
    const a = ensureAudio();
    musicWanted.current = true; musicStarted.current = true;
    if (!a.src) a.src = music[trackIdx % music.length].src;
    a.muted = !soundRef.current;
    const p = a.play();
    if (p && p.catch) p.catch(() => { musicWanted.current = false; });
    fadeTo(musicVol(), 1200);
  };
  const pauseMusic = () => {
    musicWanted.current = false;
    fadeTo(0, 500, () => audioRef.current && audioRef.current.pause());
  };
  const toggleMusic = () => { if (musicPlaying) pauseMusic(); else playMusic(); };
  const nextTrack = () => { if (music.length > 1) { musicWanted.current = true; setTrackIdx((i) => (i + 1) % music.length); } };
  // a new track: load it, keep playing if music is on
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !music.length) return;
    a.src = music[trackIdx % music.length].src;
    if (musicWanted.current) { a.volume = 0; a.play().catch(() => {}); fadeTo(musicVol(), 900); }
    try {
      const ms = (navigator as any).mediaSession;
      if (ms && (window as any).MediaMetadata) {
        ms.metadata = new (window as any).MediaMetadata({ title: music[trackIdx % music.length].title, artist: settings.title });
        ms.setActionHandler("nexttrack", () => nextTrack());
      }
    } catch (e) {}
  }, [trackIdx, music]);
  // browsers only allow sound after the visitor does something, so music starts on their first tap or key
  useEffect(() => {
    if (!music.length || !settings.musicAutoplay) return;
    const go = () => { if (!musicStarted.current && soundRef.current) playMusic(); };
    window.addEventListener("pointerdown", go); window.addEventListener("keydown", go);
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  });
  // the speaker button mutes everything, music included
  useEffect(() => { if (audioRef.current) audioRef.current.muted = !soundOn; }, [soundOn]);
  useEffect(() => () => { clearInterval(fadeTimer.current); if (audioRef.current) audioRef.current.pause(); }, []);
  const trackTitle = music.length ? music[trackIdx % music.length].title : "";

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2500);
  };

  // ─── size + touch ─────────────────────────────────────
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setTouch(window.matchMedia("(hover: none), (pointer: coarse)").matches);
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ─── loading: the first few slides up front, then each one as it's needed ───
  const loaders = useRef(new Map<number, Promise<boolean>>());
  const loadPhoto = (p: Photo): Promise<boolean> => {
    const have = loaders.current.get(p.id);
    if (have) return have;
    const job = loadImg(p.screen).then((r) => {
      cache.current.set(p.screen, r);
      const win = p.window || (r.cors && detectWindow(r.img)) || DEFAULT_WINDOW;
      setMeta((m) => ({ ...m, [p.id]: { src: p.screen, w: r.img.naturalWidth, h: r.img.naturalHeight, win } }));
      return true;
    }).catch(() => {
      setMeta((m) => ({ ...m, [p.id]: "error" }));
      return false;
    });
    loaders.current.set(p.id, job);
    return job;
  };
  useEffect(() => {
    if (!data && !dataError) return;
    let flipIdx = 0, finished = false;
    const start = performance.now();
    const pool = photos.slice(0, 16).map((p) => p.small);
    const flipTimer = setInterval(() => { if (pool.length) setFlip(pool[flipIdx++ % pool.length]); }, 80);
    const finish = () => {
      if (finished) return;
      finished = true;
      const wait = Math.max(0, 2200 - (performance.now() - start));
      setTimeout(() => {
        clearInterval(flipTimer);
        setFlip(null);
        setLoading("fading");
        setTimeout(() => setLoading("off"), 750);
      }, wait);
    };
    const safety = setTimeout(finish, 9000);
    const first = photos.slice(0, Math.min(4, photos.length));
    let done = 0;
    setProgress({ done: 0, total: first.length });
    if (!first.length) finish();
    first.forEach((p) => loadPhoto(p).then(() => { done++; setProgress({ done, total: first.length }); if (done >= first.length) finish(); }));
    return () => { clearInterval(flipTimer); clearTimeout(safety); };
  }, [data, dataError]);

  // ─── filters ──────────────────────────────────────────
  const people = useMemo(
    () => [...new Set(photos.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b)),
    [photos]
  );
  const visible = useMemo(
    () => (filters.length ? photos.filter((p) => p.tags.some((t) => filters.includes(t))) : photos),
    [photos, filters]
  );
  const pillCols: string[][] = [];
  { const all = ["ALL", ...people]; for (let i = 0; i < all.length; i += 5) pillCols.push(all.slice(i, i + 5)); }

  // ─── changing slides ──────────────────────────────────
  // cut: lamp off, slide drops, lamp on.  dissolve: a second projector fades up over the first.
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const shownRef = useRef<number | null>(null);
  shownRef.current = shownId;
  const runChange = (targetId: number, intro = false) => {
    if (busy.current) return false;
    busy.current = true;
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const release = (ms: number) => at(ms, () => {
      busy.current = false;
      if (pending.current) { const d = pending.current; pending.current = 0; stepRef.current(d); }
    });
    if (mode === "dissolve" && !intro && shownRef.current !== null) {
      playClunk(0.55);
      setPrevId(shownRef.current); setShownId(targetId); setDissolveKey((k) => k + 1); setLit(true);
      at(1500, () => setPrevId(null));
      release(700);
      return true;
    }
    setPrevId(null);
    if (!intro) { playShutter(); setLit(false); }
    at(intro ? 120 : 240, () => playClunk());
    const on = intro ? 520 : 600;
    at(on, () => { setShownId(targetId); setLit(true); playLamp(); });
    release(on + 160);
    return true;
  };
  const firstLoaded = (list: Photo[]) => list.findIndex((p) => metaRef.current[p.id] !== "error");
  // get the next couple of slides ready in the background
  const prefetch = (j: number) => {
    const n = visible.length;
    for (const d of [1, 2, -1]) { const p = visible[(((j + d) % n) + n) % n]; if (p) loadPhoto(p); }
  };
  const showIdx = (j: number, intro = false) => {
    const p = visible[j];
    if (!p) return;
    busy.current = true;
    loadPhoto(p).then((ok) => {
      busy.current = false;
      if (!ok) { if (!intro) stepRef.current(1); return; }
      if (runChange(p.id, intro)) { setCurIdx(j); setContrast(100); setBrightness(100); prefetch(j); }
    });
  };
  const goTo = (j: number) => {
    if (!visible[j]) return;
    if (busy.current) { clearTimers(); busy.current = false; pending.current = 0; }
    showIdx(j);
  };
  const step = (dir: 1 | -1) => {
    const n = visible.length;
    if (!n) return;
    if (busy.current) { pending.current = dir; return; }
    for (let s = 1; s <= n; s++) {
      const j = (((curIdx + dir * s) % n) + n) % n;
      if (j === curIdx) return;
      if (metaRef.current[visible[j].id] !== "error") { showIdx(j); return; }
    }
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // first slide: the one in the link (…#slide-022), otherwise the first in the tray
  const introDone = useRef(false);
  useEffect(() => {
    if (loading !== "fading" || introDone.current || !visible.length) return;
    let i = -1;
    try {
      const h = decodeURIComponent(window.location.hash.replace(/^#slide-/, ""));
      if (h) i = visible.findIndex((p) => p.slug === h);
    } catch (e) {}
    if (i < 0) i = Math.max(0, firstLoaded(visible));
    introDone.current = true;
    showIdx(i, true);
  }, [loading]);

  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) { firstFilterRun.current = false; return; }
    if (!introDone.current) return;
    const i = firstLoaded(visible);
    if (i < 0) return;
    clearTimers(); busy.current = false; pending.current = 0;
    showIdx(i);
  }, [filters]);

  // keep the address bar pointing at the slide on screen, so it can be shared
  const slideLink = (id: number) => {
    const tag = "#slide-" + encodeURIComponent(photos[id].slug);
    try { return window.location.href.split("#")[0] + tag; } catch (e) { return tag; }
  };
  useEffect(() => {
    if (shownId === null) return;
    try { window.history.replaceState(null, "", "#slide-" + encodeURIComponent(photos[shownId].slug)); } catch (e) {}
  }, [shownId]);

  const toggleFilter = (name: string) => {
    if (name === "ALL") setFilters([]);
    else setFilters((f) => (f.includes(name) ? f.filter((x) => x !== name) : [...f, name]));
    playTap();
  };

  // slideshow (pauses while the preview or the tray view is open)
  useEffect(() => {
    if (!playing || preview || tray || shownId === null) return;
    const t = setTimeout(() => step(1), settings.slideSeconds * 1000 + (mode === "dissolve" ? 900 : 0));
    return () => clearTimeout(t);
  }, [playing, preview, tray, shownId, curIdx, visible, mode]);
  const togglePlay = () => { setPlaying((p) => !p); playTap(); };
  const toggleMode = () => { setMode((m) => (m === "cut" ? "dissolve" : "cut")); playTap(); };

  const openPreview = () => { if (shownId === null) return; setPreview(true); playTap(); };
  const closePreview = () => { setPreview(false); playTap(); };
  const openTray = () => { setTray(true); playTap(); };
  const closeTray = () => { setTray(false); playTap(); };
  const copyLink = () => {
    if (shownId === null) return;
    const url = slideLink(shownId);
    const done = () => showToast("Link copied ✓");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => showToast(url));
      else showToast(url);
    } catch (e) { showToast(url); }
  };
  const onPictureTap = () => { if (playing) { setPlaying(false); showToast("Slideshow paused"); } else step(1); };

  // keyboard
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (preview) { if (e.key === "Escape") closePreview(); return; }
      if (tray) { if (e.key === "Escape") closeTray(); return; }
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "d" || e.key === "D") openPreview();
      if (e.key === "v" || e.key === "V") openTray();
      if (e.key === "f" || e.key === "F") toggleMode();
      if (e.key === "m" || e.key === "M") toggleMusic();
      if (e.key === "n" || e.key === "N") nextTrack();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // swipe on phones
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (preview || tray || e.touches.length !== 1) return;
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current; swipe.current = null;
    if (!s || preview || tray) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) step(dx < 0 ? 1 : -1);
  };

  useEffect(() => () => clearTimers(), []);

  // ─── downloads: the whole slide, mount and all ─────────
  const shownPhoto = shownId === null ? null : photos[shownId];
  const shownMeta = shownId === null ? undefined : meta[shownId];
  const renderFull = (r: { img: HTMLImageElement }) => {
    const c = document.createElement("canvas");
    c.width = r.img.naturalWidth; c.height = r.img.naturalHeight;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(r.img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const k = contrast / 100, b = brightness / 100;
    if (k !== 1 || b !== 1) {
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = ((v / 255 - 0.5) * k + 0.5) * b * 255;
      const a = data.data;
      for (let i = 0; i < a.length; i += 4) { a[i] = lut[a[i]]; a[i + 1] = lut[a[i + 1]]; a[i + 2] = lut[a[i + 2]]; }
      g.putImageData(data, 0, 0);
    }
    return { canvas: c, data };
  };
  const save = (blob: Blob, name: string) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  };
  const download = (kind: "jpeg" | "tiff") => {
    if (!shownPhoto) return;
    const p = shownPhoto;
    const base = p.file.replace(/\.[^.]+$/, "");
    showToast("Getting the full-size scan…");
    const have = cache.current.get(p.full);
    (have ? Promise.resolve(have) : loadImg(p.full)).then((r) => {
      cache.current.set(p.full, r);
      if (!r.cors) { showToast("Couldn't read the scan"); return; }
      showToast(kind === "jpeg" ? "Saving…" : "Encoding TIFF…");
      setTimeout(() => {
        try {
          const { canvas, data } = renderFull(r);
          if (kind === "jpeg") canvas.toBlob((b) => { if (b) { save(b, base + ".jpg"); showToast("Downloaded ✓"); } }, "image/jpeg", 0.96);
          else { save(encodeTIFF(data.data, canvas.width, canvas.height), base + ".tif"); showToast("Downloaded ✓"); }
        } catch (e) { showToast("Couldn't read the scan"); }
      }, 40);
    }).catch(() => showToast("Couldn't load the full-size scan"));
  };

  // ─── layout: the picture, straight onto the wall ───────
  useLayoutEffect(() => { if (barRef.current) setNavH(barRef.current.offsetHeight); }, [size.w, compact, people.length]);
  const W = size.w, H = size.h;
  const CTRL_H = 120;
  const fx = compact ? 12 : 110, fw = W - fx * 2;
  const fy = navH + (compact ? 16 : 30);
  const fh = Math.max(120, (compact ? H - CTRL_H - 46 : H - 140) - fy);

  // where a given slide lands on the wall (each one sits in the gate slightly differently)
  const geom = (id: number | null) => {
    const m = id === null ? undefined : meta[id];
    const ok = !!m && m !== "error";
    const win: Win = ok ? (m as any).win : DEFAULT_WINDOW;
    const imgW = ok ? (m as any).w : 1000, imgH = ok ? (m as any).h : 1018;
    const asp = (win[2] * imgW) / (win[3] * imgH);
    const pw = Math.min(fw * (compact ? 1 : 0.86), fh * 0.9 * asp), ph = pw / asp;
    const bx = fx + (fw - pw) / 2, by = fy + (fh - ph) / 2;
    const q = quirksFor(id ?? 0);
    const px = bx + q.dx * pw, py = by + q.dy * ph;
    const fullW = pw / win[2], fullH = (fullW * imgH) / imgW;
    return { ok, m, win, imgW, imgH, pw, ph, bx, by, px, py, fullW, fullH, q, radius: Math.max(3, pw * 0.022) };
  };
  const cur = geom(shownId);
  const filt = `contrast(${contrast}%) brightness(${brightness}%)`;

  // the beam: from just behind and below you, out to the picture
  const beamSrc = { x: W / 2, y: H + Math.max(60, H * 0.12), r: Math.max(18, W * 0.02) };
  const beamPts = [
    [beamSrc.x - beamSrc.r, beamSrc.y], [cur.px, cur.py + cur.ph], [cur.px, cur.py],
    [cur.px + cur.pw, cur.py], [cur.px + cur.pw, cur.py + cur.ph], [beamSrc.x + beamSrc.r, beamSrc.y],
  ].map((p) => p.join(",")).join(" ");

  // preview size
  const pvMax = compact ? Math.min(W - 40, H - navH - 330) : Math.min(H - 330, 540);
  const pvAsp = cur.imgW / cur.imgH;
  const pvW = Math.max(160, Math.min(pvMax * (pvAsp >= 1 ? 1 : pvAsp), W - 60)), pvH = pvW / pvAsp;

  const renderPicture = (id: number, cls: string, key: string) => {
    const g = id === shownId ? cur : geom(id);
    const p = photos[id];
    return (
      <div key={key} className={"pb-proj " + cls} onClick={onPictureTap} title={playing ? "Pause" : "Next slide"}
        style={{ left: g.px, top: g.py, width: g.pw, height: g.ph, borderRadius: g.radius, transform: `rotate(${g.q.rot}deg)` }}>
        <div className={"pb-proj-in" + (g.q.soft ? " soft" : "")}>
          {g.ok ? (
            <img src={(g.m as any).src} alt={p.tags.join(", ")} draggable={false}
              style={{ width: g.fullW, height: g.fullH, left: -g.win[0] * g.fullW, top: -g.win[1] * g.fullH }} />
          ) : <div className="pb-proj-missing" />}
          {g.q.specks.map((s, k) => (
            <span key={k} className="pb-speck" style={{ left: s.x * 100 + "%", top: s.y * 100 + "%", width: s.r * 2, height: s.r * 2, opacity: s.o }} />
          ))}
          {g.q.hair && (
            <span className="pb-hair" style={{ left: g.q.hair.x * 100 + "%", top: g.q.hair.y * 100 + "%", width: g.q.hair.len * g.pw, transform: `rotate(${g.q.hair.rot}deg)` }} />
          )}
          {GATE_DUST.map((s, k) => (
            <span key={"g" + k} className="pb-speck" style={{ left: s.x * 100 + "%", top: s.y * 100 + "%", width: s.r * 2, height: s.r * 2, opacity: s.o }} />
          ))}
        </div>
        <div className="pb-proj-lift" />
        <div className="pb-proj-light" />
        <div className="pb-proj-grain" style={{ backgroundImage: GRAIN }} />
      </div>
    );
  };

  // ─── render ───────────────────────────────────────────
  return (
    <div ref={rootRef} className="pb-root" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <style>{CSS}</style>

      {/* the wall: dark, except where the projector's light falls on it */}
      {(() => {
        const cx = cur.bx + cur.pw / 2, cy = cur.by + cur.ph / 2;
        const mask = `radial-gradient(ellipse ${cur.pw * 1.15}px ${cur.ph * 1.25}px at ${cx}px ${cy}px, #000 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.12) 75%, transparent 100%)`;
        const wall = settings.wallPhoto
          ? { backgroundImage: `url("${settings.wallPhoto}")`, backgroundSize: "cover", backgroundPosition: "center" }
          : { backgroundImage: `${PLASTER}, ${GRAIN}`, backgroundSize: "520px 520px, 180px 180px" };
        return (
          <>
            {settings.wallPhoto && <div className="pb-wall-dim" style={wall} />}
            <div className={"pb-wall" + (lit ? " lit" : "") + (settings.wallPhoto ? " photo" : "")}
              style={{ ...wall, WebkitMaskImage: mask, maskImage: mask }} />
          </>
        );
      })()}

      {/* the projected picture(s) */}
      {shownPhoto && (
        <div className={"pb-pics" + (lit ? " lit" : "")}>
          {prevId !== null && mode === "dissolve" && renderPicture(prevId, "out", "out-" + dissolveKey)}
          {renderPicture(shownPhoto.id, prevId !== null && mode === "dissolve" ? "in" : "", "cur-" + shownPhoto.id + "-" + (prevId !== null ? dissolveKey : "c"))}
        </div>
      )}

      {/* the faint cone of light from the projector behind you */}
      {settings.beam > 0 && shownPhoto && (
        <svg className={"pb-beam" + (lit ? " lit" : "")} width={W} height={H} style={{ ["--beam" as any]: Math.min(2, settings.beam) }} aria-hidden="true">
          <defs>
            <linearGradient id="pb-beam-g" gradientUnits="userSpaceOnUse" x1={beamSrc.x} y1={beamSrc.y} x2={cur.px + cur.pw / 2} y2={cur.py + cur.ph / 2}>
              <stop offset="0" stopColor="#fff3dc" stopOpacity="0.075" />
              <stop offset="0.7" stopColor="#fff3dc" stopOpacity="0.02" />
              <stop offset="1" stopColor="#fff3dc" stopOpacity="0" />
            </linearGradient>
            <clipPath id="pb-beam-clip"><polygon points={beamPts} /></clipPath>
            <filter id="pb-beam-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="10" /></filter>
          </defs>
          <polygon points={beamPts} fill="url(#pb-beam-g)" filter="url(#pb-beam-blur)" />
          <g clipPath="url(#pb-beam-clip)">
            {MOTES.map((m, i) => {
              const t = 0.25 + m.y * 0.7;
              const cx = beamSrc.x + (cur.px + m.x * cur.pw - beamSrc.x) * t, cy = beamSrc.y + (cur.py + cur.ph * 0.5 - beamSrc.y) * t;
              return <circle key={i} className="pb-mote" cx={cx} cy={cy} r={m.r} style={{ animationDuration: m.d + "s", animationDelay: m.delay + "s" }} />;
            })}
          </g>
        </svg>
      )}

      {loading === "off" && !photos.length && (
        <div className="pb-empty" style={{ left: fx, top: fy, width: fw, height: fh }}>
          {dataError ? "Couldn't find slides.json — see the README" : "No slides yet — add scans to the slides folder"}
        </div>
      )}

      {/* caption, under the screen */}
      {shownPhoto && shownPhoto.caption && (
        <div className={"pb-caption" + (lit ? " lit" : "")} style={{ top: cur.by + cur.ph + (compact ? 16 : 22) }}>{shownPhoto.caption}</div>
      )}

      {/* side arrows */}
      {!compact && visible.length > 1 && cur.bx > 80 && (
        <>
          <button className="pb-nav" style={{ top: cur.by + cur.ph / 2, left: cur.bx - 66 }} onClick={() => step(-1)} aria-label="Previous slide">‹</button>
          <button className="pb-nav" style={{ top: cur.by + cur.ph / 2, left: cur.bx + cur.pw + 28 }} onClick={() => step(1)} aria-label="Next slide">›</button>
        </>
      )}

      {/* controls */}
      {compact ? (
        <div className="pb-ctrl compact" style={{ top: H - CTRL_H - 4 }}>
          <div className="pb-row">
            <button className="pb-round" onClick={() => step(-1)} aria-label="Previous slide">‹</button>
            <div className="pb-counter">
              <span>{visible.length ? curIdx + 1 : 0} / {visible.length}</span>
              <span className="pb-tags">{shownPhoto ? shownPhoto.tags.join(" · ") : ""}</span>
            </div>
            <button className="pb-round" onClick={() => step(1)} aria-label="Next slide">›</button>
          </div>
          <div className="pb-row tight">
            <button className={"pb-action" + (playing ? " on" : "")} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
            <button className={"pb-action" + (mode === "dissolve" ? " on" : "")} onClick={toggleMode}>{mode === "dissolve" ? "Fade: on" : "Fade: off"}</button>
            <button className="pb-action" onClick={openTray}>All</button>
            <button className="pb-action" onClick={openPreview}>Save</button>
          </div>
          {music.length > 0 ? (
            <div className={"pb-music mobile" + (musicPlaying ? " on" : "")}>
              <span className="pb-eq" aria-hidden="true"><i /><i /><i /></span>
              <span className="pb-track">{trackTitle}</span>
              <button className="pb-mbtn" onClick={toggleMusic} aria-label={musicPlaying ? "Pause music" : "Play music"}>{musicPlaying ? "❚❚" : "▶"}</button>
              {music.length > 1 && <button className="pb-mbtn" onClick={nextTrack} aria-label="Next track">⏭︎</button>}
            </div>
          ) : <div className="pb-hint">swipe to change slides</div>}
        </div>
      ) : (
        <>
          <div className="pb-ctrl side left">
            <div className="pb-counter big">SLIDE {String(visible.length ? curIdx + 1 : 0).padStart(3, "0")} / {String(visible.length).padStart(3, "0")}</div>
            <div className="pb-tags">{shownPhoto ? shownPhoto.tags.join(" · ") : ""}</div>
            <div className="pb-actions">
              <button className="pb-action" onClick={() => step(-1)}>‹ Prev</button>
              <button className="pb-action" onClick={() => step(1)}>Next ›</button>
              <button className={"pb-action" + (playing ? " on" : "")} onClick={togglePlay}>{playing ? "Pause" : "Play slideshow"}</button>
            </div>
            <div className="pb-actions">
              <button className="pb-action" onClick={openTray}>View all</button>
              <button className="pb-action" onClick={toggleMode}>
                Change: <span className={mode === "cut" ? "pb-on" : "pb-off"}>Cut</span> / <span className={mode === "dissolve" ? "pb-on" : "pb-off"}>Dissolve</span>
              </button>
            </div>
          </div>
          <div className="pb-ctrl side right">
            <button className="pb-action big" onClick={openPreview}>Download slide</button>
            <div className="pb-hint">view the whole slide and save it</div>
          </div>
        </>
      )}

      {/* filter bar */}
      <div ref={barRef} className={"pb-bar" + (compact ? " touch" : "")}>
        <span className="pb-title">{settings.title}</span>
        <div className="pb-pills">
          {pillCols.map((col, i) => (
            <div key={i} className="pb-col">
              {col.map((name) => {
                const on = name === "ALL" ? filters.length === 0 : filters.includes(name);
                return (
                  <button key={name} className={"pb-pill" + (on ? " on" : "")} onClick={() => toggleFilter(name)}>
                    {name}&nbsp;[{on ? "X" : " "}]
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <span className="pb-count">{filters.length ? `${visible.length} / ${photos.length}` : photos.length}</span>
      </div>

      {music.length > 0 && !compact && (
        <div className={"pb-music" + (musicPlaying ? " on" : "")}>
          <span className="pb-eq" aria-hidden="true"><i /><i /><i /></span>
          <span className="pb-track" title={trackTitle}>{trackTitle}</span>
          <button className="pb-mbtn" onClick={toggleMusic} aria-label={musicPlaying ? "Pause music" : "Play music"}>{musicPlaying ? "❚❚" : "▶"}</button>
          {music.length > 1 && <button className="pb-mbtn" onClick={nextTrack} aria-label="Next track">⏭︎</button>}
        </div>
      )}

      <button className={"pb-sound" + (soundOn ? "" : " muted")} title="Toggle sound"
        onClick={() => { const on = !soundOn; setSoundOn(on); soundRef.current = on; if (on) { playTap(); startHum(); } }}>
        {soundOn ? "🔊" : "🔇"}
      </button>

      {/* every slide in the tray, laid out on a light table */}
      {tray && (
        <div className="pb-tray" role="dialog" aria-modal="true">
          <div className="pb-tray-head">
            <span>THE TRAY · {visible.length} SLIDES{filters.length ? " · " + filters.join(" + ") : ""}</span>
            <button className="pb-close static" onClick={closeTray} aria-label="Close">✕</button>
          </div>
          <div className="pb-tray-table">
            <div className="pb-tray-grid">
              {visible.map((p, j) => {
                return (
                  <button key={p.id} className={"pb-tray-slide" + (j === curIdx ? " current" : "")}
                    style={{ transform: `rotate(${(rand(p.id, 9) - 0.5) * 4}deg)` }}
                    onClick={() => { setTray(false); playTap(); if (j !== curIdx) goTo(j); }}>
                    <img src={p.small} alt={p.tags.join(", ")} loading="lazy" draggable={false} />
                    <span className="pb-tray-num">{String(j + 1).padStart(3, "0")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* the whole slide, on a light box, ready to save */}
      {preview && shownPhoto && (
        <div className="pb-modal" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }}>
          <button className="pb-close" onClick={closePreview} aria-label="Close">✕</button>
          <div className="pb-lightbox" style={{ width: pvW + pvW * 0.16, height: pvH + pvW * 0.16 + (shownPhoto.caption ? pvW * 0.1 : 0) }}>
            <div className="pb-lightbox-slide" style={{ width: pvW, height: pvH, filter: filt }}>
              {cur.ok ? <img src={(cur.m as any).src} alt="" /> : <div className="pb-proj-missing" />}
              <img className="pb-full" src={shownPhoto.full} alt={shownPhoto.tags.join(", ")}
                onLoad={(e) => e.currentTarget.classList.add("on")} />
            </div>
            {shownPhoto.caption && (
              <div className="pb-tape" style={{ fontSize: Math.max(15, pvW * 0.045) }}>{shownPhoto.caption}</div>
            )}
          </div>
          <div className="pb-modal-info">SLIDE {String(curIdx + 1).padStart(3, "0")}</div>
          <div className="pb-moretags">
            <span className="pb-label">More from</span>
            {shownPhoto.tags.map((t) => (
              <button key={t} className="pb-tagchip" onClick={() => { setPreview(false); setFilters([t]); playTap(); }}>{t}</button>
            ))}
          </div>
          {touch ? (
            <div className="pb-actions center">
              <span className="pb-hint">press and hold the slide to save it</span>
              <button className="pb-action" onClick={copyLink}>Copy link</button>
            </div>
          ) : (
            <div className="pb-controls">
              <div className="pb-slider">
                <span className="pb-label">Contrast</span>
                <input type="range" min={0} max={300} value={contrast} onChange={(e) => setContrast(+e.target.value)} />
                <span className="pb-val">{contrast}%</span>
              </div>
              <div className="pb-slider">
                <span className="pb-label">Brightness</span>
                <input type="range" min={0} max={300} value={brightness} onChange={(e) => setBrightness(+e.target.value)} />
                <span className="pb-val">{brightness}%</span>
              </div>
              <div className="pb-actions center">
                <button className="pb-action" onClick={() => download("jpeg")}>Download JPEG</button>
                <button className="pb-action" onClick={() => download("tiff")}>Download TIFF</button>
                <button className="pb-action" onClick={copyLink}>Copy link</button>
                <button className="pb-action" onClick={() => { setContrast(100); setBrightness(100); playTap(); }}>Reset</button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading !== "off" && (
        <div className={"pb-loading" + (loading === "fading" ? " fading" : "")}>
          {flip && <img className="pb-flip" src={flip} alt="" />}
          <div className="pb-barwrap"><div className="pb-barfill" style={{ width: (progress.total ? (progress.done / progress.total) * 100 : 100) + "%" }} /></div>
          <div className="pb-loadlabel">loading slides · {progress.done} / {progress.total}</div>
        </div>
      )}

      <div className={"pb-toast" + (toast.show ? " show" : "")}>{toast.msg}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Caveat:wght@500&display=swap');
.pb-root{position:relative;width:100%;height:100vh;height:100dvh;min-height:520px;background:#030303;color:#e8e8e8;
  font-family:'DM Mono',ui-monospace,'SF Mono',Menlo,monospace;text-transform:uppercase;overflow:hidden;
  user-select:none;-webkit-user-select:none;touch-action:pan-y}
.pb-root *,.pb-root *::before,.pb-root *::after{box-sizing:border-box;margin:0;padding:0}
.pb-root button,.pb-root input{font-family:inherit;text-transform:uppercase}

/* room + screen */
/* the wall */
.pb-wall-dim{position:absolute;inset:0;pointer-events:none;opacity:.07;filter:saturate(.6)}
.pb-wall{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .09s linear;
  filter:brightness(.34) sepia(.25)}
.pb-wall.lit{opacity:1;transition:opacity .16s linear}
.pb-wall.photo{filter:brightness(.62) sepia(.15)}

/* the projected picture */
.pb-pics{position:absolute;inset:0;z-index:3;pointer-events:none;opacity:0;transition:opacity .07s linear}
.pb-pics.lit{opacity:1;transition:opacity .1s linear}
.pb-proj{position:absolute;overflow:hidden;cursor:pointer;pointer-events:auto;
  box-shadow:0 0 2px 1px rgba(255,240,220,.22),0 0 26px 6px rgba(255,238,215,.07)}
.pb-proj.out{animation:pb-out 1.4s ease-in-out both;pointer-events:none}
.pb-proj.in{animation:pb-in 1.4s ease-in-out both}
@keyframes pb-out{from{opacity:1}to{opacity:0}}
@keyframes pb-in{from{opacity:0}to{opacity:1}}
.pb-proj-in{position:absolute;inset:0;animation:pb-focus .6s ease-out both, pb-flicker 3.2s steps(1) infinite .7s}
.pb-proj-in.soft{animation:pb-softfocus 1.9s ease-out both, pb-flicker 3.2s steps(1) infinite 2s}
.pb-proj.in .pb-proj-in{animation:pb-flicker 3.2s steps(1) infinite 1.4s}
.pb-proj-in img{position:absolute;max-width:none;display:block;filter:contrast(.9) saturate(.95) brightness(1.05) blur(.35px)}
.pb-proj-missing{position:absolute;inset:0;background:radial-gradient(#7a0b4a,#2a0418)}
.pb-speck{position:absolute;border-radius:50%;background:#000;filter:blur(.7px);pointer-events:none}
.pb-hair{position:absolute;height:1px;background:rgba(0,0,0,.45);border-radius:2px;filter:blur(.4px);transform-origin:0 50%;pointer-events:none}
.pb-proj-lift{position:absolute;inset:0;pointer-events:none;background:#2a2723;mix-blend-mode:screen;opacity:.55}
.pb-proj-light{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse 70% 65% at 50% 48%,rgba(255,250,236,.12),rgba(255,250,236,0) 60%),
    radial-gradient(ellipse 100% 100% at 50% 50%,rgba(0,0,0,0) 55%,rgba(10,6,0,.32) 100%)}
.pb-proj-grain{position:absolute;inset:0;opacity:.3;mix-blend-mode:overlay;pointer-events:none}
@keyframes pb-focus{0%{filter:blur(7px) brightness(1.6) saturate(.7)}100%{filter:none}}
@keyframes pb-softfocus{0%{filter:blur(7px) brightness(1.6) saturate(.7)}22%{filter:blur(2.6px)}55%{filter:blur(2.4px)}75%{filter:blur(.9px)}100%{filter:none}}
@keyframes pb-flicker{0%,100%{opacity:1}37%{opacity:.975}38%{opacity:1}71%{opacity:.985}72%{opacity:1}}

/* the beam */
.pb-beam{position:absolute;left:0;top:0;pointer-events:none;z-index:4;opacity:0;transition:opacity .1s linear}
.pb-beam.lit{opacity:var(--beam,1);transition:opacity .2s linear}
.pb-mote{fill:#fff6e0;opacity:.35;animation:pb-mote linear infinite}
@keyframes pb-mote{0%{transform:translate(0,0);opacity:0}20%{opacity:.4}80%{opacity:.3}100%{transform:translate(14px,-40px);opacity:0}}

.pb-caption{position:absolute;left:0;right:0;text-align:center;z-index:4;font-size:11px;letter-spacing:.12em;
  color:rgba(255,255,255,.22);transition:color .3s;pointer-events:none}
.pb-caption.lit{color:rgba(255,255,255,.5)}

.pb-nav{position:absolute;transform:translateY(-50%);width:38px;height:38px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.45);border-radius:50%;cursor:pointer;font-size:20px;
  display:flex;align-items:center;justify-content:center;transition:all .15s;z-index:5}
.pb-nav:hover{background:rgba(255,255,255,.12);color:#fff}

.pb-ctrl{position:absolute;z-index:5;display:flex;flex-direction:column;gap:10px}
.pb-ctrl.side{bottom:28px;gap:6px}
.pb-ctrl.side.left{left:40px}
.pb-ctrl.side.right{right:40px;align-items:flex-end}
.pb-ctrl.side.left .pb-actions{margin-left:-8px}
.pb-ctrl.compact{left:0;right:0;align-items:center;gap:6px;padding:0 10px}
.pb-row{display:flex;align-items:center;justify-content:center;gap:16px;width:100%}
.pb-row.tight{gap:2px}
.pb-row.tight .pb-action{font-size:12px;padding:4px 7px}
.pb-counter{display:flex;flex-direction:column;align-items:center;font-size:11px;letter-spacing:.08em;color:rgba(255,255,255,.75);min-width:150px}
.pb-counter.big{display:block;font-size:13px;letter-spacing:.1em;color:rgba(255,255,255,.85)}
.pb-tags{font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.35);min-height:14px;margin-top:2px}
.pb-round{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
  color:rgba(255,255,255,.75);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.pb-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.pb-actions.center{justify-content:center;margin-top:4px}
.pb-action{padding:4px 8px;background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:13px;
  letter-spacing:.08em;transition:color .14s;white-space:nowrap}
.pb-action:hover,.pb-action.on{color:#fff}
.pb-on{color:#fff}
.pb-off{color:rgba(255,255,255,.3)}
.pb-action.big{font-size:14px;color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.18);border-radius:20px;padding:7px 16px}
.pb-action.big:hover{border-color:rgba(255,255,255,.5)}
.pb-hint{font-size:10px;color:rgba(255,255,255,.3);letter-spacing:.05em;text-align:center}

/* the tray, on a light table */
.pb-tray{position:absolute;inset:0;z-index:150;background:#030303;display:flex;flex-direction:column;animation:pb-fade .2s ease both}
.pb-tray-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;font-size:11px;letter-spacing:.12em;color:rgba(255,255,255,.6)}
.pb-tray-table{flex:1;overflow-y:auto;margin:0 18px 18px;border-radius:6px;
  background:radial-gradient(ellipse at 50% 40%,#fdfcf8 0%,#f0eee7 60%,#e2dfd6 100%);
  box-shadow:0 0 60px rgba(255,250,235,.12) inset}
.pb-tray-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:22px 18px;padding:26px}
.pb-tray-slide{position:relative;border:none;background:none;cursor:pointer;padding:0;transition:transform .15s}
.pb-tray-slide img{width:100%;height:auto;display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.28))}
.pb-tray-slide:hover{transform:scale(1.06) !important;z-index:2}
.pb-tray-slide.current img{outline:2px solid #e8573c;outline-offset:3px}
.pb-tray-num{display:block;margin-top:6px;font-size:9px;letter-spacing:.1em;color:rgba(0,0,0,.45);text-align:center}

/* the slide preview */
.pb-modal{position:absolute;inset:0;z-index:200;background:rgba(0,0,0,.94);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:12px;animation:pb-fade .2s ease both}
@keyframes pb-fade{from{opacity:0}to{opacity:1}}
.pb-lightbox{position:relative;display:flex;align-items:center;justify-content:center;border-radius:6px;
  background:radial-gradient(ellipse at 50% 45%,#fdfcf8 0%,#efede6 55%,#dcd9cf 100%);
  box-shadow:0 0 60px rgba(255,250,235,.18),0 20px 60px rgba(0,0,0,.6)}
.pb-lightbox-slide{position:relative;filter:drop-shadow(0 3px 6px rgba(0,0,0,.25))}
.pb-lightbox-slide img{width:100%;height:100%;object-fit:contain;display:block;-webkit-user-select:auto;user-select:auto;-webkit-touch-callout:default}
.pb-lightbox-slide img.pb-full{position:absolute;inset:0;opacity:0;transition:opacity .3s}
.pb-lightbox-slide img.pb-full.on{opacity:1}
.pb-empty{position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;
  font-size:12px;letter-spacing:.1em;color:rgba(255,255,255,.4)}
.pb-tape{position:absolute;bottom:3%;left:50%;transform:translateX(-50%) rotate(-1.6deg);padding:3px 16px 1px;
  background:rgba(236,222,180,.88);box-shadow:0 1px 2px rgba(0,0,0,.15);
  font-family:'Caveat','Bradley Hand','Segoe Print',cursive;text-transform:none;color:#2b2622;letter-spacing:.01em;white-space:nowrap}
.pb-modal-info{font-size:11px;letter-spacing:.1em;color:rgba(255,255,255,.55)}
.pb-moretags{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center}
.pb-tagchip{font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.75);background:none;border:1px solid rgba(255,255,255,.2);
  border-radius:12px;padding:3px 10px;cursor:pointer}
.pb-tagchip:hover{border-color:rgba(255,255,255,.6);color:#fff}
.pb-close{position:absolute;top:16px;right:16px;width:32px;height:32px;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-radius:50%;cursor:pointer;font-size:13px;
  display:flex;align-items:center;justify-content:center}
.pb-close.static{position:static}
.pb-close:hover{background:rgba(255,255,255,.14);color:#fff}
.pb-controls{display:flex;flex-direction:column;align-items:center;gap:10px;width:min(80%,520px)}
.pb-slider{display:flex;align-items:center;gap:12px;width:100%}
.pb-label{font-size:10px;opacity:.35;letter-spacing:.1em;min-width:76px}
.pb-moretags .pb-label{min-width:0}
.pb-val{font-size:10px;opacity:.3;min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
.pb-root input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:1.5px;background:rgba(255,255,255,.14);
  border-radius:2px;outline:none;cursor:pointer}
.pb-root input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;
  background:#e8e8e8;cursor:pointer;transition:transform .1s}
.pb-root input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.2)}
.pb-root input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#e8e8e8;cursor:pointer;border:none}

.pb-bar{position:absolute;top:0;left:0;right:0;z-index:55;padding:14px 64px 16px 18px;
  background:linear-gradient(180deg,#030303 0%,#030303 70%,rgba(3,3,3,0) 100%);display:flex;gap:26px;align-items:flex-start}
.pb-title{font-size:13px;letter-spacing:.04em;color:rgba(255,255,255,.92);white-space:nowrap;flex-shrink:0}
.pb-pills{display:flex;gap:34px;align-items:flex-start;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none}
.pb-pills::-webkit-scrollbar{display:none}
.pb-col{display:flex;flex-direction:column;gap:2px;align-items:flex-start}
.pb-pill{padding:0;text-align:left;border:none;background:none;cursor:pointer;font-size:11px;letter-spacing:.02em;
  white-space:nowrap;flex-shrink:0;color:rgba(255,255,255,.4);transition:color .15s}
.pb-pill:hover{color:rgba(255,255,255,.8)}
.pb-pill.on{color:#fff}
.pb-count{font-size:11px;opacity:.35;letter-spacing:.02em;white-space:nowrap;flex-shrink:0;margin-left:auto}
.pb-bar.touch{flex-wrap:wrap;padding:12px 14px;gap:10px;padding-right:60px}
.pb-bar.touch .pb-title{font-size:12px}
.pb-bar.touch .pb-pills{order:3;width:100%;gap:16px}
.pb-bar.touch .pb-col{gap:3px}
.pb-bar.touch .pb-pill{font-size:10px}

.pb-sound{position:absolute;top:12px;right:14px;width:34px;height:34px;background:rgba(10,10,10,.85);
  border:1px solid rgba(255,255,255,.1);border-radius:50%;color:rgba(255,255,255,.45);cursor:pointer;font-size:14px;
  display:flex;align-items:center;justify-content:center;transition:all .15s;z-index:60}
.pb-sound:hover{color:rgba(255,255,255,.85);border-color:rgba(255,255,255,.25)}
.pb-sound.muted{opacity:.4}

/* now playing */
.pb-music{position:absolute;top:12px;right:58px;z-index:60;height:34px;display:flex;align-items:center;gap:8px;
  padding:0 6px 0 12px;border-radius:17px;background:rgba(10,10,10,.85);border:1px solid rgba(255,255,255,.1);
  font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.45);max-width:min(340px,40vw)}
.pb-music.on{color:rgba(255,255,255,.75)}
.pb-music.mobile{position:static;height:30px;margin-top:2px;max-width:92%}
.pb-track{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-transform:none}
.pb-mbtn{flex-shrink:0;width:24px;height:24px;border-radius:50%;border:none;background:none;color:inherit;cursor:pointer;
  font-size:10px;display:flex;align-items:center;justify-content:center}
.pb-mbtn:hover{color:#fff;background:rgba(255,255,255,.08)}
.pb-eq{display:flex;align-items:flex-end;gap:2px;height:10px;flex-shrink:0}
.pb-eq i{display:block;width:2px;height:3px;background:currentColor;border-radius:1px}
.pb-music.on .pb-eq i{animation:pb-eq .9s ease-in-out infinite}
.pb-music.on .pb-eq i:nth-child(2){animation-delay:-.3s}
.pb-music.on .pb-eq i:nth-child(3){animation-delay:-.6s}
@keyframes pb-eq{0%,100%{height:3px}50%{height:10px}}

.pb-loading{position:absolute;inset:0;background:#030303;z-index:500;display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:20px;opacity:1;transition:opacity .7s ease}
.pb-loading.fading{opacity:0;pointer-events:none}
.pb-flip{width:180px;height:183px;object-fit:contain;display:block}
.pb-barwrap{width:200px;height:1px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden}
.pb-barfill{height:100%;background:rgba(255,255,255,.55);border-radius:2px;transition:width .25s ease}
.pb-loadlabel{font-size:10px;color:rgba(255,255,255,.3);letter-spacing:.12em}

.pb-toast{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);background:rgba(15,15,15,.92);
  border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:6px 14px;font-size:11px;letter-spacing:.04em;
  opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;z-index:300;color:rgba(255,255,255,.65);text-transform:none}
.pb-toast.show{opacity:1}
`;

