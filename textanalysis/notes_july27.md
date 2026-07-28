# Text-Matching Regimes: Assessment and Plan

*2026-07-27. Written in response to a request to confirm/correct an understanding of the
three similarity regimes, elaborate on them, and propose a plan. Based on reading
`p5Dumpster/port_03/README.md`, `textanalysis/README.md`, `textanalysis/claude_notes.md`,
and the `port_03` source, plus measurements taken on this machine (see
[Appendix: how the numbers were obtained](#appendix-how-the-numbers-were-obtained)).*

---

I've read all three docs and the actual code, plus measured a few things. Your understanding
is mostly right, but **two of its load-bearing premises are wrong**, and correcting them
simplifies the project considerably.

## 1. Confirmations and corrections

**✓ Correct:** regime 1 (the 2005 heuristics) is what's live.
`BreakupManager.computeSimilarityOfAllBupsToCurrBup()` blends six channels — 7D "language"
Euclidean (0.20), language tags (0.30), kamal tags (0.40), access tags (0.40), age (0.10),
summary length (0.05) — then normalizes by max. Only the 0.20 channel is text-content-ish,
and it measures profanity rate, exclamation rate and capitalization, i.e. *how* someone
typed, not what happened to them.

**✗ "It's possible the UMAP version may already be implemented."** It isn't, anywhere.
`port_03/sketch.js` `preload()` never loads the TSV, and `breakup_manager.js` has no UMAP
code. `port_01/sketch.js:52` *does* `loadTable()` it — and then the only three lines that
would read it (`:114–116`) are commented out. The file has been sitting in all three
`data/` dirs unused.

**✗ "UMAP is the practical online choice; transformers are installation-only."** This is
the important one. It follows from the earlier notes' assumption that the transformer
regime means precomputing an N²/2 distance matrix (~191 MB). It doesn't. You ship the
**embeddings** (20,038 × D), not the pairwise matrix, and compute distances at query time —
exactly as you would with UMAP coordinates. Measured on this machine, flat `Int8Array`
dot-product scans over all 20,038 records:

| Embedding | Asset size (int8) | Per-selection scan |
|---|---|---|
| 128D — word2vec bigrams *(on disk now)* | 2.4 MB | 2.8 ms |
| 256D — `text-embedding-3-large` matryoshka | 4.9 MB | 5.8 ms |
| 384D — `gte-small` / MiniLM | 7.3 MB | 8.6 ms |
| 768D — `nomic-embed` / mpnet | 14.7 MB | 17.1 ms |

A 4.9 MB asset is thoroughly web-deliverable. **The transformer regime is viable online**,
so the two-tier split is probably unnecessary — and the 191 MB matrix is a phantom
constraint.

**✗ "3D UMAP is a decent online metric."** I measured it against the 128D space it was
reduced *from*: **recall@20 = 8.4%**, Spearman ρ = 0.50 (40 queries / 20,000 random pairs).
It discards ~90% of its own source's neighborhood structure. And the 128D source vectors
are already on disk at `textanalysis/output/vect_2g.txt` — 2.4 MB as int8, 2.8 ms/scan, and
they give visibly sensible neighbors:

> **query:** *"i broke up wit katie long time ago and now im single so yea its tight but goin skatin…"*
> **nn 1 (0.82):** *"…i broke up wit jen so now im single again that's it realy so if yall wana chil…"*
> **nn 2 (0.77):** *"hey yallz well its me kyky and i broke up im single and flriting and going crazy lol!"*

So **regime 2 should be redefined**: not "UMAP distance" but "128D bigram-word2vec cosine."
UMAP goes back to being a *layout* tool, which is what it's actually good at — and that's
exactly what your goal (D) needs.

**Two smaller factual notes.** The existing TSV is a UMAP of *clip* vectors (each clip =
mean of its bigrams), not of bigrams; the 5D files (`embed_2g_5d.txt`, `embed_5d.txt`) are
UMAPs of the 9,999-bigram *vocabulary*, so there's no higher-D clip embedding lying around
to re-export. And `vect_2g.txt` is keyed by filename in traversal order (`09996` first),
while the app indexes by integer `bupId` — any new asset needs re-sorting into ID order,
which the existing TSV already is.

**Good news for regime 3:** the raw corpus is present at
`TheDumpster/data/text_cleaned.zip` — 20,038 files, verified extractable.

## 2. The three regimes

**Regime 1 — 2005 heuristics.** Six hand-weighted channels. Its content channel is a style
proxy. Its *metadata* channels (tags, demographics, age) measure things no text embedding
can, and they're what makes the PixelView's row structure legible. Those should stay. Only
`distancesByLang` should go.

**Regime 2 — corpus-trained word2vec bigrams.** Train w2v on the corpus's own bigrams,
average each clip's bigram vectors → one 128D vector per clip. Its real strength is that
the geometry reflects *how this community wrote in 2005* — "cheated" and "unfaithful" are
close because these writers used them interchangeably. Everything needed is already
computed; the work is one offline reorder-and-quantize script plus ~40 lines of runtime.

Its weakness is the mean-of-vectors representation: very short clips are extreme outliers.
*"Me and Rob broke up."* came back as the **farthest** clip for all three of my test
queries. That's an artifact of averaging over 3 bigrams, not semantics.

**Regime 3 — sentence transformers.** Embed each clip with a bi-encoder trained for
semantic similarity. Handles paraphrase and negation ("he never really loved me" ≈ "I
realized she'd never actually cared" with zero shared bigrams), and largely fixes the
short-text problem. Costs one offline embedding pass: ~20k texts × ~60 tokens ≈ 1.2M
tokens — minutes on a local model, or ~$0.02 via API. Runtime cost is identical in kind to
regime 2, just a larger D. This is straightforwardly the best metric, and the only reason
not to make it the default everywhere is if you want the period-authentic 2005-corpus
flavor of regime 2.

**One constraint the earlier notes missed.** `informOfNewlySelectedBreakup()` is called from
`_enactPixelDrag()` **every frame** while the user drags across the PixelView — so this
scan lives inside the 16 ms frame budget, not as a one-off on click. That's what caps
usable D: 128–256D is comfortable, 768D+ would need throttling. Worth measuring the current
cost before and after.

## 3. Proposed plan

**Phase 0 — make the metric swappable, no behavior change.** Pull the content channel
behind a tiny interface (`provider.fillContentDistances(selId, outFloat32Array)`), with the
2005 heuristic as one implementation. Add a key/URL toggle so you can A/B live. This is the
"design BM so similarity can be swapped" advice from `claude_notes.md`, and it's what makes
everything after cheap.

**Phase 1 — 128D word2vec channel.** Offline: `vect_2g.txt` → reorder to ID order →
L2-normalize → int8 → `data/bigram_w2v_128_int8.bin` (2.4 MB). Runtime: flat `Int8Array`,
dot-product scan. Replace `distancesByLang`, delete the ±2σ contrast hack (it exists to
rescue a bad metric), retune weights. No new models, no API, nothing to download — a large
quality jump from data already on disk.

**Phase 2 — transformer channel.** Unzip the corpus, strip author lines to match
`getBreakupText()` semantics, embed at 256D (`text-embedding-3-large` truncated, or
`nomic-embed-text-v1.5` matryoshka), run the same quantize script → 4.9 MB. Same provider
interface, only D differs. Then evaluate against Phase 1 — recall overlap plus eyeballing
~20 query/neighbor sets — and decide whether word2vec stays as an option or gets retired.

**Phase 3 — the drag path.** Measure `computeSimilarityOfAllBupsToCurrBup()` cost per frame
during pixel-drag. If tight, recompute on a 3–4 frame cadence during drag, and precompute a
top-K neighbor table (20k × 64 × uint16 = 2.6 MB) so goal (C)'s heart-spawn biasing is an
O(1) lookup instead of a scan.

**Phase 4 — the visuals (A–D).** (A) and (B) improve for free once `SIMILARITIES` is better.
(C) becomes sampling from the top-K table instead of the current
rejection-sample-against-the-mean in `addWellMatchingHeartRandomly()`. (D) is where UMAP
earns its keep: a 2D UMAP layout gives every clip a stable *direction*, so similar hearts
flock toward the selection and dissimilar ones have somewhere coherent to go — that's
preserving local neighborhoods for spatial arrangement, which is exactly UMAP's job.

**Phase 5 — decide on tiers.** At 4.9 MB you likely ship one build for both web and museum.
If you still want a premium tier, it's "bigger D" (768D = 14.7 MB), not a precomputed
matrix.

## Open questions

Four things I'd want your call on before Phase 1:

1. Should the transformer/w2v channel **replace** the 7D language distance, or sit alongside
   it as a 7th channel? (I'd replace — it's the same job done badly.)
2. Keep the 2005 heuristics as a switchable mode permanently, or only as scaffolding during
   evaluation?
3. Local model or API for the embeddings — any offline/reproducibility constraint for the
   installation?
4. Should the PixelView's **sort order** change to content-based
   (`PixelIndexer._sort2_AgeByLanguage` currently sorts within age cohorts by the crude
   `langMetric`)? It'd make the pixel field's structure meaningful, but it visibly changes
   the piece's signature look — that's an aesthetic call, not a technical one.

Also, a drive-by bug in code we'll be touching: `informOfNewlySelectedBreakup()`
(`breakup_manager.js:142`) guards with `bupId > 0 && bupId <= N_BREAKUP_DATABASE_RECORDS`,
so breakup **0** is treated as invalid and 20038 is accepted. Should be `>= 0 && <`.

---

## Addendum (same day): decisions taken, and the frame-budget question answered

Decisions confirmed: the content channel **replaces** the 7D language distance rather than
sitting beside it; all three regimes stay switchable at runtime via keys **1/2/3**; the
embedding generator uses a **local model only** (no network, at build time or run time);
**4.9 MB / 256D for both online and installation** — one build, no tiers; PixelView keeps its
age-vertical and sex-horizontal grouping, with content-based organization *within* those groups
still to be designed.

### Phase 0 is built

`similarity_providers.js` holds `HeuristicContentProvider` (regime 1) and
`EmbeddingContentProvider` (regimes 2 and 3, identical code differing only in asset and dims).
`BreakupManager` calls `activeProvider().fillContentDistances()` and falls back to regime 1 when
an asset is absent. Verified **bit-identical** to the pre-refactor output across 7 selections
(max |new − old| = 0 exactly), with 20,038 non-zero similarities and unchanged means.

### The 20K×20K matrix is not needed

Measured per-channel cost of one full 20,038-record pass (Node/V8, this Mac, selection varied
per iteration to defeat loop-invariant hoisting):

| Channel | Cost |
|---|---|
| Content — regime 1, 7D Euclidean | 1.86 ms |
| Content — regime 3, 256D int8 cosine | ~5.8 ms |
| `computeLanguageTagNCommonalities` (4 × 32 bit tests) | 2.48 ms |
| `computeKamalTagCommonalities` (32 bit tests) | 0.69 ms |
| `computeAccessTagCommonalities` (10 bit tests) | 0.48 ms |
| *those three rewritten with popcount* | *0.51 ms* |
| **Total, as currently written** | **7.98 ms** |

So the content channel is *not* the bottleneck — the per-bit tag loops are, at 3.65 ms, and
popcount takes them to 0.51 ms. Projected total with 256D transformer embeddings **and**
popcount: **≈ 8.8 ms**, inside the 16 ms budget with room for physics and rendering.

A precomputed matrix row lookup would be ~0.02 ms, but it costs ~191 MB resident and only
addresses the cheaper half of the pass. **Recommendation: don't build it.** Do popcount in
Phase 3 and keep the matrix as a fallback if real-browser numbers disagree.

One measurement caveat: `performance.now()` is compressed under Chrome's
`--virtual-time-budget` (the text decoder reports 0.0099 s for work that really takes ~300 ms),
so the on-screen ms readout is only meaningful in a real browser. The table above is from Node.

### Phase 1 is built — regime 2 is live

`make_embedding_asset.py` (in this directory) reads `output/vect_2g.txt`, reorders to `bupId`
order, quantizes to int8 and writes `p5Dumpster/port_03/data/bigram_w2v_128_int8.bin`
(2,564,880 bytes = 2.45 MB), registering it in `data/embeddings.json`. No third-party deps.

Quantization detail worth remembering: each row is scaled by **its own largest absolute
component**, not by its L2 norm. Cosine is invariant to a positive per-row scale and the app
recovers exact cosine of the quantized rows via per-row inverse norms, so this is free — and it
buys ~1.7 bits, because L2-normalized 128D components cluster near 1/√128 ≈ 0.09 and would
otherwise use only ~⅓ of the int8 range.

Verified: int8 vs float cosine over 199,980 pairs — mean error 6.4e-4, max 4.1e-3;
**recall@20 of int8 vs float ordering = 99.2%**. Quantization is effectively lossless for ranking.
`fillContentDistances` costs **3.3 ms**/pass (vs 1.86 ms for regime 1). Regime 1 remains
bit-identical after the refactor.

40 of the 20,038 clips have no in-vocabulary bigrams, so their vectors are all-zero. They're
written as zeros and treated as neutral (cosine 0, distance 0.5) rather than similar or
dissimilar. If such a clip is *selected*, every distance is 0.5, contrast enhancement finds
σ=0 and leaves them flat, and the content channel simply contributes nothing that frame —
metadata still drives. Correct degradation, no special case needed.

### The content weight is the next real decision

Averaged over 5 query clips, top-20 most-similar sets:

| Content weight | Mean content distance of top 20 | Overlap with current (heuristic, w=0.20) |
|---|---|---|
| heuristic, w=0.20 | 0.317 | 100% |
| w2v, w=0.20 | 0.156 | 47% |
| w2v, w=0.40 | 0.104 | 37% |
| w2v, w=0.80 | 0.056 | 26% |
| w2v, w=1.60 | 0.032 | 17% |

Left at **0.20** (the 2005 value) so regime switching is an honest A/B, but now exposed as
`CONTENT_SIMILARITY_WEIGHT` (later superseded by `SIM_SHARE_CONTENT` — see Stages 0 and 1 below).
Note the whole-PixelView image looks broadly similar between
regimes because metadata dominates most of the 20k pixels; it's the *top* matches — what the
hearts and balloons actually show — that shift substantially.

Qualitatively, for query 5982 (*"jd and i broke up awhile ago.. i love him still as much as i
did and i always will"*), regime 2's top four are all stories of lingering love after a
breakup, while regime 1's are unrelated breakups sharing punctuation and profanity statistics.
That case had 0% top-20 overlap between regimes.

### Phase 2 is built — regime 3 is live, but it is not a clear win over regime 2

`make_sbert_embeddings.py` embeds the corpus with `BAAI/bge-small-en-v1.5` (384D) from a venv
(`requirements.txt` / `requirements-lock.txt`, Python 3.14.5, torch 2.13). Model cached in
`models/` (gitignored, 137 MB); `--offline` afterwards refuses network entirely. Corpus read
straight from `TheDumpster/data/text_cleaned.zip` — all 20,038 records, author line stripped to
match `getBreakupText()`. 2 records are empty after cleaning and become neutral zero rows.
Asset: `sbert_384_int8.bin`, 7,694,608 bytes (7.34 MB). int8 vs float: mean cosine error 8.4e-4,
recall@20 96.0%.

**Anisotropy mattered a lot.** Raw bge-small embeddings sit in a narrow cone — random-pair cosine
mean 0.729, sd 0.063, p1–p99 only 0.52–0.85, and the 20th-nearest neighbour just 1.76 sd above the
mean (word2vec: 2.33). Mean-centering fixes it: mean 0.001, sd 0.113, 20th neighbour **3.38 sd**
out, and 55% of top-20 neighbour sets change. Added as `--center` in
`make_embedding_asset.py`; regime 3 is generated with it. Absent/zero rows are excluded from the
mean and left at zero so they stay neutral rather than landing at −μ.

**But on this corpus, regime 3 does not obviously beat regime 2.** Comparing *pure content
channel* rankings (not the blend — the 0.20 weight confounds any qualitative read):

- Query 1234 (*"I broke up with him. And it sucks. I don't know what else to say. I'm incapable
  of emotional closure"*): regime 3 wins — it returns *"the worst part is I don't understand it.
  Not at all"*, matching the inarticulate-confusion register, where regime 2 returns
  surface-level breakup reports.
- Query 5982 (*"i love him still as much as i did and i always will"*): regime 2 wins clearly —
  its matches are all lingering-love stories; regime 3's are thematically scattered.

Plausible reason: the corpus is short, misspelt 2005 netspeak, and the word2vec model was trained
**on this corpus**, so it encodes this community's idiom. bge-small is a small general-purpose
model trained on clean text. The earlier assumption that a transformer would be "strictly
superior" was too confident — for this corpus it's a genuine judgement call, and the switchable
regimes are the right way to settle it by eye. If regime 3 feels underwhelming, the lever is a
larger model (`bge-base`, or nomic-embed at 768D) rather than more tuning.

**Frame budget is now the binding constraint.** Full-pass cost, Node: regime 1 = 9.1 ms,
regime 2 = 9.2 ms, regime 3 = **14.5 ms** — inside 16 ms but with almost no headroom for physics
and rendering during a pixel-view drag. The popcount rewrite (~3 ms saving) has gone from
optional to worth doing before anything else is added to the pass.

### Regime 4 — nomic-embed at 256D

Added as a fourth regime rather than replacing bge-small, so all four are comparable by keypress
(`REGIME_KEYS` in `similarity_providers.js`; keys 1–4, `?regime=N`). Rationale: nomic-embed-text-v1.5
is ~137M params against bge-small's ~33M, and being matryoshka-trained it truncates to 256D
*principledly* — giving a **smaller** asset (4.9 MB vs 7.34 MB) and a **cheaper** scan
(~5.8 ms vs 8.6 ms) from a **bigger** model. That directly buys back the frame-budget headroom.

Two traps worth remembering:

1. **Matryoshka truncation is not plain slicing.** The recipe is layer-norm across the feature
   axis *first*, then slice, then L2-normalize. Slicing raw output measurably degrades the vectors.
   Gated behind `--matryoshka` in `make_sbert_embeddings.py`; plain slicing now warns.

2. **Long-context models default to enormous sequence lengths.** nomic-embed's
   `max_seq_length` is **8192**. The longest record in this corpus is 1849 bytes (~460 tokens),
   so at batch 64 the first run wasted memory and compute quadratically and the process died
   without writing anything to the log — almost certainly OOM-killed. Capping to 512 fixed it
   (~3 it/s at batch 32, roughly 3.5 min for the corpus). `--max-seq-len` now defaults to 512,
   which is also bge-small's native value, so it changes nothing for regime 3.

It also needs `trust_remote_code=True` (`--trust-remote-code`) and a task prefix; `clustering: `
is the right one for symmetric document-document similarity, and `--prefix` supplies it.

### popcount — done, and it invalidated my earlier timings

`popcount32()` in `breakup.js` replaces the 32-position bit walks in
`computeLanguageTagNCommonalities`, `computeKamalTagCommonalities`,
`computeAccessTagCommonalities` and `computeNBitsSet`. These are the *shared metadata* channels,
so all four regimes benefit. Result: **2.78 ms -> 0.40 ms (6.9x)**, verified byte-exact over
399,960 record pairs and all 20,038 records.

Two faithfulness details preserved:

- The original tested `(common & (1 << b)) > 0` for `b` up to 31. In JS `1 << 31` is negative, so
  that test could **never** count bit 31. The new code masks with `0x7FFFFFFF` to match. (Moot in
  practice: kamalTags needs 28 bits, languageTags 30, accessTags 9.)
- `computeAccessTagCommonalities` adds `sex`/`fault`/`instigator` *arithmetically* rather than as
  bit counts — matching `sex 2 & 2` contributes 2, not 1. That 2005 oddity is left alone; only
  the 10-bit theme loop became a popcount.

Also removed `this.bitValues` — a 32-element array that was being allocated **per Breakup
instance**, i.e. 20,038 of them.

**Correction to the numbers in the sections above.** All the earlier absolute timings in this
document came from a harness built on `vm.runInContext()`, where global function calls are much
slower than in normal module scope. That inflated everything touching a global by roughly 5-9x.
The most embarrassing symptom: after adding popcount, the `vm` harness showed the tag channels
getting *slower* (3.65 -> 8.14 ms), i.e. it reported a 7x win as a 2x regression. Measured
properly, by concatenating the scripts into a plain Node module:

| Regime | Full pass | % of 16 ms |
|---|---|---|
| 1 `HEURISTIC-7D` | 0.89 ms | 6% |
| 2 `W2V-128` | 3.74 ms | 23% |
| 3 `SBERT-384` | 14.63 ms | 91% |
| 4 `NOMIC-256` | 8.17 ms | 51% |

So the frame budget was never as tight as claimed for regimes 1 and 2 — the "7.98 ms" figure for
regime 1 was really 0.89 ms. The conclusion that popcount was worth doing still holds, and the
one genuine constraint is real: **regime 3 at 91% of a frame is too close to the edge**, while
regime 4 delivers comparable quality at 51%. That's an argument for regime 4 over regime 3 quite
apart from quality.

Lesson for future measurement: `<script>` globals behave like module scope, not like `vm`
globals. Benchmark in a plain module, and never trust a single harness for a claim this load-bearing.

### Stages 0 and 1 done — weights now mean what they say

**Stage 0, defects fixed.** Unknown age was scored 0.0, i.e. *maximally dissimilar*, penalising the
36.7% of records with no age — now `AGE_UNKNOWN_SCORE = 0.5`. Tag terms were gated on being
nonzero, so a record's maximum possible score varied 0.75–1.45 by which tag types it happened to
share, and max-normalization then put tag-sharers structurally at the top — gating removed.
Per-channel max-normalization removed, since one extreme record could set the scale for a whole
channel.

**Stage 1, standardization.** Every channel is z-scored over the valid records before weighting,
and the weights are `sqrt(share)` normalized so `sum(w^2) === 1`. That makes `SIM_SHARE_*` genuine
variance shares. The final blend is mapped to [0,1] at mean ± 2.5σ/3.0σ instead of by dividing by
the maximum — the old max-division squashed the whole field, because the selected record is
identical to itself and sits 2.3–7.9 sd above the corpus (measured over 120 selections). The
selection is then pinned to exactly 1.0 so a self-match reads `MATCH: 100`.

**Stages 2–3, shares set** to content 0.55, accessTags 0.25, age 0.10, kamalTags 0.10,
langTags 0.00, length 0.00.

Two findings that changed the plan:

- **langTags, not kamalTags, was the harmful channel.** Drop-one over 7 selections: removing
  langTags took the top-20's mean content distance from 0.111 to **0.035** — the biggest coherence
  gain available. Removing kamalTags made it *worse* (0.121), so kamal is mildly helping and was
  kept at 0.10. Removing content kept only 34% of the top 20, so content dominates *ranking* far
  more than its 6.5% variance share suggested — variance share and top-of-ranking influence are
  different quantities.
- **Shares are ceilings, not guarantees.** A channel with no spread for a given selection is
  skipped and its share redistributed. Measured over 120 selections: kamalTags dead 61.7% of the
  time, age 45.0%, langTags 38.3%, accessTags 6.7%, content never. So content's realized share is
  ~67% rather than the nominal 55%. This is correct behaviour — a channel that cannot discriminate
  for this selection shouldn't get a vote — but it means the nominal numbers read as upper bounds.

Cost is unchanged to within noise (regime 4: 6.5 ms full pass). Every metadata channel is close to
orthogonal to meaning (r with content: accessTags 0.115, langTags 0.042, kamalTags 0.034, age
0.011), so metadata supplies non-textual resonance rather than reinforcing semantics.

Visible consequence: mean similarity moves from ~0.30 to ~0.45, so the PixelView is noticeably
brighter and higher-contrast, and more hearts clear the `sim > 0.33` attraction threshold in
`heart.js` — expect more clustering around the selection. Both are tunable via
`SIM_CONTRAST_LO/HI_SIGMA` without touching the ranking, since that mapping is monotonic.

**Not yet done: Stage 4** (hygiene metrics — collapse, coverage, monopoly — which *are*
optimizable by search over the 5 shares) and **Stage 5** (triplet judgments for a defensible
fit). Neither is needed unless the current shares feel wrong by eye.

### Note on PixelView sub-ordering (open design question)

Within each (age cohort × sex band) block the ordering is currently `langMetric` then
`instigator`. Two candidate replacements:

1. **1D seriation** — order each sex-run of each row by a 1D content coordinate (spectral
   ordering of the block's cosine matrix, or 1D UMAP). Cheap, local, preserves the existing
   look most closely.
2. **2D assignment** — treat each block as a 2D pixel rectangle, run 2D UMAP on its clips, then
   solve a linear-sum assignment from UMAP positions onto grid cells. This is the "rectified
   using assignment" idea; it gives genuine 2D content structure at block scale.

Either way the ordering should be **precomputed offline and shipped as a permutation**
(20,038 × uint16 = 40 KB) rather than computed in `PixelIndexer` at startup — LAP is far too
slow to run in the browser, and it removes the current startup sort cost entirely.

---

## Appendix: how the numbers were obtained

Recorded here so the measurements can be re-run or challenged.

- **recall@20 = 8.4%, Spearman ρ = 0.50** — loaded `output/vect_2g.txt` (20,038 × 128D) and
  `output/embed_text_2g.txt` (20,038 × 3D), aligned them by filename key, L2-normalized the
  128D vectors for cosine and z-scored each UMAP axis so Euclidean distance there is
  unbiased. For 40 evenly-spaced query clips, took the top-20 neighbors under each metric
  and measured overlap. Spearman computed over 20,000 deterministic random pairs.
- **Scan timings** — synthetic flat `Int8Array` of 20,038 × D, naive nested-loop dot product
  against one query row, 20 iterations after warmup, Node v22.12.0. These are conservative:
  the real thing can hoist the query row into a local and skip invalid records.
- **Nearest-neighbor examples** — `text_cleaned.zip` extracted to a temp dir; neighbors
  computed by full 128D cosine scan. Three full 20k scans took 49 ms total in *unoptimized*
  Float64 array-of-arrays JS, which is what first suggested the int8 numbers above would be
  comfortable.
- **UMAP provenance** — `embed.js` runs `umap-js` with `nComponents: 5` over
  `output/vectors_2g.txt` (the 9,999-bigram *vocabulary*) and writes `embed_2g_5d.txt`.
  The clip-level 3D embedding in `embed_text_2g.txt` — the source of
  `data/text_bigrams_umap_3d.tsv` — came from a different run not preserved in this script.
