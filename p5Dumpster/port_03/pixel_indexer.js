// Ported from PixelIndexer.pde
// Sorts breakups into the PIXELVIEW_W x PIXELVIEW_H pixel grid via a 4-pass sort.

class PixelIndexer {

  // layoutBytes: optional Uint8Array / byte array holding a DMPL asset (see
  // make_pixel_layout.py). When present and parseable it replaces the four
  // sorts; otherwise the original 2005 sort chain runs, unchanged.
  constructor(BM, layoutBytes, label) {
    this.label = label || 'layout';
    const nPixels = PIXELVIEW_W * PIXELVIEW_H;
    this.PixelIndexToBupIndex = new Int32Array(nPixels);
    this.BupIndexToPixelIndex = new Int32Array(N_BREAKUP_DATABASE_RECORDS).fill(DUMPSTER_INVALID);
    this.layoutMode = 'classic-4-sort';

    if (layoutBytes && this._loadPrecomputedLayout(layoutBytes, nPixels)) {
      this.layoutMode = 'precomputed-umap-lap';
    } else {
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
        this.PixelIndexToBupIndex[i] = this._V[i].ID;
      }
    }

    for (let i = 0; i < nPixels; i++) {
      const bupId = this.PixelIndexToBupIndex[i];
      if (bupId >= 0 && bupId < N_BREAKUP_DATABASE_RECORDS) {
        this.BupIndexToPixelIndex[bupId] = i;
      }
    }
    console.log(`PixelIndexer[${this.label}]: ${this.layoutMode}`);
  }

  //==================================================================
  // DMPL: 'DMPL' magic, version u8, reserved u8, gridW u16, gridH u16,
  // reserved u16, then gridW*gridH uint16 bupIds in row-major pixel order.
  // Read byte-by-byte rather than through a typed-array view, because p5's
  // loadBytes() hands back a plain array with no usable ArrayBuffer.
  _loadPrecomputedLayout(bytes, nPixels) {
    const fail = (why) => {
      console.warn(`PixelIndexer[${this.label}]: ignoring layout asset — ${why}. ` +
                   `Falling back to the classic four-pass sort.`);
      return false;
    };
    if (!bytes || bytes.length < 12) return fail('too small');
    if (bytes[0] !== 0x44 || bytes[1] !== 0x4D ||
        bytes[2] !== 0x50 || bytes[3] !== 0x4C) return fail('bad magic (expected DMPL)');
    if (bytes[4] !== 1) return fail('unsupported version ' + bytes[4]);

    const gw = bytes[6] | (bytes[7] << 8);
    const gh = bytes[8] | (bytes[9] << 8);
    if (gw !== PIXELVIEW_W || gh !== PIXELVIEW_H) {
      return fail(`grid is ${gw}x${gh}, expected ${PIXELVIEW_W}x${PIXELVIEW_H}`);
    }
    if (bytes.length < 12 + nPixels * 2) {
      return fail(`truncated: ${bytes.length} bytes, need ${12 + nPixels * 2}`);
    }

    for (let i = 0; i < nPixels; i++) {
      const o = 12 + i * 2;
      const id = bytes[o] | (bytes[o + 1] << 8);
      if (id >= N_BREAKUP_DATABASE_RECORDS) return fail(`bupId ${id} out of range at pixel ${i}`);
      this.PixelIndexToBupIndex[i] = id;
    }
    return true;
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
