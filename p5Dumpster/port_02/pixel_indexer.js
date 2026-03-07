// Ported from PixelIndexer.pde
// Sorts breakups into the 90x222 pixel grid via a 4-pass sort.

class PixelIndexer {

  constructor(BM) {
    const nPixels = PIXELVIEW_W * PIXELVIEW_H;
    this.PixelIndexToBupIndex = new Int32Array(nPixels);
    this.BupIndexToPixelIndex = new Int32Array(N_BREAKUP_DATABASE_RECORDS).fill(DUMPSTER_INVALID);

    // Build working array of all breakups
    this._V = [];
    for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) {
      this._V.push(BM.bups[i]);
    }

    this._sort1_EntireSetByAge();
    this._sort2_AgeByLanguage();
    this._sort3_RowsOf50BySex();
    this._sort4_ByInstigator();

    for (let i = 0; i < nPixels; i++) {
      const bupId = this._V[i].ID;
      this.PixelIndexToBupIndex[i] = bupId;
      this.BupIndexToPixelIndex[bupId] = i;
    }
  }

  //==================================================================
  _sort1_EntireSetByAge() {
    this._V.sort((a, b) => a.compareTo(b, BUP_COMPARE_AGE));
  }

  //==================================================================
  _sort2_AgeByLanguage() {
    const N   = N_BREAKUP_DATABASE_RECORDS_20K;
    const nm1 = N - 1;
    let age0 = this._V[0].age;
    let ageIndexLo = 0;

    for (let i = 1; i < N; i++) {
      const age1 = this._V[i].age;
      if (age1 < age0 || i === nm1) {
        const ageIndexHi = i - 1;
        if (ageIndexHi > ageIndexLo) {
          this._sortSlice(ageIndexLo, ageIndexHi, BUP_COMPARE_LANG);
        }
        ageIndexLo = ageIndexHi;
      }
      age0 = age1;
    }
  }

  //==================================================================
  _sort3_RowsOf50BySex() {
    for (let y = 0; y < PIXELVIEW_H; y++) {
      this._sortSlice(y * PIXELVIEW_W, (y + 1) * PIXELVIEW_W - 1, BUP_COMPARE_SEX);
    }
  }

  //==================================================================
  _sort4_ByInstigator() {
    for (let y = 0; y < PIXELVIEW_H; y++) {
      const rowLo = y * PIXELVIEW_W;
      const rowHi = (y + 1) * PIXELVIEW_W - 1;
      for (let sex = 0; sex <= 2; sex++) {
        let sexLo = DUMPSTER_INVALID;
        let sexHi = DUMPSTER_INVALID;
        for (let i = rowLo; i < rowHi; i++) {
          if (this._V[i].sex === sex) {
            if (sexLo === DUMPSTER_INVALID) sexLo = i;
            sexHi = i;
          }
        }
        if (sexLo !== DUMPSTER_INVALID && sexHi !== DUMPSTER_INVALID) {
          this._sortSlice(sexLo, sexHi, BUP_COMPARE_INSTIG);
        }
      }
    }
  }

  //==================================================================
  // Sort V[lo..hi] inclusive in-place using Array.sort with comparator.
  _sortSlice(lo, hi, method) {
    const sub = this._V.slice(lo, hi + 1);
    sub.sort((a, b) => a.compareTo(b, method));
    for (let i = 0; i < sub.length; i++) {
      this._V[lo + i] = sub[i];
    }
  }
}
