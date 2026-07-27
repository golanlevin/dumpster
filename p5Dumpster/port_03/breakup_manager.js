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
    this.meanLangDistance = 0;
    this.stdvLangDistance = 0;

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
  informOfNewlySelectedBreakup(bupId) {
    if (bupId > 0 && bupId <= N_BREAKUP_DATABASE_RECORDS) {
      this.currentlySelectedBreakupId = bupId;
    } else {
      this.currentlySelectedBreakupId = DUMPSTER_INVALID;
    }
    this.computeSimilarityOfAllBupsToCurrBup();
  }

  //=====================================================================================
  computeSimilarityOfAllBupsToCurrBup() {
    const N    = N_BREAKUP_DATABASE_RECORDS;
    const bups = this.bups;

    let maxDistL = 0, maxDistT = 0, maxDistK = 0, maxDistA = 0;

    if (this.currentlySelectedBreakupId !== DUMPSTER_INVALID) {
      const curr         = bups[this.currentlySelectedBreakupId];
      const currLangData = curr.languageData;
      const currLangTags = curr.languageTags;
      const currKamal    = curr.kamalTags;
      const currAge      = curr.age;
      const currSex      = curr.sex;
      const currFault    = curr.fault;
      const currInstg    = curr.instigator;
      const currAccess   = curr.accessTags;
      const currLen      = curr.summaryLen;

      for (let i = 0; i < N; i++) {
        const distL = bups[i].computeLanguageDistance(currLangData);
        const distT = bups[i].computeLanguageTagNCommonalities(currLangTags);
        const distK = bups[i].computeKamalTagCommonalities(currKamal);
        const distA = bups[i].computeAccessTagCommonalities(currSex, currFault, currInstg, currAccess);

        this.distancesByLang[i]     = distL;
        this.similaritiesByTag[i]   = distT;
        this.similaritiesByKamal[i] = distK;
        this.similaritiesByAccess[i]= distA;
        this.distancesByAge[i]      = bups[i].computeAgeDifference(currAge);
        this.distancesByLen[i]      = Math.abs(currLen - bups[i].summaryLen) / 255.0;

        if (distL > maxDistL) maxDistL = distL;
        if (distT > maxDistT) maxDistT = distT;
        if (distK > maxDistK) maxDistK = distK;
        if (distA > maxDistA) maxDistA = distA;
      }
    }

    // Normalize lang distances; compute mean + stddev for contrast enhancement
    const nBupsf = N;
    this.meanLangDistance = 0;
    this.stdvLangDistance = 0;

    if (maxDistL > 0.0) {
      const normalizeL = 1.0 / maxDistL;
      for (let i = 0; i < N; i++) {
        this.meanLangDistance += (this.distancesByLang[i] *= normalizeL);
      }
      this.meanLangDistance /= nBupsf;

      for (let i = 0; i < N; i++) {
        const dm = this.distancesByLang[i] - this.meanLangDistance;
        this.stdvLangDistance += dm * dm;
      }
      this.stdvLangDistance = Math.sqrt((1.0 / (nBupsf - 1.0)) * this.stdvLangDistance);
    }

    if (maxDistT > 0) {
      const normalizeT = 1.0 / maxDistT;
      for (let i = 0; i < N; i++) this.similaritiesByTag[i] *= normalizeT;
    }
    if (maxDistK > 0) {
      const normalizeK = 1.0 / maxDistK;
      for (let i = 0; i < N; i++) this.similaritiesByKamal[i] *= normalizeK;
    }
    if (maxDistA > 0) {
      const normalizeA = 1.0 / maxDistA;
      for (let i = 0; i < N; i++) this.similaritiesByAccess[i] *= normalizeA;
    }

    // Contrast enhancement of lang distances: clamp outside ±2 stddevs
    if (this.stdvLangDistance > 0) {
      const loVal = Math.min(1, Math.max(0, this.meanLangDistance - 2.25 * this.stdvLangDistance));
      const hiVal = Math.max(0, Math.min(1, this.meanLangDistance + 2.00 * this.stdvLangDistance));
      const range = hiVal - loVal;
      for (let i = 0; i < N; i++) {
        const val = this.distancesByLang[i];
        if      (val <= loVal) this.distancesByLang[i] = 0;
        else if (val >= hiVal) this.distancesByLang[i] = 1;
        else                   this.distancesByLang[i] = (val - loVal) / range;
      }
    }

    // Weighted similarity score
    let maxSimilarity = 0.0;
    for (let i = 0; i < N; i++) {
      let theSimilarity = 0.0;
      if (bups[i].VALID) {
        const lenDist  = 1.0 - this.distancesByLen[i];
        const langDist = 1.0 - this.distancesByLang[i];
        const tagSimil = this.similaritiesByTag[i];
        const kamSimil = this.similaritiesByKamal[i];
        const accSimil = this.similaritiesByAccess[i];

        const bTagSimil = (tagSimil > 0);
        const bkamSimil = (kamSimil > 0);

        let ageDist = 0.0;
        if (this.distancesByAge[i] !== DUMPSTER_INVALID) {
          ageDist = 1.0 - Math.min(5.0, this.distancesByAge[i]) / 5.0;
        }

        if (bTagSimil && !bkamSimil) {
          theSimilarity = 0.05*lenDist + 0.10*ageDist + 0.20*langDist + 0.30*tagSimil + 0.40*accSimil;
        } else if (!bTagSimil && bkamSimil) {
          theSimilarity = 0.05*lenDist + 0.10*ageDist + 0.20*langDist + 0.40*kamSimil + 0.40*accSimil;
        } else if (bTagSimil && bkamSimil) {
          theSimilarity = 0.05*lenDist + 0.10*ageDist + 0.20*langDist + 0.30*tagSimil + 0.40*kamSimil + 0.40*accSimil;
        } else {
          theSimilarity = 0.05*lenDist + 0.10*ageDist + 0.20*langDist + 0.40*accSimil;
        }

        if (theSimilarity > maxSimilarity) maxSimilarity = theSimilarity;
      }
      this.SIMILARITIES[i] = theSimilarity;
    }

    if (maxSimilarity < 1.0) {
      maxSimilarity = Math.pow(maxSimilarity, 0.95);
    }
    if (maxSimilarity > 0.0) {
      for (let i = 0; i < N; i++) {
        this.SIMILARITIES[i] /= maxSimilarity;
      }
    }
  }
}
