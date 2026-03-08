// Ported from DumpsterHistogram.pde
// Constructor takes pre-loaded asset data instead of calling loadStrings/loadImage inline.
// References global BM for breakup date lookup in informOfMouse().

class HistogramDatum {
  constructor(i, n) { this.I = i; this.N = n; }
}

//===========================================================================
class DumpsterHistogram {

  constructor(font6, x, y, w, h, KOS, histLines, histbg) {
    this.KOS = KOS;
    this.width   = Math.floor(w);
    this.height  = Math.floor(h);
    this.xoffset = Math.floor(x);
    this.yoffset = Math.floor(y);
    this.font6   = font6;

    this.bMouseInside = false;
    this.hiliteMode   = DH_HILITEMODE_NONE;

    this.mouseX  = 0;  this.mouseY  = 0;
    this.mouseXf = 0;  this.mouseYf = 0;
    this.bMousePressed  = false;
    this.bKeyPressed    = false;
    this.key = 0;

    this.mouseBlur   = 0.70;
    this.mousePivot  = 0.5;
    this.mousePower       = 1.0;
    this.mousePowerTarget = 1.0;
    this.dataIndexOfCursor = 0;
    this.dataValueOfCursor = 0;
    this.centerOfBoundsX   = 0;

    this.curdat_r = 0; this.curdat_g = 0; this.curdat_b = 0;
    this.curdat_rT = 0; this.curdat_gT = 0; this.curdat_bT = 0;

    this.bUseMouseYMagnification = true;
    this.bUseBackgroundImage = !!histbg;
    this.histbg = histbg || null;

    this.monthNames    = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','---'];
    this.dayNames      = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    this.monthLengths2005 = [0,31,28,31,30,31,30,31,31,30,31,30,31,31];

    // Load histogram data from pre-loaded lines
    const lines = histLines;
    this.nData   = lines.length;
    this.nDatam1 = this.nData - 1;
    this.data    = new Array(this.nData);
    for (let i = 0; i < this.nDatam1; i++) {
      this.data[i] = new HistogramDatum(i, parseInt(lines[i + 1]));
    }
    this.data[this.nDatam1] = new HistogramDatum(this.nDatam1, 0);
    this.indexLo = 0;
    this.indexHi = this.nData - 2; // nDatam1 is a sentinel; last valid day is nData-2

    this.nBands = 1;
    this.bandH  = 10;

    this.histogramL = this.xoffset + HEART_WALL_L;
    this.histogramR = this.xoffset + this.width - 1;
    this.histogramW = this.histogramR - this.histogramL;
    this.histogramT = this.yoffset;
    this.histogramB = this.yoffset + ((this.height + 1) - 2 - (this.nBands * this.bandH));
    this.histogramH = this.histogramB - this.histogramT;
    this.histogramValueScaleFactor = 1.0;

    this.tmpPixelBounds = [0, 0, 0, 0];

    // Precompute month start days
    this.monthStartDays = new Array(13);
    let count = -1;
    for (let i = 0; i < 13; i++) {
      this.monthStartDays[i] = count;
      count += this.monthLengths2005[i + 1];
    }

    // Color scheme
    this.CS = new HistogramColorScheme();

    // Build bands (month boundaries)
    this.bands = new Array(this.nBands);
    for (let i = 0; i < this.nBands; i++) {
      this.bands[i] = new HistogramBand(i, this);
      this.bands[i].setDimensions(
        this.histogramL,
        DUMPSTER_APP_H - 1 - (this.nBands * this.bandH) + (this.bandH * i),
        this.histogramW,
        this.bandH
      );
      this.bands[i].computeBoundaries();
    }
  }

  //-------------------------------------------------------------
  loop() {
    this._updateMouseInformation();
    this._updateHistogramVerticalScale();
    this.dataIndexOfCursor = this._pixelToDataIndex(Math.floor(this.mouseXf));
    this._drawBackground();
    this._drawHistogramData();
    this._drawCurrentDataBounds();
    this._drawBands();
    this._drawOverallFrames();
  }

  //-------------------------------------------------------------
  _updateHistogramVerticalScale() {
    this.histogramValueMax = Math.max(1, this._getMaxDataValueInRange(this.indexLo, this.indexHi));
    this.histogramValueScaleFactor = (this.histogramH * HISTOGRAM_SPACE_OCCUPANCY) / this.histogramValueMax;
  }

  //-------------------------------------------------------------
  dataIndexToPixel(index) {
    if (index < this.indexLo || index > this.indexHi) return -1;
    const warped = (index - this.indexLo) / (this.indexHi - this.indexLo);
    let frac;
    if (warped <= this.mousePivot) {
      frac = this.mousePivot * (1.0 - Math.pow(1.0 - warped / this.mousePivot, 1.0 / this.mousePower));
    } else {
      frac = this.mousePivot + (1.0 - this.mousePivot) *
             Math.pow((warped - this.mousePivot) / (1.0 - this.mousePivot), 1.0 / this.mousePower);
    }
    return Math.round(this.histogramL + frac * this.histogramW);
  }

  _pixelToDataIndex(hpixel) {
    let fraca = (hpixel - this.histogramL) / this.histogramW;
    fraca = Math.min(1, Math.max(0, fraca));
    fraca = this._warpFraction(fraca, this.mousePower);
    const idx = this.indexLo + Math.floor(fraca * (this.indexHi - this.indexLo));
    return Math.min(this.indexHi, Math.max(this.indexLo, idx));
  }

  _warpFraction(frac, power) {
    if (frac <= this.mousePivot) {
      const cube = Math.pow(1 - frac / this.mousePivot, power);
      return this.mousePivot * (1 - cube);
    } else {
      const oneMpivot = 1 - this.mousePivot;
      const cube = Math.pow((frac - this.mousePivot) / oneMpivot, power);
      return this.mousePivot + oneMpivot * cube;
    }
  }

  _cursorToPixelBounds() {
    const mouseXi = Math.max(this.histogramL, Math.min(this.histogramR - 1, Math.floor(this.mouseXf)));
    let pixela = this.dataIndexToPixel(this.dataIndexOfCursor);
    let pixelb = (this.dataIndexOfCursor < this.indexHi - 1 && mouseXi < this.histogramR - 1)
      ? this.dataIndexToPixel(this.dataIndexOfCursor + 1)
      : this.histogramR - 1;
    if (pixelb < pixela) pixelb = pixela;
    this.tmpPixelBounds[0] = pixela;
    this.tmpPixelBounds[1] = pixelb;
    return this.tmpPixelBounds;
  }

  _getMaxDataValueInRange(lo, hi) {
    lo = Math.max(0, Math.min(this.nDatam1, lo));
    hi = Math.max(0, Math.min(this.nDatam1, hi));
    let mx = 0;
    for (let i = lo; i < hi; i++) {
      if (this.data[i].N > mx) mx = this.data[i].N;
    }
    return mx;
  }

  //-------------------------------------------------------------
  informOfMouse(x, y, p) {
    this.bMouseInside = false;

    if (y >= this.histogramT && x <= this.histogramR && x >= this.histogramL &&
        y <= this.histogramT + HISTOGRAM_H) {
      this.bMouseInside = true;
      this.mouseX = Math.min(this.histogramR, x);
      this.mouseY = this.bUseMouseYMagnification ? y
                  : this.histogramT + this.histogramH * Math.sqrt(0.1);
      this.bMousePressed = p;
      this.hiliteMode = DH_HILITEMODE_MAUS;
    }

    if (!this.bMouseInside) {
      let breakupIndex = DUMPSTER_INVALID;
      const moBI = this.KOS.currentMouseoverBreakupId;
      const seBI = this.KOS.currentSelectedBreakupId;

      if (moBI !== DUMPSTER_INVALID) {
        if (moBI === seBI) {
          breakupIndex = seBI;
          this.hiliteMode = DH_HILITEMODE_SELE;
        } else {
          breakupIndex = moBI;
          this.hiliteMode = DH_HILITEMODE_OVER;
        }
      } else if (seBI !== DUMPSTER_INVALID) {
        breakupIndex = seBI;
        this.hiliteMode = DH_HILITEMODE_SELE;
      } else {
        this.hiliteMode = DH_HILITEMODE_NONE;
      }

      if (breakupIndex !== DUMPSTER_INVALID) {
        const breakupDate = BM.bups[breakupIndex].date;
        const kosDateFrac = Math.max(0, Math.min(1, (breakupDate - 0.5) / this.indexHi));
        this.mouseX = this.histogramL + kosDateFrac * (this.histogramR - this.histogramL);
        this.mouseY = this.histogramT + this.histogramH * Math.sqrt(0.1);
      }
    }

    switch (this.hiliteMode) {
      case DH_HILITEMODE_NONE:
      case DH_HILITEMODE_MAUS:
        this.curdat_rT = red(this.CS.bandMouseColor);
        this.curdat_gT = green(this.CS.bandMouseColor);
        this.curdat_bT = blue(this.CS.bandMouseColor);
        break;
      case DH_HILITEMODE_OVER:
        this.curdat_rT = 16; this.curdat_gT = 64; this.curdat_bT = 255;
        break;
      case DH_HILITEMODE_SELE:
        this.curdat_rT = 255; this.curdat_gT = 255; this.curdat_bT = 0;
        break;
    }

    this.curdat_r = DH_BLURA * this.curdat_r + DH_BLURB * this.curdat_rT;
    this.curdat_g = DH_BLURA * this.curdat_g + DH_BLURB * this.curdat_gT;
    this.curdat_b = DH_BLURA * this.curdat_b + DH_BLURB * this.curdat_bT;
  }

  //-------------------------------------------------------------
  _updateMouseInformation() {
    const A = this.mouseBlur, B = 1.0 - A;
    if (this.bMouseInside) {
      this.mouseXf = A * this.mouseXf + B * this.mouseX;
      this.mouseYf = A * this.mouseYf + B * this.mouseY;
    } else {
      this.mouseXf = this.mouseX;
      this.mouseYf = this.mouseY;
    }

    if (this.bMouseInside) {
      if (this.bUseMouseYMagnification) {
        let fracmy = (this.mouseYf - this.histogramT) / this.histogramH;
        fracmy = Math.min(1, Math.max(0, fracmy));
        fracmy = fracmy * fracmy;
        this.mousePowerTarget = fracmy * 0.75 + 2.0;
      } else {
        this.mousePowerTarget = 2.0;
      }
    } else {
      this.mousePowerTarget = 1.0;
    }
    this.mousePower = 0.8 * this.mousePower + 0.2 * this.mousePowerTarget;

    this.mousePivot = Math.max(0.0000001, Math.min(0.999999,
      (this.mouseXf - this.histogramL) / this.histogramW));
  }

  //-------------------------------------------------------------
  _drawBackground() {
    if (this.bUseBackgroundImage && this.histbg) {
      image(this.histbg, this.histogramL, this.histogramT);
      stroke(255, 200, 200, 24);
      line(this.histogramL, this.histogramT + 1, this.histogramR, this.histogramT + 1);
    } else {
      noStroke();
      fill(this.CS.histogramBackgroundFieldCol);
      rect(this.histogramL, this.histogramT, this.histogramW, this.histogramH);
      stroke(255, 200, 200, 24);
      line(this.histogramL, this.histogramT + 1, this.histogramR, this.histogramT + 1);
    }
  }

  //-------------------------------------------------------------
  _drawHistogramData() {
    const nDataToShow  = this.indexHi - this.indexLo;
    const nDataToShowf = nDataToShow;
    const nXinv        = 1.0 / this.histogramW;
    const histTshad    = Math.floor(this.histogramT + 0.5 * this.histogramH);

    const band0 = this.CS.bandFillColor0;
    const band1 = this.CS.bandFillColor1;
    const bandP = this.CS.bandCapColor;
    const bandAvg = lerpColor(band0, band1, 0.5);
    const bandCurCol = color(this.curdat_r, this.curdat_g, this.curdat_b);

    for (let i = this.histogramL; i < this.histogramR; i++) {
      const fixi  = i + 0.5;
      let fraca = (i     - this.histogramL) * nXinv;
      let fracb = (i + 1 - this.histogramL) * nXinv;

      fraca = this._warpFraction(fraca, this.mousePower);
      fracb = this._warpFraction(fracb, this.mousePower);

      let indexa = this.indexLo + Math.floor(fraca * nDataToShowf);
      let indexb = this.indexLo + Math.floor(fracb * nDataToShowf);
      indexa = Math.min(this.nDatam1, Math.max(0, indexa));
      indexb = Math.min(this.nDatam1, Math.max(0, indexb));
      const indexRange = indexb - indexa;

      let localValueMax = 0;
      if (indexRange > 1) {
        for (let j = indexa; j <= indexb; j++) {
          if (this.data[j].N > localValueMax) localValueMax = this.data[j].N;
        }
      } else {
        localValueMax = this.data[indexa].N;
      }
      const Y = this.histogramB - localValueMax * this.histogramValueScaleFactor;

      if (indexa === this.dataIndexOfCursor) {
        this.dataValueOfCursor = localValueMax;
        this.tmpPixelBounds[2] = Math.floor(this.histogramB - this.dataValueOfCursor * this.histogramValueScaleFactor);
        this.tmpPixelBounds[3] = this.histogramB;
        stroke(bandCurCol);
      } else {
        const evenDay = (indexa % 2) === 0;
        const bandColor = evenDay ? band0 : band1;
        if (this.bMouseInside) {
          const dataSpan = (fracb - fraca) * nDataToShowf;
          const stripePixelWidth = dataSpan > 0 ? 1.0 / dataSpan : 1.0;
          let t = Math.max(0, Math.min(1, stripePixelWidth / DH_STRIPE_ANTIALIAS_PX));
          t = t*t*t*t;
          // stroke(t >= 1.0 ? bandColor : lerpColor(color(0, 255, 0), bandColor, t)); // debug
          stroke(t >= 1.0 ? bandColor : lerpColor(bandAvg, bandColor, t));
        } else {
          stroke(bandColor);
        }
      }
      line(fixi, this.histogramB, fixi, Y);

      stroke(bandP);
      point(fixi, Y - 1);
    }
  }

  //-------------------------------------------------------------
  _drawCurrentDataBounds() {
    this._cursorToPixelBounds();
    const p = this.tmpPixelBounds[0];
    const q = this.tmpPixelBounds[1];
    const t = this.tmpPixelBounds[2];


    if (this.bMouseInside) {
      this.centerOfBoundsX = Math.min(q, Math.max(p, this.centerOfBoundsX));
      this.centerOfBoundsX = 0.6 * this.centerOfBoundsX + 0.4 * ((p + q) / 2.0);
    } else {
      this.centerOfBoundsX = (p + q) / 2.0;
    }

    const bandCurCol = color(this.curdat_r, this.curdat_g, this.curdat_b);
    stroke(bandCurCol);
    line(this.centerOfBoundsX, t, this.centerOfBoundsX, this.histogramT);

    noStroke();
    textFont(this.font6, 6);
    fill(bandCurCol);
    const strY = this.histogramT + 9;

    let nbupStr = '';
    if (this.dataIndexOfCursor >= 0 && this.dataIndexOfCursor < this.nData) {
      nbupStr = String(this.data[this.dataIndexOfCursor].N);
    }
    const dateString = this._dataIndexToDateString(this.dataIndexOfCursor);

    if (this.histogramR - this.centerOfBoundsX > 52) {
      text(dateString, this.centerOfBoundsX + 4, strY);
      text(nbupStr, this.centerOfBoundsX - nbupStr.length * 6 + 1, strY);
    } else {
      text(dateString, this.centerOfBoundsX - 42, strY);
      text(nbupStr, this.centerOfBoundsX + 4, strY);
    }
  }

  //-------------------------------------------------------------
  _dataIndexToDateString(index) {
    if (index < 0 || index >= this.nData) return '';
    let monthCount = 0;
    while (index > this.monthStartDays[monthCount] && monthCount < 12) monthCount++;
    monthCount--;
    const dayOfMonth = index - this.monthStartDays[monthCount];
    if (dayOfMonth > this.monthLengths2005[monthCount + 1]) return '';
    return this.dayNames[index % 7] + ' ' + this.monthNames[monthCount % 12] + ' ' + dayOfMonth;
  }

  //-------------------------------------------------------------
  _drawHistogramVerticalScale() {
    const vertL = 0, vertR = this.histogramL;
    const vertW = vertR - vertL;
    const vertT = this.histogramT, vertB = this.histogramB;
    const vertH = this.histogramH;
    const vertTextT = vertT + 9;
    const keyFontAscent = 8.0;
    const labelDensity  = 6;
    const charW = 4;

    const vertTxCol = this.CS.vertTxCol;
    const vertLnCol = this.CS.vertLnCol;
    const vertBgCol = this.CS.vertBgCol;

    noStroke();
    fill(vertBgCol);
    rect(vertL, vertT, vertW, vertH);

    textFont(this.font6, 6);

    const skipList = [1,5,10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000];
    let majorLabelSkip = Math.max(1, Math.floor(keyFontAscent * labelDensity / (vertH / this.histogramValueMax)));
    let skindex = 0, minn = 1e9;
    for (let ind = skipList.length - 1; ind >= 0; ind--) {
      const fact = Math.abs(skipList[ind] / majorLabelSkip - 1);
      if (fact < minn) { minn = fact; skindex = ind; }
    }
    majorLabelSkip = skipList[Math.max(0, Math.min(skindex, skipList.length - 1))];

    const spaceSizeMaj = majorLabelSkip * this.histogramValueScaleFactor;
    fill(vertTxCol);
    let labelY = vertB - spaceSizeMaj;
    let count = 1;
    while (labelY > vertTextT) {
      const labelYi = Math.round(labelY);
      stroke(vertBgCol);
      line(0, labelYi, vertR, labelYi);
      stroke(vertLnCol);
      line(0, labelYi, vertR, labelYi);
      const labelStr = String(count * majorLabelSkip);
      text(labelStr, vertR - labelStr.length * charW - 1, labelYi - 2);
      labelY -= spaceSizeMaj;
      count++;
    }
  }

  //-------------------------------------------------------------
  _drawBands() {
    for (let i = 0; i < this.nBands; i++) {
      this.bands[i].render();
      this.bands[i].drawBoundaries();
    }
    noStroke();
    fill(0);
    rect(this.xoffset, this.yoffset, this.histogramL, this.histogramH);
    fill(64);
    rect(this.xoffset, this.histogramB, this.histogramL, 10);
    fill(128);
    textFont(this.font6, 6);
    text('2005', this.bands[0].L - 19, this.bands[0].B - 2);
  }

  //-------------------------------------------------------------
  _drawOverallFrames() {
    stroke(0);
    noFill();
    rect(this.xoffset, this.yoffset, this.width - 1, this.height - 1);
    line(this.histogramL - 1, this.histogramT, this.histogramL - 1, this.histogramT + this.height - 1);
    line(this.xoffset, this.histogramB, this.histogramL, this.histogramB);
  }
}


//===========================================================================
// Band (inner class in original; outer class here, holds ref to parent DH)
class HistogramBand {

  constructor(position, dh) {
    this._dh = dh;
    this.ID  = position;
    this.name = ['Year','Month','Week','Day'][position] || '';
    this.L = this.R = this.T = this.B = this.W = this.H = 0;
    this.boundaries    = [];
    this.boundaryLocs  = [];
    this.boundarySeps  = [];
    this.nBoundaries   = 0;
  }

  setDimensions(l, t, w, h) {
    this.W = w; this.H = h;
    this.L = l; this.T = t;
    this.R = l + w; this.B = t + h;
  }

  render() {
    noStroke();
    fill(this._dh.CS.bandBgCol);
    rect(this.L, this.T, this.W, this.H);
    stroke(this._dh.CS.bandEdgeColor);
    noFill();
    rect(this.L - 1, this.T, this.W + 1, this.H);
  }

  drawBoundaries() {
    if (this.nBoundaries === 0) return;
    const dh = this._dh;
    let boundaryPixelPrev = 0;

    for (let i = 1; i < this.nBoundaries; i++) {
      const bp = dh.dataIndexToPixel(this.boundaries[i]);
      this.boundaryLocs[i] = (bp === -1) ? dh.histogramR : bp;
      this.boundarySeps[i - 1] = this.boundaryLocs[i] - boundaryPixelPrev;
      boundaryPixelPrev = this.boundaryLocs[i];
    }

    const top = Math.floor(this.T + 1);
    const bot = Math.floor(this.B - 1);
    const texbot = bot - 1;
    const maxSep = 80;
    const txC = dh.CS.vertTxCol;
    const bgC = dh.CS.bandBgCol;

    stroke(dh.CS.vertLnCol);
    textFont(dh.font6, 6);

    for (let i = 0; i < this.nBoundaries; i++) {
      const sep = this.boundarySeps[i] || 0;
      let loc = this.boundaryLocs[i] || 0;
      if (loc === 0 && i === 0) loc = dh.histogramL;

      if (i > 0) line(loc, top, loc, bot);

      const texfrac = Math.max(0, Math.min(sep, maxSep)) / maxSep;
      fill(0);
      noStroke(); 
      text(dh.monthNames[i % 12], loc + 3, texbot);
    }
  }

  computeBoundaries() {
    const monthLengths = this._dh.monthLengths2005;
    const nData = this._dh.nData;
    this.boundaries   = new Array(nData).fill(0);
    this.boundaryLocs = new Array(nData).fill(0);
    this.boundarySeps = new Array(nData).fill(0);
    let count = 0;

    if (this.ID === 0) { // MONTHS
      let dayCount = 0;
      for (let i = 0; i < monthLengths.length; i++) {
        dayCount += monthLengths[i];
        this.boundaries[count++] = dayCount;
      }
    } else if (this.ID === 1) { // WEEKS
      for (let i = 0; i < nData; i++) {
        if (i % 7 === 0) this.boundaries[count++] = i;
      }
    }
    this.nBoundaries = count;
  }
}
