# Yours & Owls 2026 — slide projector website

## Adding, removing and tagging slides

Everything lives in the **`slides`** folder.

- **Each folder is a tag.** `slides/north-stage` shows up as **NORTH STAGE** in the filters. Make a new folder to make a new tag.
- **Add a slide:** put the scan (PNG, JPEG, WebP or TIFF) in a folder. TIFFs are turned into full-quality PNGs for the site automatically.
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
GitHub's website takes files up to 25 MB each. Full-size TIFF scans are often bigger than that; if one won't upload, save it as PNG (no quality lost, usually much smaller) or as a high-quality JPEG.

## Music

Make a folder called **`music`** (next to `slides`) and put audio files in it — MP3 or M4A are best.
They play in a loop, in file-name order, while people look at the slides. Start names with numbers to set the order;
the number is left off the title shown on screen (`01 - Ocean Eyes.mp3` shows "Ocean Eyes").
Delete a file to take it out of the playlist. Only use music you have the rights to share.

Browsers don't allow sound until the visitor clicks or taps something, so the music starts on their first click.
The speaker button mutes everything; the little player next to it pauses or skips tracks (keys: **M** play/pause, **N** next).
While music is playing, the projector's own sounds (the hum, clicks and clunks) go quiet; pause the music and they come back.

## Settings

Edit **`settings.json`**:

| Setting | What it does |
|---|---|
| `title` | Site name, top left and in browser tabs |
| `description` | Text shown under the link when it's shared |
| `slideSeconds` | Seconds per slide in the slideshow |
| `beam` | Strength of the light beam: `0` off, `1` normal |
| `wallPhoto` | A real photo of a wall for the slides to be projected onto: make a folder called `wall`, put the photo in it, and write e.g. `"wall/wall.jpg"`. Leave `""` for the plain dark wall. Best: a plaster or painted wall shot in a dim room, straight on |
| `musicVolume` | Music volume, `0` to `1` |
| `musicAutoplay` | `true`: music starts on the visitor's first click. `false`: only when they press play |
| `musicShuffle` | `true` to shuffle the playlist on each visit |
| `photographer` | Your name. It's saved inside every JPEG and TIFF people download (artist and copyright), so the credit travels with the photo. Leave `""` to leave it out |
| `jams` | `true`: now and then a slide goes in upside down and gets put back the right way. `false` to switch it off |
| `sounds.advance`, `sounds.hum` | Real projector sounds: put the audio in the `sounds` folder and write e.g. `"sounds/clunk.mp3"`. Leave `""` for the built-in sounds |

## First-time setup (once)

1. Make a free account at **github.com**. Click **+ → New repository**, name it (e.g. `yours-and-owls`), and create it.
2. On the new repository page, click **uploading an existing file** and drag in **everything in this folder** (all the files and folders). Commit.
3. Make a free account at **netlify.com** (sign up with GitHub).
4. **Add new site → Import an existing project → GitHub** → pick the repository → **Deploy**. Netlify reads `netlify.toml`, so there's nothing to fill in.
5. After a minute or two you get a link like `something.netlify.app`. Rename it under **Site configuration → Change site name**, or add your own domain under **Domain management**.

## Sharing a slide

**Copy link** in the Download preview gives a link like `…/s/022/`. Shared in Messages, Instagram, Facebook and so on,
it shows that slide's photo and caption in the preview, and opens the site on that slide.

## Event mode (for a TV or projector)

Click **Event mode** (or press **E**), or open the site with `#show` on the end, e.g. `https://your-site.netlify.app/#show`.
The buttons disappear, it goes full screen and the slideshow plays on a loop with the music.
With the `#show` link, click once to start (browsers need a click before they'll play sound or go full screen).
Move the mouse to see **Exit event mode**, or press **Esc**.

## Keys

**← →** change slide · **Space** play / pause · **S** shuffle · **E** event mode · **V** view all · **D** download · **M** music · **N** next track

## For developers

The page is `src/App.tsx` (React), pre-built to `app/app.js` with `npm run build:app`.
`npm run build` makes the site in `dist/` (thumbnails via sharp, `slides.json`, link preview tags).
