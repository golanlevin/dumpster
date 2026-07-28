// Content-similarity providers — the three "regimes".
//
// Each provider fills a caller-supplied array with a *content distance* in
// [0,1] for every record: 0 = most similar to the selection, 1 = least.
// BreakupManager blends that one channel with its metadata channels (tags,
// access, age, length) and does not care which regime produced it.
//
//   REGIME_HEURISTIC (key 1) — 2005 hand-crafted 7D language features, Euclidean.
//                              Measures *how* someone typed (profanity rate,
//                              exclamation rate, capitalization), not what happened.
//   REGIME_W2V       (key 2) — 128D corpus-trained word2vec bigram means, cosine.
//   REGIME_SBERT     (key 3) — bge-small-en-v1.5 sentence embeddings, cosine.
//   REGIME_NOMIC     (key 4) — nomic-embed-text-v1.5 truncated to 256D
//                              (matryoshka), cosine.
//
// Regimes 2-4 read a binary embedding asset (see DMPE_* below). Until that
// asset exists they report ready === false and BreakupManager transparently
// falls back to regime 1.
//
// All three regimes run their output through the same normalize + contrast pass
// so that switching between them compares geometry, not tone-mapping.

const REGIME_HEURISTIC = 1;
const REGIME_W2V       = 2;
const REGIME_SBERT     = 3;
const REGIME_NOMIC     = 4;
const REGIME_KEYS      = [REGIME_HEURISTIC, REGIME_W2V, REGIME_SBERT, REGIME_NOMIC];
const REGIME_DEFAULT   = REGIME_NOMIC;   // best quality/cost of the four — see notes_july27.md

// Contrast enhancement: clamp outside mean ± kσ, then rescale to [0,1].
// These are the constants from the original 2005 Processing code.
const REGIME_CONTRAST_LO_SIGMA = 2.25;
const REGIME_CONTRAST_HI_SIGMA = 2.00;

//===========================================================================
// Embedding asset format ("DMPE") — produced offline, parsed here.
//
//   offset  0 : magic    'DMPE'      4 bytes
//   offset  4 : version  uint8       = 1
//   offset  5 : dtype    uint8       = 0 (int8)
//   offset  6 : dims     uint16 LE   embedding dimensionality
//   offset  8 : count    uint32 LE   number of records, indexed by bupId
//   offset 12 : reserved uint32      = 0
//   offset 16 : payload  count*dims int8, row-major, row i == bupId i
//
// Rows are L2-normalized before quantization. Exact cosine of the *quantized*
// vectors is recovered at load time via per-row inverse norms, so no dequant
// scale factor is needed.
const DMPE_HEADER_BYTES = 16;
const DMPE_DTYPE_INT8   = 0;

//===========================================================================
// Shared tail end of every regime: normalize by max, then contrast-enhance.
// Mirrors the original BreakupManager math exactly.
function regimeNormalizeAndContrast(out, N) {
  let maxD = 0;
  for (let i = 0; i < N; i++) if (out[i] > maxD) maxD = out[i];
  if (maxD <= 0.0) return { mean: 0, stdv: 0 };

  const invMax = 1.0 / maxD;
  let mean = 0;
  for (let i = 0; i < N; i++) mean += (out[i] *= invMax);
  mean /= N;

  let stdv = 0;
  for (let i = 0; i < N; i++) { const dm = out[i] - mean; stdv += dm * dm; }
  stdv = Math.sqrt((1.0 / (N - 1.0)) * stdv);

  if (stdv > 0) {
    const loVal = Math.min(1, Math.max(0, mean - REGIME_CONTRAST_LO_SIGMA * stdv));
    const hiVal = Math.max(0, Math.min(1, mean + REGIME_CONTRAST_HI_SIGMA * stdv));
    const range = hiVal - loVal;
    for (let i = 0; i < N; i++) {
      const val = out[i];
      if      (val <= loVal) out[i] = 0;
      else if (val >= hiVal) out[i] = 1;
      else                   out[i] = (val - loVal) / range;
    }
  }
  return { mean, stdv };
}

//===========================================================================
// Regime 1: the 2005 heuristics. Euclidean distance in the 7D hand-crafted
// language-feature space.
class HeuristicContentProvider {

  constructor(bups) {
    this.bups  = bups;
    this.id    = REGIME_HEURISTIC;
    this.name  = 'HEURISTIC-7D';
    this.ready = true;
    this.mean  = 0;
    this.stdv  = 0;
  }

  fillContentDistances(selId, out) {
    const N    = N_BREAKUP_DATABASE_RECORDS;
    const bups = this.bups;
    const currLangData = bups[selId].languageData;

    for (let i = 0; i < N; i++) {
      out[i] = bups[i].computeLanguageDistance(currLangData);
    }

    const stats = regimeNormalizeAndContrast(out, N);
    this.mean = stats.mean;
    this.stdv = stats.stdv;
  }
}

//===========================================================================
// Regimes 2 and 3: cosine distance over a precomputed embedding. Identical
// code for both — they differ only in which asset they load and its dims.
class EmbeddingContentProvider {

  constructor(id, name, assetPath) {
    this.id        = id;
    this.name      = name;
    this.assetPath = assetPath;

    this.ready     = false;
    this.dims      = 0;
    this.count     = 0;
    this.vecs      = null;  // Int8Array, count*dims, row-major by bupId
    this.invNorms  = null;  // Float32Array, 1/||row||
  }

  // buf: ArrayBuffer holding a DMPE asset. Returns true on success.
  loadFromArrayBuffer(buf) {
    if (!buf || buf.byteLength < DMPE_HEADER_BYTES) return this._fail('too small');

    const head = new DataView(buf);
    if (head.getUint8(0) !== 0x44 || head.getUint8(1) !== 0x4D ||
        head.getUint8(2) !== 0x50 || head.getUint8(3) !== 0x45) {
      return this._fail('bad magic (expected DMPE)');
    }
    const version = head.getUint8(4);
    const dtype   = head.getUint8(5);
    const dims    = head.getUint16(6, true);
    const count   = head.getUint32(8, true);

    if (version !== 1)             return this._fail('unsupported version ' + version);
    if (dtype !== DMPE_DTYPE_INT8) return this._fail('unsupported dtype ' + dtype);
    if (dims <= 0 || count <= 0)   return this._fail('empty (dims=' + dims + ' count=' + count + ')');

    const need = DMPE_HEADER_BYTES + count * dims;
    if (buf.byteLength < need) {
      return this._fail('truncated: have ' + buf.byteLength + ' need ' + need);
    }

    this.vecs  = new Int8Array(buf, DMPE_HEADER_BYTES, count * dims);
    this.dims  = dims;
    this.count = count;

    // Exact cosine of the quantized vectors: cos = (a.b) * invNorm[a] * invNorm[b]
    this.invNorms = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const o = i * dims;
      let s = 0;
      for (let k = 0; k < dims; k++) { const v = this.vecs[o + k]; s += v * v; }
      this.invNorms[i] = (s > 0) ? (1.0 / Math.sqrt(s)) : 0;
    }

    this.ready = true;
    console.log(`Regime ${this.id} (${this.name}): loaded ${count} x ${dims}D from ` +
                `${this.assetPath} (${(buf.byteLength / 1048576).toFixed(2)} MB)`);
    return true;
  }

  _fail(why) {
    console.warn(`Regime ${this.id} (${this.name}): ${this.assetPath} rejected — ${why}`);
    this.ready = false;
    return false;
  }

  fillContentDistances(selId, out) {
    const N     = N_BREAKUP_DATABASE_RECORDS;
    const D     = this.dims;
    const V     = this.vecs;
    const inv   = this.invNorms;
    const count = this.count;

    // Selection outside the asset: nothing meaningful to say.
    if (selId < 0 || selId >= count) {
      for (let i = 0; i < N; i++) out[i] = 1;
      return;
    }

    const off  = selId * D;
    const qInv = inv[selId];
    const lim  = Math.min(N, count);

    for (let i = 0; i < lim; i++) {
      const o = i * D;
      let s = 0;
      for (let k = 0; k < D; k++) s += V[off + k] * V[o + k];
      // cos in [-1,1] -> distance in [0,1]
      out[i] = 0.5 - 0.5 * (s * qInv * inv[i]);
    }
    // Records with no embedding: maximally distant.
    for (let i = lim; i < N; i++) out[i] = 1;

    regimeNormalizeAndContrast(out, N);
  }
}
