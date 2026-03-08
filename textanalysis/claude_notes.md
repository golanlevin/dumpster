# Claude's Notes on the textanalysis/ Pipeline

## What this pipeline does

Starting from the raw cleaned text files in `text_cleaned/`, this pipeline:

1. **Extracts bigrams** (`ngrams.py proc1()`) — lowercases and tokenizes all text clips, builds a vocabulary of the 9,999 most frequent consecutive word-pairs (bigrams, joined as `word1+word2`). Rare bigrams are replaced with the `___` token.

2. **Trains word2vec** (`w2v_runner.sh`) on the bigram corpus — 128 dimensions, CBOW model, window=10, 20 iterations. Output: `output/vectors_2g.txt`, one 128D vector per bigram.

3. **Vectorizes each text clip** (`ngrams.py proc2()`) — for each of the ~20,000 text clips, averages the 128D vectors of all its bigrams. Clips the `___` vector for out-of-vocabulary bigrams. Output: `output/vect_2g.txt`, one 128D vector per clip.

4. **Reduces to 3D via UMAP** (`embed.js`) — runs `umap-js` (nComponents=5, default nNeighbors) on the 128D clip vectors, step-by-step. The first 3 of the 5 output dimensions were subsequently exported as `port_02/data/text_bigrams_umap_3d.tsv`.

The result is a data-driven, content-based similarity metric: two breakup stories with similar vocabulary and phrase patterns will be geometrically close in the 3D UMAP space.

---

## The TSV file: `port_02/data/text_bigrams_umap_3d.tsv`

- **20,038 rows**, one per breakup record, IDs `00000`–`20037` — exactly matching `N_BREAKUP_DATABASE_RECORDS`.
- **No header row.** Tab-separated, 4 columns: `ID  X  Y  Z`
- **Approximate coordinate ranges:**
  - X: roughly `[-5.0, +0.4]`
  - Y: roughly `[4.9, 8.3]`
  - Z: roughly `[1.7, 4.5]`
- The three axes have **different scales** — raw Euclidean distance in this space is biased toward X. Normalization is required before using as a distance metric (see below).

---

## How the existing similarity metric works (for comparison)

`BreakupManager.computeSimilarityOfAllBupsToCurrBup()` combines five distance/similarity measures:

| Component | What it measures | Weight |
|---|---|---|
| `distancesByLang` | Euclidean distance in 7D linguistic feature space (profanity rate, exclamation rate, capitalization, etc.) | 0.20 |
| `similaritiesByTag` | Shared language bit-flag tags | 0.30 |
| `similaritiesByKamal` | Shared "kamal" category tags | 0.40 |
| `similaritiesByAccess` | Shared demographic tags (sex, fault, instigator, themes) | 0.40 |
| `distancesByAge` | Age difference (capped at 5 years) | 0.10 |
| `distancesByLen` | Summary length difference | 0.05 |

The 7D linguistic features (`languageData[]`) — ego-word rate, exclamation rate, profanity rate, capitalization, etc. — are hand-crafted proxies for writing style. They capture *how* someone wrote, but not *what* they wrote about. The UMAP coordinates are strictly superior for semantic content similarity.

The tag-based and demographic components (`similaritiesByTag/Kamal/Access`, age) are **metadata** rather than text content, and remain meaningful independently. They should be kept.

---

## Integration roadmap

### Step 1: Load the TSV

In `sketch.js` `preload()`, add:
```js
var _umapLines;
// ...
_umapLines = loadStrings('data/text_bigrams_umap_3d.tsv');
```

Pass `_umapLines` into `BM.loadFromAssets()` as a new last argument.

### Step 2: Parse and normalize in BreakupManager

Add `_loadUMAPCoords(lines)` to `BreakupManager`:

```js
_loadUMAPCoords(lines) {
  this.UMAP_X = new Float32Array(N_BREAKUP_DATABASE_RECORDS);
  this.UMAP_Y = new Float32Array(N_BREAKUP_DATABASE_RECORDS);
  this.UMAP_Z = new Float32Array(N_BREAKUP_DATABASE_RECORDS);

  // Parse raw values
  for (let i = 0; i < lines.length && i < N_BREAKUP_DATABASE_RECORDS; i++) {
    const parts = lines[i].split('\t');
    if (parts.length < 4) continue;
    this.UMAP_X[i] = parseFloat(parts[1]);
    this.UMAP_Y[i] = parseFloat(parts[2]);
    this.UMAP_Z[i] = parseFloat(parts[3]);
  }

  // Min-max normalize each axis to [0, 1]
  const normalize = (arr) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) {
      if (arr[i] < lo) lo = arr[i];
      if (arr[i] > hi) hi = arr[i];
    }
    const range = hi - lo || 1;
    for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) arr[i] = (arr[i] - lo) / range;
  };
  normalize(this.UMAP_X);
  normalize(this.UMAP_Y);
  normalize(this.UMAP_Z);
}
```

Call this from `loadFromAssets()`.

### Step 3: Replace language distance with UMAP distance

In `computeSimilarityOfAllBupsToCurrBup()`, replace the `distancesByLang` computation block with:

```js
const cx = this.UMAP_X[this.currentlySelectedBreakupId];
const cy = this.UMAP_Y[this.currentlySelectedBreakupId];
const cz = this.UMAP_Z[this.currentlySelectedBreakupId];

let maxUMAP = 0;
for (let i = 0; i < N; i++) {
  const dx = this.UMAP_X[i] - cx;
  const dy = this.UMAP_Y[i] - cy;
  const dz = this.UMAP_Z[i] - cz;
  const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
  this.distancesByLang[i] = d;  // reuse existing array
  if (d > maxUMAP) maxUMAP = d;
}
if (maxUMAP > 0) {
  const inv = 1.0 / maxUMAP;
  for (let i = 0; i < N; i++) this.distancesByLang[i] *= inv;
}
```

Remove the contrast-enhancement block that follows (the ±2σ clamping), since UMAP distances are already well-behaved and don't need it. Keep the weight of 0.20 on `langDist` in the final similarity formula, or increase it since the new metric is much more meaningful.

The existing `stdvLangDistance` / `meanLangDistance` fields are computed from the old `distancesByLang`; they're only used internally in the contrast-enhancement step, so they can be left as dead code or removed.

### Step 4: (Optional) Increase UMAP weight in similarity formula

Once you've verified the UMAP distance produces reasonable visual results, consider increasing its weight in the blend. A reasonable starting point:

```js
// Old: 0.05*lenDist + 0.10*ageDist + 0.20*langDist + 0.30*tagSimil + 0.40*accSimil
// New:
theSimilarity = 0.05*lenDist + 0.10*ageDist + 0.40*umapDist + 0.30*tagSimil + 0.40*accSimil;
```

(The weights sum > 1 in the original too — normalization at the end handles that.)

### Step 5: (Optional) Update PixelIndexer sort

`PixelIndexer._sort2_AgeByLanguage()` currently sorts within each age cohort by `langMetric` (a crude proxy: `summaryLen/255 + profanity + capitalization`). A more meaningful sort would use one of the UMAP axes, e.g. `UMAP_X` as a "content spectrum" axis within each age row. This would require either storing UMAP data on each `Breakup` object, or passing a reference to the BM arrays into `PixelIndexer`. This is a lower-priority change — the visual structure of the pixel view would shift, which may or may not be desirable.

---

## Summary

The UMAP 3D coordinates are a complete, ready-to-use drop-in replacement for the language distance component of the similarity metric. The file is already in the right location, has the right number of records, and is straightforwardly parsed. The main work is ~30 lines of code across `sketch.js` and `breakup_manager.js`. Everything else (tags, age, length) stays the same.

---

## Evaluation

> *Is the idea of using UMAP dimensions of word2vec'd bigrams, a sound way of measuring distance between text snippets?*               
                                                                                                                        
⏺ It's reasonable for the purpose and era, but has some genuine weaknesses worth knowing about.                                       
                                                                                                                                      
What works well:      
                                                                                                              
  - Bigrams over unigrams is a smart choice for this corpus. "broke up", "didn't care", "best friend" carry more meaning as units than
   their component words.                                                                                                             
  - Averaging word2vec vectors over a document is a simple but legitimate technique for short texts. It degrades gracefully — the mean
   is dominated by content words.
  - Learning vectors from the corpus itself means the geometry reflects how this community uses language, not general English.
  "cheated" and "unfaithful" will be close because Dumpster writers use them interchangeably, even if a general-purpose model might
  not know that.

The significant weakness: 3D UMAP distances are not a reliable metric.

  This is the most important caveat. UMAP is a manifold learning algorithm — it's designed to preserve local neighborhood structure
  for visualization. It explicitly does not preserve global distances. Two texts that are genuinely dissimilar in 128D space may
  appear close in 3D UMAP if the manifold folds them together. The converse is also true.

  Going from 128D → 3D is a 97.6% dimensionality reduction. At 3D, many meaningful distinctions are collapsed. Using those coordinates
   as a distance metric treats a visualization artifact as ground truth.

What would be more principled:

  - Use the 128D clip vectors directly (vect_2g.txt), computing cosine similarity there — this is where the actual word2vec geometry
  lives
  - Or reduce to a higher intermediate dimension (20–30D via PCA or UMAP) that preserves more structure before computing distances
  - In 2025, a pre-trained sentence embedding model (SBERT, or any of OpenAI's/Cohere's text embedding APIs) applied to the raw texts
  would be substantially better, because they encode meaning rather than just co-occurrence statistics from a small corpus of 20k
  documents

Bottom line for the Dumpster:

  It's meaningfully better than the existing heuristics (which measure profanity rate and exclamation marks, not content). For an art
  installation where "interestingly related" matters more than strict semantic correctness, the 3D UMAP approach will produce
  plausible-looking clusters and neighbors. But don't expect the distances to be a reliable measure of how similar two stories
  actually are — they're more like a rough topological sketch than a metric.

  If you wanted a quick upgrade without rerunning the pipeline, using the 128D vectors in vect_2g.txt directly (computing cosine
  distance at query time) would be more principled, though you'd need to decide how to handle the computational cost of ~20k dot
  products per selection.

---

> Suppose, for a moment, that it was practical to store and fetch (N^2)/2 precomputed distance values for all of the texts. In other  
words, suppose I (offline) precomputed the distance from each of the 20K texts to every other. (This could conceivably be stored in a 
 huge image.) What would be an achievable, state-of-the art way of computing these distances in 2026?                                 
                                                                                                                                      
⏺ In 2026, the right answer is sentence-level transformer embeddings + cosine distance, and the whole pipeline is surprisingly cheap. 
                  
  The approach                                                                                                                        
                                                                                                                                      
### Step 1: Embed each text with a sentence transformer.                                                                                
                                                                                                                                      
  Modern sentence embedding models (trained specifically for semantic similarity rather than next-token prediction) encode a full text
   into a single dense vector that captures meaning, not just word co-occurrence. "He never really loved me anyway" and "I realized
  she had never actually cared" end up close together — even sharing no bigrams — because the model understands semantic equivalence.

Good choices in 2026:

  - OpenAI text-embedding-3-large (3072D, reducible via matryoshka) — trivially cheap: 20,000 texts × ~50 tokens = ~1M tokens ≈ $0.01
  total
  - Open-source: top entries on the https://huggingface.co/spaces/mteb/leaderboard — models like GTE-Qwen2-7B-instruct, nomic-embed-text-v1.5, or mxbai-embed-large-v1 run locally for free and are competitive with API models

All of these are strictly superior to bigram word2vec for this task, because they understand sentence-level semantics, negation, idiom, and emotional register — exactly what matters for breakup stories.

### Step 2: Compute pairwise cosine distances.

  With all 20,000 embeddings in a matrix X (shape 20000 × D), the full distance matrix is:

```
  X_norm = X / np.linalg.norm(X, axis=1, keepdims=True)
  similarity = X_norm @ X_norm.T          # 20000 × 20000, range [-1, 1]
  distance = (1 - similarity) / 2.0       # normalize to [0, 1]
```

This is a single matrix multiply. On a modern GPU it takes a few seconds even at D=3072. On CPU with numpy, maybe a minute.

### Step 3: Quantize and encode as RGBA PNG.

  Your existing distmat_sqrt.png pipeline already does exactly this — it packs distance values into an RGBA image where 4 channels ×
  width × height = ~200M values for the upper triangle. You could reuse that format and encoding/decoding code entirely. Quantizing to
   uint8 (0–255) loses some precision but is perfectly adequate for "is this story more or less similar than that one."

  Why this is much better than the existing approach

  ┌────────────────────────────────┬────────────────────────────────────────┬─────────────────────────────────────────────────────┐
  │                                │  Existing (bigram word2vec + UMAP 3D)  │            Sentence transformer + cosine            │
  ├────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Semantic understanding         │ Co-occurrence statistics               │ Full sentence meaning                               │
  ├────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Handles paraphrase             │ No                                     │ Yes                                                 │
  ├────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Dimensionality used at query   │ 3 (after lossy UMAP)                   │ Full embedding (128–3072D)                          │
  │ time                           │                                        │                                                     │
  ├────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Training corpus                │ 20K Dumpster texts only                │ Billions of documents                               │
  ├────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Distance reliability           │ Poor (UMAP global structure is         │ Strong (cosine in embedding space is the intended   │
  │                                │ unreliable)                            │ metric)                                             │
  └────────────────────────────────┴────────────────────────────────────────┴─────────────────────────────────────────────────────┘

### The one thing to consider

  Cross-encoder models (which jointly score a pair of texts rather than embedding them independently) would be even more accurate, but
   require O(N²) inference calls — 200M forward passes — which is completely impractical even offline. Bi-encoder sentence
  transformers (embed each text once, compare vectors) are the right architecture for this precomputation scenario.

  Practical upshot: an afternoon of work — run the embeddings through an API or local model, one numpy matrix multiply, encode as PNG
  using the existing format — and you'd have a genuinely state-of-the-art distance matrix ready to drop in.

---


> Estimate the storage footprint for the precomputed similarity-matrix image. Assume it is a PNG.                                     
                                                                                                               
⏺ Number of values:                                                                                                                   
  (20,038 × 20,037) / 2 = 200,750,703 unique pairwise distances.                                                                    
                                                                                                                                      
  Raw storage (before PNG compression):                                                                                             
  - uint8 (0–255): ~191 MB                                                                                                            
  - uint16 (0–65535): ~382 MB                                                                                                       

uint8 is probably sufficient — 256 levels of similarity distinction is plenty for "more/less similar" comparisons.

  As PNG:

  PNG uses DEFLATE after row-prediction filtering. Compression quality depends on how correlated adjacent pixel values are. A semantic
   distance matrix has some block structure (clusters of similar texts produce regions of similar values), but is also fairly
  high-entropy overall. Expect modest compression — roughly 20–35% reduction:

  - uint8 PNG: ~125–155 MB
  - uint16 PNG: ~250–310 MB

If the matrix rows are sorted by semantic clusters rather than arbitrary ID order, adjacent entries become more correlated and PNG
  compresses noticeably better — potentially pushing uint8 down toward 100 MB.

  Runtime memory (decoded in browser):

  Regardless of PNG compression, once decoded the data occupies its full raw size in memory. uint8 = ~191 MB as a flat JavaScript
  Uint8Array. That's the harder constraint for a browser-based installation.

  For comparison: your existing distmat_sqrt.png is a 7240×6932 RGBA image = 200,737,920 bytes of distance data — almost exactly the
  right capacity, which confirms the RGBA packing approach already works at this scale. The new matrix would be essentially the same
  image dimensions with better-quality distance values inside.

---

> Currently, `text_bigrams_umap_3d.tsv` only uses 3 dimensions from UMAP, and this file is 734kb. It sounds like I could meaningfully improve the quality of cosine distance by using more dimensions from UMAP -- you recommended 20-30, but certainly 5 would be a trivial improvement, right? I'm thinking that the *online* (web) version of this project should use the UMAP/word2vec/bigram approach, while the *installation* version (in the physical museum) could load the 50-200MB data file precomputed with sentence-level transformer embeddings + cosine distance. What do you think of that plan?                                                            
                                                                                                                                      
⏺ The two-tier plan is well-considered. A few thoughts on each part:                                                                  
                                                                                                                                      
  On adding more UMAP dimensions                                                                                                      
   
  Yes, 5D is a genuine improvement over 3D — not marginal. Each additional dimension gives the manifold more room to express          
  distinctions that were previously collapsed. The improvement from 3→5 is large; 5→10 is meaningful; 10→20 is diminishing but still
  worthwhile. The file size scaling is trivial:

  ┌─────────────┬──────────────────┐
  │ Dimensions  │ Approx. TSV size │
  ├─────────────┼──────────────────┤
  │ 3 (current) │ 734 KB           │
  ├─────────────┼──────────────────┤
  │ 5           │ ~1.1 MB          │
  ├─────────────┼──────────────────┤
  │ 10          │ ~2.1 MB          │
  ├─────────────┼──────────────────┤
  │ 20          │ ~4.1 MB          │
  └─────────────┴──────────────────┘

  All comfortably web-deliverable. I'd suggest 10–15D as a sweet spot — a big quality jump from 3D at under 3MB. The distance
  computation at query time (20,000 Euclidean distances in 10–15D) is essentially instantaneous in JavaScript.

  One practical note: you'll need to re-run the UMAP embedding on vect_2g.txt with a higher nComponents value and re-export. The
  existing TSV only captured 3 of however many were computed. That's a one-time offline operation using the existing embed.js
  framework.

  Also worth considering: at higher dimensions, cosine distance becomes preferable to Euclidean. UMAP doesn't normalize coordinate
  magnitudes, so raw Euclidean distances get dominated by dimensions with larger spread. Cosine distance (angle between vectors) is
  scale-invariant and better reflects directional similarity in embedding space.

  On the two-tier plan

It's sound, and the right way to think about the tradeoff:

  - Online: fast load, decent quality, fully self-contained — word2vec bigrams + UMAP is far better than the current heuristics and
  costs nothing at runtime beyond a few-MB TSV
  - Installation: startup latency is acceptable on dedicated hardware, the full sentence-transformer matrix delivers noticeably better
   "these stories feel related" behavior which matters more in a museum context where visitors are reading the actual text

The one thing to plan for architecturally: the installation's distance lookup is O(1) per pair (array index into decoded PNG),
  whereas the online version recomputes all ~20K distances on each selection. Both are fast, but they'd call different code paths.
  Worth designing BreakupManager so the similarity computation can be swapped — either computing from UMAP coordinates or reading from
   a preloaded flat array — without changing anything else.
