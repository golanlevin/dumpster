// Ported from Breakup.pde

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

    // Bit-position lookup table
    this.bitValues = new Array(32);
    for (let i = 0; i < 32; i++) {
      this.bitValues[i] = 1 << i;
    }

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

    for (let b = 0; b < 32; b++) {
      if ((this.kamalTags  & this.bitValues[b]) > 0) n++;
      if ((this.accessTags & this.bitValues[b]) > 0) n++;
      for (let j = 0; j < N_BREAKUP_LANGUAGE_BITFLAGS; j++) {
        if ((this.languageTags[j] & this.bitValues[b]) > 0) n++;
      }
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
    let nScaledCommonProperties = 0;
    for (let i = 0; i < N_BREAKUP_LANGUAGE_BITFLAGS; i++) {
      const commonProperties = this.languageTags[i] & otherTags[i];
      for (let b = 0; b < 32; b++) {
        if ((commonProperties & this.bitValues[b]) > 0) {
          nScaledCommonProperties += this.langTagRelativeValues[i];
        }
      }
    }
    return nScaledCommonProperties;
  }

  //=============================================================
  computeKamalTagCommonalities(otherKTags) {
    let nCommonProperties = 0;
    const commonProperties = this.kamalTags & otherKTags;
    for (let b = 0; b < 32; b++) {
      if ((commonProperties & this.bitValues[b]) > 0) {
        nCommonProperties++;
      }
    }
    return nCommonProperties;
  }

  //=============================================================
  computeAccessTagCommonalities(otherSex, otherFault, otherInstigator, otherAccessTags) {
    let nCommonProperties = 0;
    nCommonProperties += (this.sex        & otherSex);
    nCommonProperties += (this.fault      & otherFault);
    nCommonProperties += (this.instigator & otherInstigator);

    const commonProperties = this.accessTags & otherAccessTags;
    for (let b = 0; b < 10; b++) {
      if ((commonProperties & this.bitValues[b]) > 0) {
        nCommonProperties++;
      }
    }
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
