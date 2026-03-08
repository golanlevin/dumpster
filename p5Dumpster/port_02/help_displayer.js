// Ported from HelpDisplayer.pde
// References global PV (PixelView) to check bMouseInView.

class HelpDisplayer {

  constructor(font6, BM, KOS) {
    this.font6 = font6;
    this.BM    = BM;
    this.KOS   = KOS;

    this.textr = 0;
    this.textg = 0;
    this.textb = 0;
    this.textrT = 0;
    this.textgT = 0;
    this.textbT = 0;

    this._mode = 0; // 0=NONE, 1=SELE, 2=OVER
    this._helpStr = '';
  }

  //================================================================
  update(mx, my) {
    let mode = 0;
    let breakupIndex = DUMPSTER_INVALID;

    let moBI = this.KOS.currentMouseoverBreakupId;
    if (typeof PV !== 'undefined' && PV && PV.bMouseInView) {
      moBI = this.KOS.currentMouseoverBreakupIdWithOffset;
    }
    const seBI = this.KOS.currentSelectedBreakupId;

    if (moBI !== DUMPSTER_INVALID) {
      if (moBI === seBI) {
        breakupIndex = seBI;
        mode = 1; // SELE
      } else {
        breakupIndex = moBI;
        mode = 2; // OVER
      }
    } else if (seBI !== DUMPSTER_INVALID) {
      breakupIndex = seBI;
      mode = 1; // SELE
    }

    switch (mode) {
      case 0: this.textrT = 0;   this.textgT = 0;   this.textbT = 0;   break;
      case 2: this.textrT = 32;  this.textgT = 96;  this.textbT = 255; break;
      case 1: this.textrT = 255; this.textgT = 255; this.textbT = 0;   break;
    }

    this._helpStr = this._getSelectionString(breakupIndex);
  }

  //================================================================
  render() {
    this.textr = HD_TEXT_BLURA * this.textr + HD_TEXT_BLURB * this.textrT;
    this.textg = HD_TEXT_BLURA * this.textg + HD_TEXT_BLURB * this.textgT;
    this.textb = HD_TEXT_BLURA * this.textb + HD_TEXT_BLURB * this.textbT;

    fill(this.textr, this.textg, this.textb);
    textFont(this.font6, 12);

    push();
    translate(18 * 9 - 2, PIXELVIEW_H * PIXELVIEW_SCALE + 25);
    text(this._helpStr, 0, 0.75);
    pop();
  }

  //================================================================
  _getSelectionString(breakupIndex) {
    if (breakupIndex === DUMPSTER_INVALID || breakupIndex < 0 ||
        breakupIndex > N_BREAKUP_DATABASE_RECORDS) return '';

    const bup = this.BM.bups[breakupIndex];
    const idStr  = String(bup.ID).padStart(5, '0');
    const ageStr = bup.age > 0 ? String(bup.age) : 'N/A';
    const sexStr = bup.sex === 2 ? 'M' : bup.sex === 1 ? 'F' : 'N/A';
    const match  = Math.floor(100.0 * this.BM.SIMILARITIES[breakupIndex]);

    const dayStr = this._dayIndexToDateStr(bup.date);
    return `ID: ${idStr}\nAGE: ${ageStr}\nSEX: ${sexStr}\nMATCH: ${match}\nLENGTH: ${bup.summaryLen}\nDAY: ${dayStr}`;
  }

  //================================================================
  _dayIndexToDateStr(d) {
    if (d <= 0) return 'N/A';
    const months  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let remaining = d - 1; // bup.date is 1-based; convert to 0-based
    for (let m = 0; m < 12; m++) {
      if (remaining < lengths[m]) return `${months[m]} ${remaining + 1}`;
      remaining -= lengths[m];
    }
    return 'N/A';
  }
}
