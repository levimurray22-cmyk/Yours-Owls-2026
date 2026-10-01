# Yours & Owls 2026 — slide projector website

## Adding, removing and tagging slides

Everything lives in the **`slides`** folder.

- **Each folder is a tag.** `slides/north-stage` shows up as **NORTH STAGE** in the filters. Make a new folder to make a new tag.
- **Add a slide:** put the scan (PNG, JPG or WebP) in a folder.
- **Two tags:** put the same file, with the same name, in both folders.
- **No tag:** put the scan directly in `slides`.
- **Caption:** add it to the file name after ` - ` (space, dash, space).
  `022 - North Stage 9.40pm.png` → caption "North Stage 9.40pm".
- **Order:** slides play in file-name order, so start names with numbers (`001`, `002` …).
- **Delete a slide:** delete the file (from every folder it's in).

The scans can have a transparent or plain background — the empty margin around the mount is trimmed automatically.

## Doing that on GitHub (in your browser)

- **Add:** open the `slides` folder, then the tag folder → **Add file → Upload files** → drag the scans in → **Commit changes**.
  To make a new tag folder: **Add file → Upload files**, and drag in a folder with that name.
- **Delete:** click the scan → the **…** menu (top right) → **Delete file** → **Commit changes**.

Netlify rebuilds the site by itself about a minute after each change.
GitHub's website takes files up to 25 MB each.

## Settings

Edit **`settings.json`**:

| Setting | What it does |
|---|---|
| `title` | Site name, top left and in browser tabs |
| `description` | Text shown under the link when it's shared |
| `slideSeconds` | Seconds per slide in the slideshow |
| `transition` | `"cut"` (lamp blinks) or `"dissolve"` (slow fade) to start with |
| `beam` | Strength of the light beam: `0` off, `1` normal |
| `wallPhoto` | A real photo of a wall for the slides to be projected onto: make a folder called `wall`, put the photo in it, and write e.g. `"wall/wall.jpg"`. Leave `""` for the plain dark wall. Best: a plaster or painted wall shot in a dim room, straight on |
| `sounds.advance`, `sounds.hum` | Real projector sounds: put the audio in the `sounds` folder and write e.g. `"sounds/clunk.mp3"`. Leave `""` for the built-in sounds |

## First-time setup (once)

1. Make a free account at **github.com**. Click **+ → New repository**, name it (e.g. `yours-and-owls`), and create it.
2. On the new repository page, click **uploading an existing file** and drag in **everything in this folder** (all the files and folders). Commit.
3. Make a free account at **netlify.com** (sign up with GitHub).
4. **Add new site → Import an existing project → GitHub** → pick the repository → **Deploy**. Netlify reads `netlify.toml`, so there's nothing to fill in.
5. After a minute or two you get a link like `something.netlify.app`. Rename it under **Site configuration → Change site name**, or add your own domain under **Domain management**.

## Sharing a slide

Each slide has its own link, e.g. `…/#slide-022`. Use **Copy link** in the Download preview.

## For developers

The page is `src/App.tsx` (React), pre-built to `app/app.js` with `npm run build:app`.
`npm run build` makes the site in `dist/` (thumbnails via sharp, `slides.json`, link preview tags).
