// Builds the site into the "dist" folder.
// Each folder inside "slides" is a tag; a scan in two folders gets both tags.
// Anything after " - " in a file name becomes that slide's caption.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SLIDES = path.join(ROOT, "slides");
const OUT = path.join(ROOT, "dist");
const IMG = /\.(png|jpe?g|webp|tiff?)$/i;
const OTHER_IMG = /\.(heic|heif|raw|dng|nef|cr2|cr3|arw|psd|bmp|gif)$/i;
const TIFF = /\.tiff?$/i;                 // browsers can't show TIFFs, so these get turned into PNGs on the site

import { findWindow } from "../src/findWindow.mjs";

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { console.warn("sharp not available — using full-size scans everywhere"); }

const settings = JSON.parse(fs.readFileSync(path.join(ROOT, "settings.json"), "utf8"));
const tagName = (folder) => folder.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "slide";
const urlPath = (...parts) => parts.map(encodeURIComponent).join("/");

// 1. find every scan
const found = new Map();   // lower-case file name → { file, src, rel, tags }
const add = (abs, rel, tag) => {
  const file = path.basename(abs);
  const key = file.toLowerCase();
  if (!found.has(key)) found.set(key, { file, src: abs, rel, tags: [] });
  if (tag && !found.get(key).tags.includes(tag)) found.get(key).tags.push(tag);
};
if (fs.existsSync(SLIDES)) {
  for (const entry of fs.readdirSync(SLIDES, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(SLIDES, entry.name);
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(abs)) {
        if (f.startsWith(".")) continue;
        if (IMG.test(f)) add(path.join(abs, f), [entry.name, f], tagName(entry.name));
        else if (OTHER_IMG.test(f)) console.warn(`  ✗ ${entry.name}/${f}: this format isn't supported — save it as PNG, JPEG or TIFF`);
      }
    } else if (IMG.test(entry.name)) add(abs, [entry.name], null);
  }
}
const scans = [...found.values()].sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true, sensitivity: "base" }));

// 2. fresh output folder
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "thumbs", "screen"), { recursive: true });
fs.mkdirSync(path.join(OUT, "thumbs", "small"), { recursive: true });

// 3. copy each scan and make the two smaller sizes
const used = new Set();
const slides = [];
for (const s of scans) {
  const name = s.file.replace(IMG, "");
  const dash = name.indexOf(" - ");
  const caption = dash >= 0 ? name.slice(dash + 3).trim() : "";
  let slug = slugify(dash >= 0 ? name.slice(0, dash) || name : name), n = 2;
  while (used.has(slug)) slug = slugify(name) + "-" + n++;
  used.add(slug);

  // a TIFF scan is published as a full-size PNG (lossless) with the same name
  const rel = TIFF.test(s.file) ? [...s.rel.slice(0, -1), s.rel[s.rel.length - 1].replace(TIFF, ".png")] : s.rel;
  const dest = path.join(OUT, "slides", ...rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // trim any empty margin (transparent, or the scanner's plain background) from around the mount
  let source = s.src;
  if (sharp) {
    try {
      let img = sharp(s.src).rotate().trim({ threshold: 12 });
      if (TIFF.test(s.file)) img = img.toColourspace("srgb").png({ compressionLevel: 9 });   // 16-bit / CMYK scans → standard 8-bit
      await img.toFile(dest); source = dest;
    }
    catch (e) {
      if (TIFF.test(s.file)) { console.warn(`  ✗ ${s.file}: couldn't read this TIFF (${e.message}) — try saving it as PNG or JPEG`); used.delete(slug); continue; }
      fs.copyFileSync(s.src, dest);
    }
  } else if (TIFF.test(s.file)) { console.warn(`  ✗ ${s.file}: skipped, TIFFs need sharp`); used.delete(slug); continue; }
  else fs.copyFileSync(s.src, dest);
  const full = "slides/" + urlPath(...rel);
  let screen = full, small = full;
  if (sharp) {
    try {
      await sharp(source).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(OUT, "thumbs", "screen", slug + ".webp"));
      await sharp(source).resize({ width: 360, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(OUT, "thumbs", "small", slug + ".webp"));
      screen = "thumbs/screen/" + slug + ".webp";
      small = "thumbs/small/" + slug + ".webp";
    } catch (e) { console.warn("Couldn't make smaller versions of", s.file, "—", e.message); }
  }
  // where the photo sits inside the mount, so only the photo is projected
  let window = null, aspect = 0;
  if (sharp) {
    try {
      const { data, info } = await sharp(source).resize({ width: 640, height: 640, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      aspect = info.width / info.height;
      window = findWindow(data, info.width, info.height, 4);
    } catch (e) {}
  }
  slides.push({ file: s.file, slug, full, screen, small, tags: s.tags.sort(), caption, window, aspect });
}

// a scan whose window comes out very different from the other scans of the same shape of mount
// was probably misread — give it the window the others agree on
{
  const groups = new Map();
  for (const s of slides) { const k = Math.round(s.aspect * 50); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const med = (v) => { const a = v.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  for (const list of groups.values()) {
    const found = list.filter((s) => s.window);
    if (found.length < 3) continue;
    const m = [0, 1, 2, 3].map((i) => med(found.map((s) => s.window[i])));
    const near = (w) => w && w.every((v, i) => Math.abs(v - m[i]) < 0.025);
    if (found.filter((s) => near(s.window)).length < found.length / 2) continue;   // no clear agreement
    for (const s of list) if (!near(s.window)) {
      console.log(`  ⚠ ${s.file}: photo window ${s.window ? "looked unusual" : "wasn't found"} — using the same window as the other slides`);
      s.window = m;
    }
  }
}
for (const s of slides) {
  if (s.window) s.window = s.window.map((v) => Math.round(v * 10000) / 10000); else delete s.window;
  delete s.aspect;
}

// 4. sounds and wall photo, if any
for (const extra of ["sounds", "wall"]) {
  const dir = path.join(ROOT, extra);
  if (fs.existsSync(dir)) fs.cpSync(dir, path.join(OUT, extra), { recursive: true });
}

// 5. the slide list, the app, and the page (with a link preview from the first slide)
// the playlist: every audio file in "music", in file-name order.
// The title is the file name without its number, e.g. "01 - Ocean Eyes.mp3" → "Ocean Eyes"
// Looks for the folder in a few likely places, and says in the deploy log what it found.
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
const NOT_PLAYABLE = /\.(aif|aiff|wma|m4p|alac|mid|midi)$/i;
const musicDirs = [];
const lookIn = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }))
    if (e.isDirectory() && e.name.toLowerCase() === "music") musicDirs.push(path.join(dir, e.name));
};
lookIn(ROOT); lookIn(path.join(ROOT, "..")); lookIn(SLIDES);
const audioFiles = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs);
    else if (AUDIO.test(e.name)) audioFiles.push(abs);
    else if (NOT_PLAYABLE.test(e.name)) console.warn(`  ✗ ${e.name}: browsers can't play this format — export it as MP3 or M4A`);
  }
};
for (const d of [...new Set(musicDirs)]) walk(d);
const music = [];
if (audioFiles.length) {
  fs.mkdirSync(path.join(OUT, "music"), { recursive: true });
  const seen = new Set();
  audioFiles.sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: "base" }));
  for (const abs of audioFiles) {
    const f = path.basename(abs);
    if (seen.has(f.toLowerCase())) continue;
    seen.add(f.toLowerCase());
    fs.copyFileSync(abs, path.join(OUT, "music", f));
    const name = f.replace(AUDIO, "");
    const title = name.replace(/^\s*\d+\s*([-–._)]\s*)?/, "").trim() || name;
    music.push({ src: "music/" + encodeURIComponent(f), title });
  }
}
if (!musicDirs.length) console.log(`No "music" folder found (looked in ${path.basename(ROOT)}/, the top of the repository, and slides/).`);
else if (!music.length) console.log(`Found a music folder but no playable tracks in it: ${musicDirs.map((d) => path.relative(path.join(ROOT, ".."), d)).join(", ")}`);

const { description = "", ...appSettings } = settings;
fs.writeFileSync(path.join(OUT, "slides.json"), JSON.stringify({ settings: appSettings, slides, music }, null, 1));
fs.copyFileSync(path.join(ROOT, "app", "app.js"), path.join(OUT, "app.js"));
const site = (process.env.URL || "").replace(/\/$/, "");
const first = slides[0];
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replaceAll("__TITLE__", esc(settings.title || "Slides"))
  .replaceAll("__DESCRIPTION__", esc(description))
  .replaceAll("__IMAGE__", first ? esc((site ? site + "/" : "") + first.screen) : "")
  .replaceAll("__ICON__", first ? esc(first.small) : "");
fs.writeFileSync(path.join(OUT, "index.html"), html);

console.log(`Built ${slides.length} slide${slides.length === 1 ? "" : "s"} and ${music.length} music track${music.length === 1 ? "" : "s"} into dist/`);
for (const m of music) console.log(`  ♪ ${m.title}`);
for (const s of slides) console.log(`  ${s.file}  →  ${s.tags.join(", ") || "(no tags)"}${s.caption ? `  ·  "${s.caption}"` : ""}`);
