// Ported from BreakupManager.pde
//
// Key difference from Processing: data loading is async in p5.js.
// The constructor just allocates structures; call loadFromAssets()
// once all raw data arrays are available.

class BreakupManager {

  constructor() {
    this.bups = new Array(N_BREAKUP_DATABASE_RECORDS);
    for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) {
      this.bups[i] = new Breakup(i);
    }

    this.currentlySelectedBreakupId = DUMPSTER_INVALID;

    // Content-similarity regimes, switchable at runtime (keys 1-4).
    // Regimes 2-4 stay unready until their embedding asset loads; until then
    // activeProvider() transparently falls back to regime 1.
    this.providers = {};
    this.providers[REGIME_HEURISTIC] = new HeuristicContentProvider(this.bups);
    this.providers[REGIME_W2V]       = new EmbeddingContentProvider(
      REGIME_W2V,   'W2V-128',   'data/bigram_w2v_128_int8.bin');
    this.providers[REGIME_SBERT]     = new EmbeddingContentProvider(
      REGIME_SBERT, 'SBERT-384', 'data/sbert_384_int8.bin');
    this.providers[REGIME_NOMIC]     = new EmbeddingContentProvider(
      REGIME_NOMIC, 'NOMIC-256', 'data/nomic_256_int8.bin');
    this.requestedRegime = REGIME_DEFAULT;

    // Instrumentation: cost of one full similarity pass. This runs every frame
    // during pixel-view drag, so it lives inside the 16 ms frame budget.
    this.lastComputeMs = 0;
    this.avgComputeMs  = 0;

    // Per-breakup computed arrays
    this.SIMILARITIES       = new Float64Array(N_BREAKUP_DATABASE_RECORDS);
    this.MALES              = new Int32Array(N_BREAKUP_DATABASE_RECORDS);
    this.distancesByLen     = new Float64Array(N_BREAKUP_DATABASE_RECORDS);
    this.distancesByLang    = new Float64Array(N_BREAKUP_DATABASE_RECORDS);
    this.distancesByAge     = new Float64Array(N_BREAKUP_DATABASE_RECORDS);
    this.similaritiesByTag    = new Float64Array(N_BREAKUP_DATABASE_RECORDS);
    this.similaritiesByKamal  = new Float64Array(N_BREAKUP_DATABASE_RECORDS);
    this.similaritiesByAccess = new Float64Array(N_BREAKUP_DATABASE_RECORDS);

    // Reusable temp buffers
    this._tempLangPacket  = new Array(N_BREAKUP_LANGUAGE_DESCRIPTORS).fill(0);
    this._tempLangTagInts = new Array(N_BREAKUP_LANGUAGE_BITFLAGS).fill(0);

    // Blend channels, in a fixed order. Weights are sqrt(share), normalized so
    // that sum(w^2) === 1 — that is what makes a share of 0.55 come out as ~55%
    // of the variance of the blended score.
    this._chShares = [SIM_SHARE_CONTENT, SIM_SHARE_LENGTH, SIM_SHARE_AGE,
                      SIM_SHARE_LANG_TAGS, SIM_SHARE_KAMAL_TAGS, SIM_SHARE_ACCESS_TAGS];
    this._chNames  = ['content', 'length', 'age', 'langTags', 'kamalTags', 'accessTags'];
    const shareSum = this._chShares.reduce((a, b) => a + b, 0) || 1;
    this._chWeights = this._chShares.map(s => Math.sqrt(s / shareSum));

    this._nCh      = this._chShares.length;
    this._chVal    = new Float64Array(this._nCh);  // scratch: one record's channels
    this._chMean   = new Float64Array(this._nCh);
    this._chInvSd  = new Float64Array(this._nCh);
    this._chSum    = new Float64Array(this._nCh);
    this._chSumSq  = new Float64Array(this._nCh);
  }

  //=====================================================================================
  // Call this once all asset data has been loaded by p5.js.
  // languageDataLines  : string[] from loadStrings('languageData.txt')
  // languageTagsLines  : string[] from loadStrings('languageTags.txt')
  // kamalFlagsLines    : string[] from loadStrings('kamalFlags.txt')
  // summaryLengthsBytes: Uint8Array / number[] from loadBytes().bytes
  // accessThemesLines  : string[] from loadStrings('accessThemes.tsv')
  loadFromAssets(languageDataLines, languageTagsLines, kamalFlagsLines,
                 summaryLengthsBytes, accessThemesLines) {
    this._loadLanguageData(languageDataLines);
    this._loadLanguageTags(languageTagsLines);
    this._loadKamalData(kamalFlagsLines);
    this._loadAccessThemes(accessThemesLines);
    this._loadSummaryLengths(summaryLengthsBytes);
    this._computeNBitsSet();
    this._computeHeartRadii();
    console.log('BreakupManager: all data loaded.');
  }

  //=====================================================================================
  _loadLanguageData(lines) {
    // Values are stored as integers scaled by 2^15; divide to get floats.
    const div = 1.0 / (1 << 15);
    const n = Math.min(lines.length, N_BREAKUP_DATABASE_RECORDS);
    for (let i = 0; i < n; i++) {
      const strVals = lines[i].split('\t');
      if (strVals.length === N_BREAKUP_LANGUAGE_DESCRIPTORS) {
        for (let j = 0; j < N_BREAKUP_LANGUAGE_DESCRIPTORS; j++) {
          this._tempLangPacket[j] = parseInt(strVals[j]) * div;
        }
        this.bups[i].setLanguageData(this._tempLangPacket);
      }
    }
  }

  //=====================================================================================
  _loadLanguageTags(lines) {
    // Space-separated, N_BREAKUP_LANGUAGE_BITFLAGS integers per line
    const n = Math.min(lines.length, N_BREAKUP_DATABASE_RECORDS);
    for (let i = 0; i < n; i++) {
      const strVals = lines[i].split(' ');
      if (strVals.length === N_BREAKUP_LANGUAGE_BITFLAGS) {
        for (let f = 0; f < N_BREAKUP_LANGUAGE_BITFLAGS; f++) {
          this._tempLangTagInts[f] = parseInt(strVals[f]);
        }
        this.bups[i].setLanguageTags(this._tempLangTagInts);
      }
    }
  }

  //=====================================================================================
  _loadKamalData(lines) {
    // Tab-separated: age, date, flags
    const n = Math.min(lines.length, N_BREAKUP_DATABASE_RECORDS);
    for (let i = 0; i < n; i++) {
      const strVals = lines[i].split('\t');
      if (strVals.length === 3) {
        const age   = parseInt(strVals[0]);
        const date  = parseInt(strVals[1]);
        const flags = parseInt(strVals[2]);
        this.bups[i].setKamalFlags(age, date, flags);
      }
    }
  }

  //=====================================================================================
  _loadAccessThemes(lines) {
    // Tab-separated: good_data, gender, fault, instigator, themes
    const n = Math.min(lines.length, N_BREAKUP_DATABASE_RECORDS);
    for (let i = 0; i < n; i++) {
      const strVals = lines[i].split('\t');
      if (strVals.length === 5) {
        const good   = parseInt(strVals[0]);
        const gender = parseInt(strVals[1]);
        const fault  = parseInt(strVals[2]);
        const instig = parseInt(strVals[3]);
        const themes = parseInt(strVals[4]);
        this.bups[i].setAccessTags(good, gender, fault, instig, themes);
        this.MALES[i] = (gender === 2) ? MALE_BLUE_AMOUNT : 0;
      }
    }
  }

  //=====================================================================================
  _loadSummaryLengths(bytes) {
    // Each byte is the summary length 0-255 (unsigned)
    const n = Math.min(bytes.length, N_BREAKUP_DATABASE_RECORDS);
    for (let i = 0; i < n; i++) {
      this.bups[i].setSummaryLength(bytes[i] & 0xFF);
    }
  }

  //=====================================================================================
  _computeNBitsSet() {
    for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) {
      this.bups[i].computeNBitsSet();
    }
  }

  //=====================================================================================
  _computeHeartRadii() {
    for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) {
      this.bups[i].computeHeartRadius();
    }
  }

  //=====================================================================================
  // The regime actually used for the content channel: the requested one if its
  // asset is loaded, otherwise regime 1.
  activeProvider() {
    const p = this.providers[this.requestedRegime];
    return (p && p.ready) ? p : this.providers[REGIME_HEURISTIC];
  }

  // Returns true if the requested regime is the one actually in use.
  setRegime(regime) {
    if (!this.providers[regime]) return false;
    this.requestedRegime = regime;
    const active = this.activeProvider();
    if (active.id !== regime) {
      console.warn(`Regime ${regime} (${this.providers[regime].name}) has no data yet — ` +
                   `still using regime ${active.id} (${active.name}).`);
    }
    this.computeSimilarityOfAllBupsToCurrBup();
    return active.id === regime;
  }

  // Short status string for the on-screen indicator.
  regimeLabel() {
    const want   = this.providers[this.requestedRegime];
    const active = this.activeProvider();
    const suffix = (active.id === want.id) ? '' : ' (NO DATA)';
    return `${this.requestedRegime} ${want.name}${suffix}  ${this.avgComputeMs.toFixed(1)}ms`;
  }

  // Hand a downloaded DMPE asset to a regime. Returns true if it became ready.
  loadEmbeddingAsset(regime, arrayBuffer) {
    const p = this.providers[regime];
    if (!p || !p.loadFromArrayBuffer) return false;
    return p.loadFromArrayBuffer(arrayBuffer);
  }

  //=====================================================================================
  informOfNewlySelectedBreakup(bupId) {
    if (bupId >= 0 && bupId < N_BREAKUP_DATABASE_RECORDS) {
      this.currentlySelectedBreakupId = bupId;
    } else {
      this.currentlySelectedBreakupId = DUMPSTER_INVALID;
    }
    this.computeSimilarityOfAllBupsToCurrBup();
  }

  //=====================================================================================
  computeSimilarityOfAllBupsToCurrBup() {
    const tStart = performance.now();
    const N    = N_BREAKUP_DATABASE_RECORDS;
    const bups = this.bups;


    if (this.currentlySelectedBreakupId !== DUMPSTER_INVALID) {
      // Content channel — regime 1, 2 or 3. Fills distancesByLang with values
      // already normalized to [0,1] and contrast-enhanced.
      this.activeProvider().fillContentDistances(
        this.currentlySelectedBreakupId, this.distancesByLang);

      const curr         = bups[this.currentlySelectedBreakupId];
      const currLangTags = curr.languageTags;
      const currKamal    = curr.kamalTags;
      const currAge      = curr.age;
      const currSex      = curr.sex;
      const currFault    = curr.fault;
      const currInstg    = curr.instigator;
      const currAccess   = curr.accessTags;
      const currLen      = curr.summaryLen;

      for (let i = 0; i < N; i++) {
        this.similaritiesByTag[i]    = bups[i].computeLanguageTagNCommonalities(currLangTags);
        this.similaritiesByKamal[i]  = bups[i].computeKamalTagCommonalities(currKamal);
        this.similaritiesByAccess[i] = bups[i].computeAccessTagCommonalities(
                                         currSex, currFault, currInstg, currAccess);
        this.distancesByAge[i]       = bups[i].computeAgeDifference(currAge);
        this.distancesByLen[i]       = Math.abs(currLen - bups[i].summaryLen) / 255.0;
      }
    }

    // Per-channel max-normalization is gone: standardizing each channel in
    // _blendStandardizedChannels() supersedes it, and mean/sd is far less
    // outlier-sensitive than dividing by a single extreme value.
    this._blendStandardizedChannels();

    this.lastComputeMs = performance.now() - tStart;
    // Seed the average on the first pass, else it reads ~0 until it converges.
    this.avgComputeMs = (this.avgComputeMs === 0)
      ? this.lastComputeMs
      : (0.9 * this.avgComputeMs + 0.1 * this.lastComputeMs);
  }

  //=====================================================================================
  // Read one record's six raw channel values into out[]. Order must match
  // _chShares / _chNames. Every channel is "higher === more similar".
  _deriveChannels(i, out) {
    out[0] = 1.0 - this.distancesByLang[i];                 // content
    out[1] = 1.0 - this.distancesByLen[i];                  // length
    out[2] = (this.distancesByAge[i] === DUMPSTER_INVALID)   // age
           ? AGE_UNKNOWN_SCORE
           : 1.0 - Math.min(AGE_DISTANCE_CAP, this.distancesByAge[i]) / AGE_DISTANCE_CAP;
    out[3] = this.similaritiesByTag[i];                     // langTags
    out[4] = this.similaritiesByKamal[i];                   // kamalTags
    out[5] = this.similaritiesByAccess[i];                  // accessTags
    return out;
  }

  //=====================================================================================
  // Blend the six channels into SIMILARITIES[0..1].
  //
  // Each channel is standardized (z-scored) over the valid records first, so the
  // SIM_SHARE_* constants behave as variance shares rather than arbitrary
  // multipliers — see dumpster_constants.js. Channels with share 0 are skipped
  // entirely, and a channel with no spread (sd 0) contributes nothing rather
  // than exploding.
  //
  // Three passes over N, all O(N): channel stats, blend, then rescale to [0,1].
  _blendStandardizedChannels() {
    const N    = N_BREAKUP_DATABASE_RECORDS;
    const bups = this.bups;
    const NC   = this._nCh;
    const v    = this._chVal;
    const w    = this._chWeights;
    const sum  = this._chSum, sumSq = this._chSumSq;
    const mean = this._chMean, invSd = this._chInvSd;

    for (let c = 0; c < NC; c++) { sum[c] = 0; sumSq[c] = 0; }

    // --- pass 1: per-channel mean and sd over valid records ---
    let nValid = 0;
    for (let i = 0; i < N; i++) {
      if (!bups[i].VALID) continue;
      this._deriveChannels(i, v);
      for (let c = 0; c < NC; c++) {
        const x = v[c];
        sum[c]   += x;
        sumSq[c] += x * x;
      }
      nValid++;
    }
    if (nValid === 0) {
      for (let i = 0; i < N; i++) this.SIMILARITIES[i] = 0;
      return;
    }
    for (let c = 0; c < NC; c++) {
      const m   = sum[c] / nValid;
      const var_ = Math.max(0, sumSq[c] / nValid - m * m);
      mean[c]  = m;
      // A channel that never varies carries no information — zero it out rather
      // than dividing by ~0 and amplifying float noise into the blend.
      invSd[c] = (var_ > 1e-12) ? (1.0 / Math.sqrt(var_)) : 0.0;
    }

    // --- pass 2: weighted sum of z-scores; track its own mean and sd ---
    let sSum = 0, sSumSq = 0;
    for (let i = 0; i < N; i++) {
      if (!bups[i].VALID) { this.SIMILARITIES[i] = 0; continue; }
      this._deriveChannels(i, v);
      let s = 0;
      for (let c = 0; c < NC; c++) {
        if (w[c] === 0) continue;
        s += w[c] * (v[c] - mean[c]) * invSd[c];
      }
      this.SIMILARITIES[i] = s;
      sSum += s; sSumSq += s * s;
    }
    const sMean = sSum / nValid;
    const sSd   = Math.sqrt(Math.max(0, sSumSq / nValid - sMean * sMean));

    // --- pass 3: rescale to [0,1] at mean +/- k*sd ---
    if (sSd <= 1e-12) {
      // Degenerate (e.g. every share is 0): flat field rather than NaNs.
      for (let i = 0; i < N; i++) if (bups[i].VALID) this.SIMILARITIES[i] = 0.5;
      return;
    }
    const lo    = sMean - SIM_CONTRAST_LO_SIGMA * sSd;
    const range = (SIM_CONTRAST_LO_SIGMA + SIM_CONTRAST_HI_SIGMA) * sSd;
    const invRange = 1.0 / range;
    for (let i = 0; i < N; i++) {
      if (!bups[i].VALID) continue;
      let t = (this.SIMILARITIES[i] - lo) * invRange;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      this.SIMILARITIES[i] = t;
    }

    // A record is a perfect match to itself, so pin the selection to exactly 1.0
    // and let HelpDisplayer read MATCH: 100. It already maximizes every channel,
    // so this preserves the ranking; without it the self-match lands wherever
    // the sigma ceiling happens to fall (measured 0.855 to 1.000 across
    // selections, since the top record sits anywhere from 2.3 to 7.9 sd out).
    const sel = this.currentlySelectedBreakupId;
    if (sel !== DUMPSTER_INVALID && sel >= 0 && sel < N && bups[sel].VALID) {
      this.SIMILARITIES[sel] = 1.0;
    }
  }
}
