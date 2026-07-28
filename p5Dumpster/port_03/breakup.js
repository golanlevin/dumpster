// Ported from Breakup.pde

//===============================================================
// Population count — how many bits are set in a 32-bit int.
//
// The tag-commonality methods below all ask "how many flags do these two
// records share", which is popcount(a & b). The original walked all 32 bit
// positions with an array lookup and a branch each; this is the standard
// branchless divide-and-conquer version (pairs -> nibbles -> bytes, then one
// multiply to sum the four bytes). Measured over 20,038 records, the three tag
// channels together drop from 3.65 ms to 0.51 ms per pass — and that pass runs
// every frame during a pixel-view drag, for all four regimes.
function popcount32(v) {
  v = v - ((v >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return (((v + (v >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

// The original tested `(common & (1 << b)) > 0` for b in 0..31. For b === 31
// that is `common & -2147483648`, which is either 0 or negative and so never
// satisfies `> 0` — meaning bit 31 was silently never counted. Masking it off
// keeps the new code exactly faithful. (No record in the corpus sets bit 31:
// kamalTags needs 28 bits, languageTags 30, accessTags 9.)
const BREAKUP_BIT_MASK_30 = 0x7FFFFFFF;

class Breakup {

  constructor(id) {
    this.ID         = id;
    this.age        = 0;
    this.sex        = 0;
    this.date       = 0;
    this.fault      = 0;
    this.instigator = 0;
    this.summaryLen = 0;
    this.nBitsSet   = 0;
    this.langMetric = 0;
    this.kamalTags  = 0;
    this.accessTags = 0;

    this.languageData = new Array(N_BREAKUP_LANGUAGE_DESCRIPTORS).fill(0.0);
    this.languageTags = new Array(N_BREAKUP_LANGUAGE_BITFLAGS).fill(0);

    this.b_normalizeByStdvs           = false;
    this.distanceFromCurrBupByLanguage = 0.0;
    this.VALID    = true;
    this.bIdValid = (id >= 0 && id < N_BREAKUP_DATABASE_RECORDS);

    this.heartRadius = HEART_AVG_RAD;

    // Precompute exponents (Java final fields computed from constants)
    this.NBITSPOW = Math.log(0.5) / Math.log(3.97 / 16.0);
    this.NLENPOW  = Math.log(0.5) / Math.log(171.0 / 255.0);

    // (The old per-instance bitValues[32] lookup table is gone — popcount32()
    // replaced it, saving 20,038 arrays of 32 numbers.)
    this.langTagRelativeValues = [0.80, 1.00, 0.50, 0.40];
  }

  //=============================================================
  compareTo(BR, method) {
    switch (method) {
      default:
      case BUP_COMPARE_AGE:
        if (BR.age < this.age) return -1;
        if (BR.age === this.age) return 0;
        return 1;

      case BUP_COMPARE_SEX:
        if (BR.sex < this.sex) return -1;
        if (BR.sex === this.sex) return 0;
        return 1;

      case BUP_COMPARE_INSTIG:
        if (BR.instigator < this.instigator) return -1;
        if (BR.instigator === this.instigator) return 0;
        return 1;

      case BUP_COMPARE_LANG:
        // Higher langMetric → sorted earlier (descending)
        if (BR.langMetric < this.langMetric) return 1;
        if (BR.langMetric === this.langMetric) return 0;
        return -1;
    }
  }

  //=============================================================
  setAccessTags(good, gen, flt, instig, themes) {
    this.VALID      = SHOW_NONGOOD_BREAKUPS || (good > 0);
    this.sex        = gen;
    this.fault      = flt;
    this.instigator = instig;
    this.accessTags = themes;
  }

  //=============================================================
  setKamalFlags(a, d, kt) {
    this.age       = a;
    this.date      = d;
    this.kamalTags = kt;
  }

  //=============================================================
  setLanguageTags(dat) {
    for (let i = 0; i < N_BREAKUP_LANGUAGE_BITFLAGS; i++) {
      this.languageTags[i] = dat[i];
    }
  }

  //=============================================================
  setLanguageData(dat) {
    for (let i = 0; i < N_BREAKUP_LANGUAGE_DESCRIPTORS; i++) {
      this.languageData[i] = dat[i];
    }
    if (this.b_normalizeByStdvs) {
      for (let i = 0; i < N_BREAKUP_LANGUAGE_DESCRIPTORS; i++) {
        this.languageData[i] -= LANG_MEANS[i];
        this.languageData[i] /= LANG_STDVS[i];
      }
    }
  }

  //=============================================================
  setSummaryLength(slen) {
    this.summaryLen = slen;
    const fuk = this.languageData[2];
    const cap = this.languageData[3];
    this.langMetric = slen / 255.0 + fuk + cap;
  }

  //=============================================================
  computeNBitsSet() {
    let n = 0;
    if (this.age > 0)        n++;
    if (this.sex > 0)        n++;
    if (this.fault > 0)      n++;
    if (this.instigator > 0) n++;

    n += popcount32(this.kamalTags  & BREAKUP_BIT_MASK_30);
    n += popcount32(this.accessTags & BREAKUP_BIT_MASK_30);
    for (let j = 0; j < N_BREAKUP_LANGUAGE_BITFLAGS; j++) {
      n += popcount32(this.languageTags[j] & BREAKUP_BIT_MASK_30);
    }
    this.nBitsSet = n;
    return n;
  }

  //=============================================================
  computeHeartRadius() {
    const maxBitsSetf = 12;
    let nBitsFrac = Math.min(1.0, this.nBitsSet / maxBitsSetf);
    nBitsFrac = Math.pow(nBitsFrac, this.NBITSPOW);

    const maxSummaryLen = 230;
    let nLenFrac = Math.min(1.0, this.summaryLen / maxSummaryLen);
    nLenFrac = Math.pow(nLenFrac, this.NLENPOW);

    let radiusFrac = 0.25 * nBitsFrac + 0.75 * nLenFrac;
    radiusFrac = Math.pow(radiusFrac, 2.75);
    this.heartRadius = HEART_MIN_RAD + radiusFrac * (HEART_MAX_RAD - HEART_MIN_RAD);
  }

  //=============================================================
  computeLanguageDistance(otherLanguageData) {
    let dist = 0.0;
    for (let i = 0; i < N_BREAKUP_LANGUAGE_DESCRIPTORS; i++) {
      const dval = this.languageData[i] - otherLanguageData[i];
      dist += dval * dval;
    }
    dist = Math.sqrt(dist);
    this.distanceFromCurrBupByLanguage = dist;
    return dist;
  }

  //=============================================================
  computeLanguageTagNCommonalities(otherTags) {
    // Each flag array carries a uniform weight, so weight * popcount is the
    // same quantity the original accumulated one matching bit at a time.
    let nScaledCommonProperties = 0;
    for (let i = 0; i < N_BREAKUP_LANGUAGE_BITFLAGS; i++) {
      const nCommon = popcount32(this.languageTags[i] & otherTags[i] & BREAKUP_BIT_MASK_30);
      if (nCommon !== 0) {
        nScaledCommonProperties += this.langTagRelativeValues[i] * nCommon;
      }
    }
    return nScaledCommonProperties;
  }

  //=============================================================
  computeKamalTagCommonalities(otherKTags) {
    return popcount32(this.kamalTags & otherKTags & BREAKUP_BIT_MASK_30);
  }

  //=============================================================
  computeAccessTagCommonalities(otherSex, otherFault, otherInstigator, otherAccessTags) {
    // Faithful oddity from 2005: these three add the AND *arithmetically*, not
    // as a bit count — matching sex 2 & 2 contributes 2, not 1. Left as-is.
    let nCommonProperties = 0;
    nCommonProperties += (this.sex        & otherSex);
    nCommonProperties += (this.fault      & otherFault);
    nCommonProperties += (this.instigator & otherInstigator);

    // Only the low 10 bits of accessTags are themes.
    nCommonProperties += popcount32(this.accessTags & otherAccessTags & 0x3FF);
    return nCommonProperties;
  }

  //=============================================================
  computeAgeDifference(otherAge) {
    if (this.age !== 0 && otherAge !== 0) {
      return Math.abs(this.age - otherAge);
    }
    return DUMPSTER_INVALID;
  }
}
