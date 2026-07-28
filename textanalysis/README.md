Materials related to the revised (2020-21) analysis and loading of Dumpster texts. 

For text analysis, run in this order:

- `words.py` (`proc1()`) extract words from the corpus.
- `ngrams.py` (`proc1()`) extract n-grams from the corpus
- `w2v_runner.sh` run word2vec on the extracted words/n-grams
- `words.py` (`proc2()`) generate vector for each text clip from vector of the words it contains
- `ngrams.py` (`proc2()`) generate vector for each text clip from vector of the ngrams it contains
- `matrix.py` generate distance matrix for the text clips, encoding PNG
- `checkloss.py` check how much the PNG encoding of the distance matrix deviate from true values
- `embed.js` dimensionality reduction for the vectors, using UMAP
- `draw.js` generate SVG visualization of the embedding
- `draw_5d.js` generate SVG visualization of 5-dimensional embedding (RGBXY)

Explanation:

word2vec computes a 128 dimensional vector from each word in the corpus. For each text clip, the vectors of each word are averaged, using just simple mean. Each text clip is now also represented by a 128 dimensional vector. Run UMAP on these vectors, to embed the text clips into desired dimensions.


For encoding text as image for loading into the display, run in this order:

- encode all text clips into single image
    - first algorithm: `text2img.py`. The algorithm encodes 63 alphanumeric characters with 6 bits, and symbols with 12 bits.
    - alternatively, second algorithm: `text2img2.py`. The algorithm uses either 1 or 2 or many bytes for each word, based word frequency in the corpus. It also outputs a `text2_words.txt` that lists the words by frequency, required to decode the image.
- `check_text2img.py` load and print the image to see if it looks alright.


Who output who:
|script|output|
|---|---|
|`draw_5d.js`|`vis/embed(.+?)_5d.svg` based on `name` variable|
|`draw_text.js`|`vis/embed_text.svg`|
|`draw.js`|`vis/embed_([^_]+?).svg` based on `name` variable|
|`embed.js`|`output/embed_*.txt` based on last line|
|`matrix.py`|`output/distmat.png`(deprecated) `output/distmat_sqrt.png`|
|`ngrams.py proc1()`|`output/corp_2g.txt` `output/word_2g.txt`|
|`ngrams.py proc2()`|`output/vect_2g.txt`|
|`text2img.py`|`output/text.png`|
|`w2v_runner.sh`|`output/vectors.txt` or `output/vectors_2g.txt`|
|`words.py proc1()`|`output/corp.txt` `output/word.txt`|
|`words.py proc2()`|`output/vect.txt`|
|`https://pngquant.org/`|`output/distmat_quant.png` `output/distmat_sqrt_quant.png`|


For cleaning up html garbage in the text, unzip text.zip, put it in this folder, duplicate it, rename the duplicate to `text_cleaned` and run `cleanup.py`.

---

* textanalysis/output/vect.txt is the coordinate of each clip
* embed_text.txt is the umap embedding of each clip
embed_text_2g is the umap embedding of 2 grams of each clip



---

## 2026 addition: similarity regimes for the app (see `notes_july27.md`)

The app's content-similarity channel is pluggable (regimes 1/2/3, keys `1`/`2`/`3`).
Regimes 2 and 3 are fed by binary `DMPE` assets generated here.

| Script | Needs venv? | Purpose |
|---|---|---|
| `make_embedding_asset.py` | no | Any embedding table → `DMPE` int8 binary + manifest entry |
| `make_sbert_embeddings.py` | **yes** | Corpus → sentence-transformer vectors (`output/vect_sbert.txt`) |

### Regime 2 — word2vec bigrams (128D)

Uses `output/vect_2g.txt`, already present. No venv needed:

```sh
python3 make_embedding_asset.py
# -> p5Dumpster/port_03/data/bigram_w2v_128_int8.bin  (2.45 MB)
```

### Regime 3 — sentence transformer (384D)

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt          # sentence-transformers; ~1 GB installed

python make_sbert_embeddings.py          # -> output/vect_sbert.txt
python make_embedding_asset.py --input output/vect_sbert.txt \
    --regime 3 --output sbert_384_int8.bin --label SBERT-384
# -> p5Dumpster/port_03/data/sbert_384_int8.bin  (7.3 MB)
```

Model is `BAAI/bge-small-en-v1.5`, cached in `models/` (gitignored). Downloaded once from
HuggingFace; `--offline` afterwards refuses network access entirely. **The app itself never
contacts a server** — it loads a static binary. These deps are build-time only.

`requirements.txt` pins the direct dependency; `requirements-lock.txt` has the full resolved
tree as installed 2026-07-27 on Python 3.14.5, for reproducing the exact build later.
