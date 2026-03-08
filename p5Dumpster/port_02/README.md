# TheDumpster — p5.js Port (port_02)

Interactive art installation visualizing a database of ~20,000 breakup stories collected in 2005. This is a p5.js (JavaScript) port of the original Processing/Java application.

---

## Overview

The canvas is **1280×800** pixels (`DUMPSTER_APP_W × DUMPSTER_APP_H`). It is divided into three visual regions:

| Region | Position | Description |
|---|---|---|
| **Pixel View** | Top-left, 90×222 px scaled 3× | Each pixel = one breakup, colored by similarity to current selection |
| **Heart Wall** | Right of pixel view, full height minus histogram | Physics-based particle system of heart-shaped dots |
| **Histogram** | Bottom strip | Bar chart of breakups per day of year (2005) |

A **magnification loupe** (7×5 cells at 18px each) sits below the pixel view, showing a zoomed neighborhood of the currently hovered/selected pixel.

A **HelpDisplayer** text panel sits below the magnification loupe, showing metadata for the current selection (ID, AGE, SEX, MATCH %, LENGTH, DAY).

**Balloon stack** appears in the right portion of the heart wall — a scrolling list of text excerpts from breakup stories, each connected to its heart particle by a bezier curve.

---

## File Structure

```
port_02/
  sketch.js                  — Main p5.js sketch: setup/draw/events, global state
  dumpster_constants.js      — All global numeric/boolean constants
  breakup.js                 — Breakup data class (per-record metadata + similarity math)
  breakup_manager.js         — Loads all data files; computes per-breakup similarity scores
  knower_of_selections.js    — Tiny shared state: which breakupId is selected/moused-over
  heart.js                   — Physics heart particle class
  heart_manager.js           — Manages all 720 heart particles; physics sim loop
  heart_balloon_connector.js — Draws bezier lines connecting hearts to balloons
  pixel_view.js              — 90×222 pixel grid; PixelIndexer (sorting); click/drag/keys
  pixel_indexer.js           — Sorts 20,038 breakups into the pixel grid (4-pass sort)
  paragraph_balloon.js       — Single balloon widget (text + date label)
  paragraph_balloon_manager.js — Ring buffer of up to 14 balloons; stacking logic
  paragraph.js               — Word-wrap layout engine (character-width LUT)
  dumpster_histogram.js      — Histogram with mouse-zoom warp; month boundary bands
  histogram_color_scheme.js  — Color constants for histogram rendering
  help_displayer.js          — Metadata text panel below magnification loupe
  loader.js                  — Decodes compressed breakup text corpus from PNG image
  vocab.js                   — Vocabulary table for the compressed text corpus
  catalog.js                 — FILENAMES array mapping pixel-order indices to file keys
  data/                      — Binary/text assets (not committed to repo in full)
```

---

## Data Assets (`data/`)

| File | Format | Description |
|---|---|---|
| `languageData.txt` | TSV, 7 floats/line (scaled ×2^15) | Language feature vectors per breakup |
| `languageTags.txt` | Space-separated, 4 ints/line | Language bit-flag tags |
| `kamalFlags.txt` | TSV: age, date (1-365), flags | Age, calendar day, misc flags |
| `accessThemes.tsv` | TSV: good, gender, fault, instig, themes | Quality/access tags |
| `breakupSummaryLengths.dat` | Binary, 1 byte/record | Summary text length 0–255 |
| `breakupsPerDay2005.txt` | One int/line | Count of breakups per calendar day |
| `all_dumpster_texts.png` | Custom compressed PNG | All breakup story texts (decoded by `loader.js`) |
| `6px2bus.ttf` | TrueType | Pixel font used for dates and histogram labels |
| `dumpster_1010x675.jpg` | JPEG | Background image for the heart wall |
| `hist_1010x125.jpg` | JPEG | Background image for the histogram |

### Record counts
- `N_BREAKUP_DATABASE_RECORDS = 20038` — total records including invalid ones
- `N_BREAKUP_DATABASE_RECORDS_20K = 222 × 90 = 19980` — the pixel grid size (what most code indexes into)
- `MAX_N_HEARTS = 720`
- `MAX_N_BALLOONS = 14`

---

## Startup Sequence

1. `preload()` — p5.js loads all asset files synchronously before `setup()`.
2. `setup()` — Constructs all manager objects. Calls `BM.loadFromAssets(...)` to parse data.
3. `loadClips(callback)` — Asynchronously decodes the text corpus PNG into the `Files` dict. Sets `textsReady = true` when done.
4. Inside the callback: picks a random valid breakup, calls `HM.addSelectedBreakupFromOutsideAndGetNewHeartId()` + `_enactSelection()` to establish the first selection.

Text lookups via `getBreakupText(id)` and `getBreakupAuthorDisplay(id)` return `''` until `textsReady` is true.

---

## Key Global Variables (`sketch.js`)

```js
var KOS  // KnowerOfSelections — shared selection state
var BM   // BreakupManager
var HM   // HeartManager
var PBM  // ParagraphBalloonManager
var HBC  // HeartBalloonConnector
var DH   // DumpsterHistogram
var PV   // PixelView
var HD   // HelpDisplayer

var pixelFont       // loaded TrueType font (6px2bus.ttf)
var textsReady      // boolean: true once loadClips() callback fires

// Pixel-view drag state
var _bPixelViewMouseDownInView  // true from mouseDown in pixel view until mouseUp
var _bPixelViewDragActive       // true once mouse has moved >= PIXELVIEW_DRAG_THRESHOLD_PX from origin
var _pixelViewClickOriginX/Y    // mouse position at press time
var _pixelViewClickBupId        // bupId at click origin

var _balloonClickActive         // true while mouse is held on a balloon
var _lastInteractionTime        // millis() of last user action (gates autoplay)
```

---

## Breakup Data Model (`Breakup` class)

Each `Breakup` instance holds:

- `ID` — 0-based integer index
- `age` — age of submitter (0 if unknown)
- `sex` — 0=unknown, 1=F, 2=M
- `date` — calendar day 1–365 (2005)
- `fault`, `instigator`, `accessTags`, `kamalTags` — bitmask fields
- `languageData[7]` — float features (profanity, exclamation, question, capitalization, etc.)
- `languageTags[4]` — bitflag arrays
- `summaryLen` — 0–255 byte count of the story text
- `langMetric` — `summaryLen/255 + profanity + capitalization`
- `nBitsSet` — count of set metadata bits (used for heart size)
- `heartRadius` — precomputed from `nBitsSet` and `summaryLen`, range `[HEART_MIN_RAD, HEART_MAX_RAD]`
- `VALID` — `SHOW_NONGOOD_BREAKUPS || (good > 0)`. Single gating flag — only valid breakups appear in selections, autoplay, or drag.

---

## Similarity Computation (`BreakupManager`)

Called on every new selection via `informOfNewlySelectedBreakup(bupId)` → `computeSimilarityOfAllBupsToCurrBup()`.

Produces `BM.SIMILARITIES[i]` ∈ [0, 1] for all 20,038 records. Weights:

- Language distance (7D Euclidean, contrast-enhanced to ±2σ): 0.20
- Language tag commonalities: 0.30 (if nonzero)
- Kamal tag commonalities: 0.40 (if nonzero)
- Access tag commonalities: 0.40
- Age distance (capped at 5 years): 0.10
- Summary length distance: 0.05

Weights can sum > 1 when both tag types are nonzero — the final vector is normalized by its max value.

Heart color = `sim^0.9 * 200` for the red channel (dark red → bright red = low → high similarity).

---

## Pixel View (`PixelView` + `PixelIndexer`)

### Layout
- 90 columns × 222 rows = 19,980 pixels, displayed at 3× scale (270×666 screen pixels).
- Each pixel maps to one breakup via `PIN.PixelIndexToBupIndex[i]`.
- Reverse map: `PIN.BupIndexToPixelIndex[bupId]`.

### Sort order (PixelIndexer, 4 passes)
1. Sort all 20K by **age** (ascending) — fills rows top-to-bottom from youngest.
2. Within each age group, sort by **language metric** (descending).
3. Within each row of 90, sort by **sex** (groups: unknown, F, M left to right).
4. Within each sex group in each row, sort by **instigator**.

Result: rows = age cohorts; columns = language/sex/instigator structure.

### Pixel coloring
Per pixel: similarity → `rLUT[c]`, `gLUT[c]`, `bLUT[c]` (power-curve LUTs). Males get `+MALE_BLUE_AMOUNT` (45) added to the blue channel.

### Selection highlights
- **Yellow** nested rect = current selected breakup (animates toward target position).
- **Blue** nested rect = current mouseover breakup (fades when mouse leaves).

### Interactions
- **Click** in pixel view: immediately snaps yellow cursor, calls `_enactSelection()` with a new heart.
- **Drag** (after `PIXELVIEW_DRAG_THRESHOLD_PX = 16` px): calls `_enactPixelDrag()` every frame — updates selection in-place without adding to balloon stack.
- **Arrow keys** (while mouse in pixel view): shift a ±1 key offset; ENTER confirms.
- **Magnification loupe click**: treated as a pixel-view selection.

---

## Heart Particle System (`Heart`, `HeartManager`)

### Physics
Each heart has position `(px, py)`, velocity `(vx, vy)`, radius `rad` (animated toward `rad_target`).

Forces applied each frame:
- **Gravity**: constant downward `HEART_GRAVITY = 0.030`
- **Centralizing**: pulls hearts toward `HEART_HEAP_CENTERX/Y` when outside `HEART_NEIGHBORHOOD`
- **Attraction to selected**: hearts with `sim > 0.33` are pulled toward the selected heart
- **Collision**: pairwise repulsion for overlapping hearts (binned with `xbins`/`ybins` for O(N) spatial hash)
- **Damping**: `HEART_DAMPING = 0.99` per frame; `HEART_COLLISION_DAMPING = 0.925` on bounce

### Spatial binning
`bindices = [3, 7, 14, 28, 56, 112, 224, 192]` — maps 8 horizontal/vertical bins to bitmask values. Two hearts can collide only if `(xbins_i & xbins_j) > 0 && (ybins_i & ybins_j) > 0`.

### Mouse states
- `STATE_MOUSE_IGNORE` — normal; radius = `rad_backup`
- `STATE_MOUSE_OVER` — hovered; radius = `HEART_OVER_RADIUS = 20`, color = blue
- `STATE_MOUSE_SELECT` — selected (not dragged); radius = `HEART_SELECT_RADIUS = 28`, color = orange
- `STATE_MOUSE_DRAG` — being dragged; radius = `HEART_DRAG_RADIUS = 36`, color = orange

### Heart lifecycle
- `STATE_HEART_GONE` — slot available for reuse
- `STATE_HEART_FADING` — `rad_target = 0`; transitions to GONE when `rad ≈ 0`
- `STATE_HEART_EXISTS` — active

### Spawn position
- Selected heart (`sim = 1.0`): spawns at `(width/2, height/2)`.
- Non-selected: spawns from top edge or right edge with downward velocity.

### Slot eviction
When no GONE slot is available, `addSelectedBreakupFromOutsideAndGetNewHeartId()` and `initiateHeartsFromList()` both evict the least-similar heart not attached to a balloon (by `BM.SIMILARITIES`).

### Shuffling
`performScheduledShuffling()` runs each frame (unless pixel-drag is active):
- `removeBadMatchingHeartRandomly()`: with probability `HM_SHUFFLE_PROBABILITY = 0.08`, fades out a heart below mean similarity.
- `addWellMatchingHeartRandomly()`: with probability 0.025, initiates a new heart above mean similarity (up to 80 tries).

Shuffling is suppressed during `_bPixelViewDragActive`.

---

## Balloon System (`ParagraphBalloon`, `ParagraphBalloonManager`)

### Layout
- Up to `MAX_N_BALLOONS = 14` balloons in a ring buffer.
- All balloons are right-aligned: `BALLOON_X = DUMPSTER_APP_W - BALLOON_W - BALLOON_APPMARGIN_R`.
- `BALLOON_W = min(360, floor(HEART_AREA_W / 2) - BALLOON_APPMARGIN_R)`.
- Stack from top: newest balloon at `BALLOON_START_Y = 7`, older ones below with `BALLOON_SPACING_Y = 6` gap.
- Balloon height = natural text height (`nLines × leading + margT + margB`).

### Text
- Font: Georgia Italic, `BALLOON_TEXT_SIZE = 11` pt.
- Author name (bold): indented on the first line.
- Body text: word-wrapped by `Paragraph` using character-width LUT at `PARA_TEXT_WIDTH_FUDGE = 0.5125`.
- Text is fetched from `Files` dict via `getBreakupText(id)`. Apostrophe fix: ` \` ` and ` ' ` are both normalized to `'`.

### Date label
- Rendered in right margin, rotated 90° CW using `pixelFont` at size 6.
- Format: `M-D` (e.g. `3-15` for March 15). If `nLines >= 3`, appends `-05` for the year (e.g. `3-15-05`).
- Opacity: 30% of body text alpha.

### Pixel-drag behavior
- During drag (`_bPixelViewDragActive`), the topmost balloon is held at minimum 5-line height via `updateTopmostBalloonInPlace()`.
- On `mouseReleased()`, `restoreTopmostBalloonHeight()` re-layouts the balloon at its natural height.

### Alpha fade
Balloons fade out as they scroll down: `alpha = 255 * (1 - py/HEART_AREA_H)^0.625` for body, `^0.050` for text.

---

## Histogram (`DumpsterHistogram`)

### Layout
- Occupies the bottom strip from `y = HEART_WALL_B` to `y = DUMPSTER_APP_H`.
- Data: 365 days of 2005, one bar per day, value = count of breakups submitted that day.
- Left of `histogramL` (= `HEART_WALL_L`): vertical scale labels.
- One `HistogramBand` strip below bars shows month names.

### Mouse-zoom warp
When the mouse is inside the histogram, the x-axis is warped (power function centered at cursor) to magnify the region near the cursor. The power increases as the mouse moves downward within the histogram.

### Cursor highlight
The bar under the cursor is colored with `bandCurCol` (yellow when selected, blue when mouseover, white/default otherwise).

### Stripe anti-aliasing
When the mouse is inside the histogram (`bMouseInside`), bars narrower than `DH_STRIPE_ANTIALIAS_PX = 3.0` pixels lerp their color toward `bandAvg` (average of the two alternating band colors):
```js
let t = clamp(stripePixelWidth / DH_STRIPE_ANTIALIAS_PX, 0, 1);
t = t^4;
stroke(t >= 1 ? bandColor : lerpColor(bandAvg, bandColor, t));
```
A debug line (`lerpColor(color(0, 255, 0), bandColor, t)`) is commented out but preserved for testing.

### Histogram click
`_enactHistogramDayClick(dayIndex)` collects all valid breakups for that day, picks one as the main selected breakup, and seeds the heart wall with all of them via `HM.initiateHeartsFromList(candidates, candidates.length)`.

---

## Selection Flow (`_enactSelection`)

Called whenever a new breakup becomes the main selection:

```js
function _enactSelection(heartId) {
  PBM.execute(bupId, heartId);          // push new balloon (or re-order existing)
  BM.informOfNewlySelectedBreakup(bupId); // recompute all similarities
  HM.refreshHeartColors(BM, bupId);     // update all heart colors
  PV.updateImage();                      // redraw pixel view image
}
```

Entry points that call `_enactSelection`:
- Clicking a heart particle
- Clicking in the pixel view
- Clicking the magnification loupe
- Clicking a balloon (promotes it to current)
- Clicking a histogram day
- Autoplay (`_autoPlay`)
- Initial random selection on load

---

## Pixel-View Drag Flow (`_enactPixelDrag`)

Called every frame while `_bPixelViewDragActive && mouseIsPressed`:

```js
PV.snapSelectionToBupId(bupId);                      // move yellow cursor immediately
KOS.currentMouseoverBreakupId = bupId;               // update KOS (for histogram)
KOS.currentMouseoverBreakupIdWithOffset = bupId;     // update KOS (for HelpDisplayer)
HM.updateSelectedHeartBreakupId(bupId);              // retarget selected heart in-place
PBM.updateTopmostBalloonInPlace(bupId, heartId);     // update top balloon text (min 5 lines)
BM.informOfNewlySelectedBreakup(bupId);              // recompute similarities
HM.refreshHeartColors(BM, bupId);                   // update heart colors
PV.updateImage();                                    // redraw pixel view image
```

Does NOT call `_enactSelection` (no new balloon stack entry, no heart spawn).

---

## Autoplay

`_autoPlay()` fires only when:
- `elapsed > DUMPSTER_LONELY_TIME` (5000 ms since last interaction)
- `!_bPixelViewDragActive`
- `!HM.bCurrentlyDraggingSelectedHeart`

With probability 0.01 per frame, picks a random valid breakup and enacts a full selection.

---

## KnowerOfSelections

Tiny shared-state object (`KOS`) with three fields:

```js
KOS.currentSelectedBreakupId            // the main yellow selection
KOS.currentMouseoverBreakupId           // hovered breakup (heart or pixel)
KOS.currentMouseoverBreakupIdWithOffset // hovered breakup including arrow-key offset
```

Read by `DH` (histogram highlight), `HD` (help displayer text), and `PV` (pixel view cursor).

---

## Text Corpus (`loader.js`)

The breakup text corpus is stored in `data/all_dumpster_texts.png` as a custom variable-length encoded binary blob read via WebGL2 (to avoid premultiplied-alpha corruption from the browser's `<canvas>`).

Encoding (3 cases per token):
1. **High bit set** → index into `VOCAB[]` (128-entry vocabulary) for common words/tokens
2. **Next byte has high bit set** → 14-bit index into extended vocabulary (128-entry extension)
3. **Otherwise** → null-terminated raw ASCII string

The decoded `Files` dict maps keys like `"0/1/2/01234"` (directory path derived from the 5-digit zero-padded ID) to full text strings. `FILENAMES` (from `catalog.js`) provides the key order matching pixel-sort order.

`getBreakupText(id)` strips the author line, normalizes apostrophes.
`getBreakupAuthorDisplay(id)` extracts the author name from the first line (inside parentheses), appends `" >"`.

---

## Constants Reference (`dumpster_constants.js`)

| Constant | Value | Purpose |
|---|---|---|
| `DUMPSTER_INVALID` | -1 | Sentinel for "no value" |
| `DUMPSTER_APP_W/H` | 1280, 800 | Canvas size |
| `DUMPSTER_LONELY_TIME` | 5000 | Autoplay idle threshold (ms) |
| `SHOW_NONGOOD_BREAKUPS` | true | If false, only "good data" records are VALID |
| `BALLOON_TEXT_SIZE` | 11 | Georgia font size in balloons |
| `MAX_N_BALLOONS` | 14 | Ring buffer size |
| `PIXELVIEW_W/H` | 90, 222 | Pixel grid dimensions |
| `PIXELVIEW_SCALE` | 3 | Display scale factor |
| `PIXELVIEW_DRAG_THRESHOLD_PX` | 16 | Min drag distance before pixel-drag activates |
| `DH_STRIPE_ANTIALIAS_PX` | 3.0 | Histogram stripe AA threshold (pixels) |
| `MAX_N_HEARTS` | 720 | Heart particle pool size |
| `HEART_MIN/MAX_RAD` | 4.5, 14 | Heart radius range |
| `HM_SHUFFLE_PROBABILITY` | 0.08 | Per-frame probability of removing a bad heart |
| `MALE_BLUE_AMOUNT` | 45 | Blue channel boost for male-coded breakups |
| `BALLOON_SHOW_AUTHOR_NAME` | true | Show author name in balloons |

---

## Known Issues / Notes

- `drawDraft()` in `sketch.js` renders a semi-transparent "DRAFT" watermark — still in development mode.
- `heart_manager.js` collision response has a faithful typo from the original Java: `Hi.vy = HEART_COLLISION_DAMPING * (Hi.vx + fy * imassInv)` (uses `vx` instead of `vy`). Do not "fix" this without careful testing.
- `initiateHeartsFromList()` now evicts the least-similar heart when the pool is full (added to support histogram day-click seeding many hearts). This behavior may need to be reverted.
- Several diagnostic `console.log` calls are commented out throughout (histogram clicks, text loading stats).
- `pixelDensity(2)` and `noSmooth()` are set in `setup()` for crisp pixel rendering on retina displays.

---

## Todo

* Import word2vec bigram UMAP dimensions to compute differences better. 
* Modify physics to better reflect clusters and similarity, perhaps via flocking.
* Incorporate 'favorites' from [here](https://artport.whitney.org/commissions/the-dumpster/selected.html), perhaps preloaded, perhaps with a star button. 
* Slow down autoplay, make more rhythmic
* Modify aspect ratio for final screen
* Have blue square respond to mouseovers in magnification loupe
* Have mouseDrag outside canvas still affect interior? 
* Put credit byline in lower left in pixel font
* Pulsate big yellow circle; animate with noise to stir pot
* Installation version uses precomputed sentence-level transformer embeddings + cosine distance; online version uses UMAP bigrams. 