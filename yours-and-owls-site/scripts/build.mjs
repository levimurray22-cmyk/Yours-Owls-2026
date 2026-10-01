// Builds the site into the "dist" folder.
// Each folder inside "slides" is a tag; a scan in two folders gets both tags.
// Anything after " - " in a file name becomes that slide's caption.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SLIDES = path.join(ROOT, "slides");
const OUT = path.join(ROOT, "dist");
const IMG = /\.(png|jpe?g|webp)$/i;

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
      for (const f of fs.readdirSync(abs)) if (IMG.test(f) && !f.startsWith(".")) add(path.join(abs, f), [entry.name, f], tagName(entry.name));
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

  const dest = path.join(OUT, "slides", ...s.rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // trim any empty margin (transparent, or the scanner's plain background) from around the mount
  let source = s.src;
  if (sharp) {
    try { await sharp(s.src).rotate().trim({ threshold: 12 }).toFile(dest); source = dest; }
    catch (e) { fs.copyFileSync(s.src, dest); }
  } else fs.copyFileSync(s.src, dest);
  const full = "slides/" + urlPath(...s.rel);
  let screen = full, small = full;
  if (sharp) {
    try {
      await sharp(source).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(OUT, "thumbs", "screen", slug + ".webp"));
      await sharp(source).resize({ width: 360, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(OUT, "thumbs", "small", slug + ".webp"));
      screen = "thumbs/screen/" + slug + ".webp";
      small = "thumbs/small/" + slug + ".webp";
    } catch (e) { console.warn("Couldn't make smaller versions of", s.file, "—", e.message); }
  }
  slides.push({ file: s.file, slug, full, screen, small, tags: s.tags.sort(), caption });
}

// 4. sounds and wall photo, if any
for (const extra of ["sounds", "wall"]) {
  const dir = path.join(ROOT, extra);
  if (fs.existsSync(dir)) fs.cpSync(dir, path.join(OUT, extra), { recursive: true });
}

// 5. the slide list, the app, and the page (with a link preview from the first slide)
// the playlist: every audio file in "music", in file-name order.
// The title is the file name without its number, e.g. "01 - Ocean Eyes.mp3" → "Ocean Eyes"
const MUSIC = path.join(ROOT, "music");
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;
const music = [];
if (fs.existsSync(MUSIC)) {
  fs.mkdirSync(path.join(OUT, "music"), { recursive: true });
  const files = fs.readdirSync(MUSIC).filter((f) => AUDIO.test(f) && !f.startsWith("."))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  for (const f of files) {
    fs.copyFileSync(path.join(MUSIC, f), path.join(OUT, "music", f));
    const name = f.replace(AUDIO, "");
    const title = name.replace(/^\s*\d+\s*([-–._)]\s*)?/, "").trim() || name;
    music.push({ src: "music/" + encodeURIComponent(f), title });
  }
}

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
