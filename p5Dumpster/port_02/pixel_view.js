// Ported from PixelView.pde
// p5 pixel adaptation: img.pixels is a flat Uint8ClampedArray [R,G,B,A, ...].
// A separate _pixData buffer mirrors the pixel values for magnification readback
// without GPU round-trips.

class PixelView {

  constructor(BM, KOS) {
    this.BM  = BM;
    this.KOS = KOS;

    this.myMouseX = 0;
    this.myMouseY = 0;
    this.keyOffsetX = 0;
    this.keyOffsetY = 0;

    this.bMouseInView    = false;
    this.mousePixelIndex = DUMPSTER_INVALID;

    this.currentSelectedBreakupId  = DUMPSTER_INVALID;
    this.currentMouseoverBreakupId = DUMPSTER_INVALID;
    this.pixelClickedBreakupId     = DUMPSTER_INVALID;
    this.pixelIndexOfSelectedBupId  = DUMPSTER_INVALID;
    this.pixelIndexOfMouseoverBupId = DUMPSTER_INVALID;

    this.hiliteXf   = DUMPSTER_INVALID;
    this.hiliteYf   = DUMPSTER_INVALID;
    this.hiliteMoXf = DUMPSTER_INVALID;
    this.hiliteMoYf = DUMPSTER_INVALID;
    this.moAlph = 1.0;

    this.magXc = DUMPSTER_INVALID; // center pixel col of the current mag view
    this.magYc = DUMPSTER_INVALID; // center pixel row of the current mag view

    this.bHasMagSelection = false; // true after a mag click, cleared when mouse enters pixel view

    this.L = PIXELVIEW_L;
    this.T = PIXELVIEW_T;
    this.R = PIXELVIEW_L + PIXELVIEW_W;
    this.B = PIXELVIEW_T + PIXELVIEW_H;
    this.W = PIXELVIEW_W;
    this.H = PIXELVIEW_H;

    this.nPixels = PIXELVIEW_W * PIXELVIEW_H;

    // p5.js image for displaying the pixel grid
    this.img = createImage(PIXELVIEW_W, PIXELVIEW_H);

    // Mirror buffer for magnification readback (RGBA, same layout as img.pixels)
    this._pixData = new Uint8Array(this.nPixels * 4);

    // Magnification loupe parameters
    this.nmagX = 7;
    this.nmagY = 5;
    this.nmagScale = 18;

    this._constructLUTs();
    this.PIN = new PixelIndexer(BM);
    this.recalculate();
  }

  //=======================================================================
  _constructLUTs() {
    this.rLUT = new Uint8Array(256);
    this.gLUT = new Uint8Array(256);
    this.bLUT = new Uint8Array(256);

    const r0 = 0,   r1 = 255, rpow = 1.20;
    const g0 = 16,  g1 = 190, gpow = 2.50;
    const b0 = 16,  b1 = 255 - MALE_BLUE_AMOUNT, bpow = 2.60;

    for (let i = 0; i < 256; i++) {
      const frac = i / 255.0;
      this.rLUT[i] = Math.floor(r0 + (r1 - r0) * Math.pow(frac, rpow));
      this.gLUT[i] = Math.floor(g0 + (g1 - g0) * Math.pow(frac, gpow));
      this.bLUT[i] = Math.floor(b0 + (b1 - b0) * Math.pow(frac, bpow));
    }
  }

  //=======================================================================
  updateImage() {
    this.recalculate();
  }

  //=======================================================================
  recalculate() {
    this.img.loadPixels();
    const pd = this._pixData;
    const ip = this.img.pixels;

    if (this.BM.currentlySelectedBreakupId === DUMPSTER_INVALID) {
      for (let i = 0; i < this.nPixels; i++) {
        const idx = i * 4;
        ip[idx] = ip[idx+1] = ip[idx+2] = 0;
        ip[idx+3] = 255;
        pd[idx] = pd[idx+1] = pd[idx+2] = 0;
        pd[idx+3] = 255;
      }
    } else {
      const MALES       = this.BM.MALES;
      const SIMILARITIES = this.BM.SIMILARITIES;
      const pixToBup    = this.PIN.PixelIndexToBupIndex;
      const rLUT = this.rLUT, gLUT = this.gLUT, bLUT = this.bLUT;

      for (let i = 0; i < this.nPixels; i++) {
        const bupIndex = pixToBup[i];
        const c = Math.floor(255.0 * SIMILARITIES[bupIndex]);
        const m = MALES[bupIndex];
        const idx = i * 4;

        const rv = rLUT[c];
        const gv = gLUT[c];
        const bv = Math.min(255, bLUT[c] + m);

        ip[idx]   = rv;  ip[idx+1] = gv;  ip[idx+2] = bv;  ip[idx+3] = 255;
        pd[idx]   = rv;  pd[idx+1] = gv;  pd[idx+2] = bv;  pd[idx+3] = 255;
      }
    }
    this.img.updatePixels();
  }

  //=======================================================================
  render() {
    this._updateSelectionInfo();
    this._updateMouseoverInfo();

    // Draw scaled pixel image
    image(this.img, PIXELVIEW_L, PIXELVIEW_T, PIXELVIEW_W * PIXELVIEW_SCALE, PIXELVIEW_H * PIXELVIEW_SCALE);

    // Border
    noFill();
    stroke(0);
    rect(PIXELVIEW_L - 1, PIXELVIEW_T - 1, PIXELVIEW_W * PIXELVIEW_SCALE + 1, PIXELVIEW_H * PIXELVIEW_SCALE + 1);

    this._drawCurrentMouseoverBreakupId();
    this._drawCurrentSelectedBreakupId();
    this._renderMagnificationView();
  }

  //=======================================================================
  _renderMagnificationView() {
    let pid = DUMPSTER_INVALID;
    let bMouseover = false;

    if (this.hiliteMoXf !== DUMPSTER_INVALID &&
        this.pixelIndexOfMouseoverBupId < this.nPixels &&
        this.pixelIndexOfMouseoverBupId > DUMPSTER_INVALID) {
      pid = this.pixelIndexOfMouseoverBupId;
      bMouseover = true;
    } else if (this.pixelIndexOfSelectedBupId > DUMPSTER_INVALID &&
               this.pixelIndexOfSelectedBupId < this.nPixels) {
      pid = this.pixelIndexOfSelectedBupId;
    }

    if (pid === DUMPSTER_INVALID) return;

    let xc = Math.round(this.hiliteMoXf / PIXELVIEW_SCALE) % PIXELVIEW_W;
    let yc = Math.round(this.hiliteMoYf / PIXELVIEW_SCALE) % PIXELVIEW_H;
    if (!bMouseover) {
      xc = pid % PIXELVIEW_W;
      yc = Math.floor(pid / PIXELVIEW_W);
    }
    this.magXc = xc;
    this.magYc = yc;

    const xMagStart = this.nmagScale - 1;
    const yMagStart = PIXELVIEW_H * PIXELVIEW_SCALE + this.nmagScale - 1;
    const yo = Math.floor(this.nmagY / 2);
    const xo = Math.floor(this.nmagX / 2);

    noStroke();
    for (let y = 0; y < this.nmagY; y++) {
      const yp = yc + y - yo;
      if (yp < 0 || yp >= PIXELVIEW_H) continue;
      for (let x = 0; x < this.nmagX; x++) {
        const xp = xc + x - xo;
        if (xp < 0 || xp >= PIXELVIEW_W) continue;
        const pindex = yp * PIXELVIEW_W + xp;
        const idx = pindex * 4;
        fill(this._pixData[idx], this._pixData[idx+1], this._pixData[idx+2]);
        rect(xMagStart + this.nmagScale * x, yMagStart + this.nmagScale * y,
             this.nmagScale, this.nmagScale);
      }
    }

    // Colorful border using HelpDisplayer's current text color
    let rectR = 200, rectG = 200, rectB = 200;
    if (typeof HD !== 'undefined' && HD) {
      rectR = HD.textr; rectG = HD.textg; rectB = HD.textb;
    }

    push();
    translate(xMagStart, yMagStart - 0);
    noFill();
    stroke(rectR * 0.7, rectG * 0.7, rectB * 0.7);
    rect(0, 0, 7 * this.nmagScale, 5 * this.nmagScale);
    rect(-1, -1, 7 * this.nmagScale + 2, 5 * this.nmagScale + 2);
    stroke(rectR, rectG, rectB);
    line(this.nmagScale * 3.5, 0, this.nmagScale * 3.5, this.nmagScale * 2);
    rect(this.nmagScale * 3,   this.nmagScale * 2, this.nmagScale,     this.nmagScale);
    rect(this.nmagScale * 3-1, this.nmagScale * 2 - 1, this.nmagScale + 2, this.nmagScale + 2);
    pop();
  }

  //=======================================================================
  _drawCurrentMouseoverBreakupId() {
    if (this.hiliteMoXf === DUMPSTER_INVALID) return;
    if (this.pixelIndexOfMouseoverBupId >= this.nPixels) return;

    if (this.pixelIndexOfMouseoverBupId > DUMPSTER_INVALID) {
      const xi = PIXELVIEW_SCALE * ((this.pixelIndexOfMouseoverBupId + this.keyOffsetX) % PIXELVIEW_W);
      const yi = PIXELVIEW_SCALE * (Math.floor((this.pixelIndexOfMouseoverBupId + this.keyOffsetY * PIXELVIEW_W) / PIXELVIEW_W));

      const A = 0.675, B = 1.0 - A;
      this.hiliteMoXf = A * this.hiliteMoXf + B * xi;
      this.hiliteMoYf = A * this.hiliteMoYf + B * yi;
      if (Math.abs(this.hiliteMoXf - xi) < 3.0 && Math.abs(this.hiliteMoYf - yi) < 3.0) {
        this.hiliteMoXf = xi; this.hiliteMoYf = yi;
      }

      this.moAlph = 1.0;
      fill(0, 0, 255, this.moAlph * 48);
      stroke(0, 0, 255);
      rect(this.hiliteMoXf - 3, this.hiliteMoYf - 3, 10, 10);
      noFill();
      rect(this.hiliteMoXf - 4, this.hiliteMoYf - 4, 12, 12);
      stroke(0, 0, 255, this.moAlph * 50);
      rect(this.hiliteMoXf - 5, this.hiliteMoYf - 5, 14, 14);
    } else {
      this.moAlph *= HEART_BLUR_CA;
      if (this.moAlph > 0.035) {
        fill(0, 0, 255, this.moAlph * 48);
        stroke(0, 0, 255, this.moAlph * 255);
        rect(this.hiliteMoXf - 3, this.hiliteMoYf - 3, 10, 10);
        noFill();
        rect(this.hiliteMoXf - 4, this.hiliteMoYf - 4, 12, 12);
        stroke(0, 0, 255, this.moAlph * 50);
        rect(this.hiliteMoXf - 5, this.hiliteMoYf - 5, 14, 14);
      }
    }
  }

  //=======================================================================
  _drawCurrentSelectedBreakupId() {
    if (this.pixelIndexOfSelectedBupId === DUMPSTER_INVALID ||
        this.pixelIndexOfSelectedBupId < 0 ||
        this.pixelIndexOfSelectedBupId >= this.nPixels) return;

    const xi = PIXELVIEW_SCALE * (this.pixelIndexOfSelectedBupId % PIXELVIEW_W);
    const yi = PIXELVIEW_SCALE * Math.floor(this.pixelIndexOfSelectedBupId / PIXELVIEW_W);

    this.hiliteXf = 0.65 * this.hiliteXf + 0.35 * xi;
    this.hiliteYf = 0.65 * this.hiliteYf + 0.35 * yi;
    if (Math.abs(this.hiliteXf - xi) < 3 && Math.abs(this.hiliteYf - yi) < 3) {
      this.hiliteXf = xi; this.hiliteYf = yi;
    }

    noFill();
    stroke(255, 255, 0);
    rect(this.hiliteXf - 3, this.hiliteYf - 3, 10, 10);
    rect(this.hiliteXf - 4, this.hiliteYf - 4, 12, 12);
    rect(this.hiliteXf - 5, this.hiliteYf - 5, 14, 14);
    stroke(255, 100, 0);
    rect(this.hiliteXf - 6, this.hiliteYf - 6, 16, 16);
    stroke(255, 100, 0, 100);
    rect(this.hiliteXf - 7, this.hiliteYf - 7, 18, 18);
    stroke(255, 100, 0, 50);
    line(this.hiliteXf - 8,  this.hiliteYf - 6,  this.hiliteXf - 8,  this.hiliteYf + 11);
    line(this.hiliteXf + 12, this.hiliteYf - 6,  this.hiliteXf + 12, this.hiliteYf + 11);
    line(this.hiliteXf - 6,  this.hiliteYf - 8,  this.hiliteXf + 11, this.hiliteYf - 8);
    line(this.hiliteXf - 6,  this.hiliteYf + 12, this.hiliteXf + 11, this.hiliteYf + 12);
  }

  //=======================================================================
  informOfMouse(mx, my, pressed) {
    const mxi = Math.floor(mx);
    const myi = Math.floor(my);

    if (!pressed) {
      if (this.myMouseX !== mx || this.myMouseY !== my) {
        this.keyOffsetX = 0;
        this.keyOffsetY = 0;
      }
    }
    this.myMouseX = mx;
    this.myMouseY = my;

    this.bMouseInView    = false;
    this.mousePixelIndex = DUMPSTER_INVALID;

    if (Math.floor(mxi / PIXELVIEW_SCALE) >= this.L &&
        Math.floor(mxi / PIXELVIEW_SCALE) < this.R &&
        Math.floor(myi / PIXELVIEW_SCALE) >= this.T &&
        Math.floor(myi / PIXELVIEW_SCALE) < this.B) {
      this.bHasMagSelection = false; // real mouse entry clears the mag-click lock
    }

    if (Math.floor(mxi / PIXELVIEW_SCALE) >= this.L &&
        Math.floor(mxi / PIXELVIEW_SCALE) < this.R &&
        Math.floor(myi / PIXELVIEW_SCALE) >= this.T &&
        Math.floor(myi / PIXELVIEW_SCALE) < this.B) {
      this.bMouseInView = true;
      this.mousePixelIndex = (Math.floor(myi / PIXELVIEW_SCALE) - PIXELVIEW_T) * PIXELVIEW_W +
                             (Math.floor(mxi / PIXELVIEW_SCALE) - PIXELVIEW_L);
      this.mousePixelIndex = min(this.nPixels - 1, max(0, this.mousePixelIndex));

      if (!pressed && this.mousePixelIndex >= 0 && this.mousePixelIndex < this.nPixels) {
        this.KOS.currentMouseoverBreakupId = this.PIN.PixelIndexToBupIndex[this.mousePixelIndex];
        const offsetPindex = min(this.nPixels - 1, max(0,
          this.mousePixelIndex + this.keyOffsetX + this.keyOffsetY * PIXELVIEW_W));
        this.KOS.currentMouseoverBreakupIdWithOffset = this.PIN.PixelIndexToBupIndex[offsetPindex];
      }
    } else {
      if (!this.bHasMagSelection && this.KOS.currentMouseoverBreakupId === DUMPSTER_INVALID) {
        this.pixelIndexOfMouseoverBupId = DUMPSTER_INVALID;
      }
    }
  }

  //=======================================================================
  sendArrowKey(k) {
    if (!this.bMouseInView) return;
    switch (k) {
      case 10: this._returnPressed(); break;
      case LEFT_ARROW:
        this.keyOffsetX = max(this.keyOffsetX - 1, -(this.pixelIndexOfMouseoverBupId % PIXELVIEW_W));
        break;
      case UP_ARROW:
        this.keyOffsetY = max(this.keyOffsetY - 1, -Math.floor(this.pixelIndexOfMouseoverBupId / PIXELVIEW_W));
        break;
      case RIGHT_ARROW:
        this.keyOffsetX = min(this.keyOffsetX + 1, PIXELVIEW_W - (this.pixelIndexOfMouseoverBupId % PIXELVIEW_W) - 1);
        break;
      case DOWN_ARROW:
        this.keyOffsetY = min(this.keyOffsetY + 1, PIXELVIEW_H - Math.floor(this.pixelIndexOfMouseoverBupId / PIXELVIEW_W) - 1);
        break;
    }
  }

  //=======================================================================
  _returnPressed() {
    this.pixelClickedBreakupId = DUMPSTER_INVALID;
    if (this.KOS.currentMouseoverBreakupIdWithOffset !== DUMPSTER_INVALID) {
      this.pixelClickedBreakupId = this.KOS.currentMouseoverBreakupIdWithOffset;
      if (this.pixelClickedBreakupId !== DUMPSTER_INVALID) {
        this._updateSelectionInfo();
        this.keyOffsetX = 0;
        this.keyOffsetY = 0;
      }
    }
  }

  //=======================================================================
  // Returns the bupId at the current mouse pixel, or DUMPSTER_INVALID.
  getMousePixelBupId() {
    if (this.mousePixelIndex === DUMPSTER_INVALID ||
        this.mousePixelIndex < 0 ||
        this.mousePixelIndex >= this.nPixels) return DUMPSTER_INVALID;
    return this.PIN.PixelIndexToBupIndex[this.mousePixelIndex];
  }

  //=======================================================================
  // Snap the yellow cursor immediately to bupId (no animation), used during drag.
  snapSelectionToBupId(bupId) {
    if (bupId === DUMPSTER_INVALID || bupId < 0 || bupId >= N_BREAKUP_DATABASE_RECORDS) return;
    const pindex = this.PIN.BupIndexToPixelIndex[bupId];
    if (pindex === DUMPSTER_INVALID || pindex < 0 || pindex >= this.nPixels) return;
    const xi = (pindex % PIXELVIEW_W) * PIXELVIEW_SCALE;
    const yi = Math.floor(pindex / PIXELVIEW_W) * PIXELVIEW_SCALE;
    this.hiliteXf = xi;
    this.hiliteYf = yi;
    this.pixelIndexOfSelectedBupId = pindex;
    this.currentSelectedBreakupId  = bupId;
    this.KOS.currentSelectedBreakupId = bupId;
  }

  //=======================================================================
  // Snap all highlight positions to the pixel corresponding to bupId,
  // as if the user had clicked it directly in the pixel view.
  activateBupId(bupId) {
    if (bupId === DUMPSTER_INVALID || bupId < 0 || bupId >= N_BREAKUP_DATABASE_RECORDS) return;
    const pindex = this.PIN.BupIndexToPixelIndex[bupId];
    if (pindex === DUMPSTER_INVALID || pindex < 0 || pindex >= this.nPixels) return;

    const xi = (pindex % PIXELVIEW_W) * PIXELVIEW_SCALE;
    const yi = Math.floor(pindex / PIXELVIEW_W) * PIXELVIEW_SCALE;

    this.hiliteXf   = xi;  this.hiliteYf   = yi;
    this.hiliteMoXf = xi;  this.hiliteMoYf = yi;
    this.pixelClickedBreakupId = bupId;
    this.KOS.currentSelectedBreakupId    = bupId;
    this.KOS.currentMouseoverBreakupId   = bupId;
    this.pixelIndexOfSelectedBupId  = pindex;
    this.pixelIndexOfMouseoverBupId = pindex;
    this.currentSelectedBreakupId   = bupId;
    this.currentMouseoverBreakupId  = bupId;
    this.keyOffsetX = 0;
    this.keyOffsetY = 0;
    this.bHasMagSelection = true;
  }

  //=======================================================================
  // Returns the bupId of the mag cell clicked, or DUMPSTER_INVALID.
  checkMagClick(mx, my) {
    if (this.magXc === DUMPSTER_INVALID || this.magYc === DUMPSTER_INVALID) return DUMPSTER_INVALID;

    const xMagStart = this.nmagScale - 1;
    const yMagStart = PIXELVIEW_H * PIXELVIEW_SCALE + this.nmagScale - 1;

    if (mx < xMagStart || mx >= xMagStart + this.nmagX * this.nmagScale) return DUMPSTER_INVALID;
    if (my < yMagStart || my >= yMagStart + this.nmagY * this.nmagScale) return DUMPSTER_INVALID;

    const dx = Math.floor((mx - xMagStart) / this.nmagScale);
    const dy = Math.floor((my - yMagStart) / this.nmagScale);

    const targetX = this.magXc + dx - Math.floor(this.nmagX / 2);
    const targetY = this.magYc + dy - Math.floor(this.nmagY / 2);

    if (targetX < 0 || targetX >= PIXELVIEW_W) return DUMPSTER_INVALID;
    if (targetY < 0 || targetY >= PIXELVIEW_H) return DUMPSTER_INVALID;

    const pindex = targetY * PIXELVIEW_W + targetX;
    if (pindex < 0 || pindex >= this.nPixels) return DUMPSTER_INVALID;

    const bupId = this.PIN.PixelIndexToBupIndex[pindex];
    if (bupId === DUMPSTER_INVALID || bupId < 0 || bupId >= N_BREAKUP_DATABASE_RECORDS) return DUMPSTER_INVALID;
    if (!this.BM.bups[bupId].VALID) return DUMPSTER_INVALID;

    return bupId;
  }

  //=======================================================================
  mousePressed() {
    this.pixelClickedBreakupId = DUMPSTER_INVALID;
    if (this.mousePixelIndex === DUMPSTER_INVALID) return;

    const curBupId = this.PIN.PixelIndexToBupIndex[this.mousePixelIndex];
    if (curBupId !== DUMPSTER_INVALID && curBupId < N_BREAKUP_DATABASE_RECORDS_20K) {
      if (this.BM.bups[curBupId].VALID) {
        this.KOS.currentSelectedBreakupId = curBupId;
        this.pixelClickedBreakupId = curBupId;

        const xi = (this.mousePixelIndex % PIXELVIEW_W) * PIXELVIEW_SCALE;
        const yi = Math.floor(this.mousePixelIndex / PIXELVIEW_W) * PIXELVIEW_SCALE;
        this.hiliteXf   = xi; this.hiliteYf   = yi;
        this.hiliteMoXf = xi; this.hiliteMoYf = yi;

        this._updateSelectionInfo();
      }
    }
    this.keyOffsetX = 0;
    this.keyOffsetY = 0;
  }

  //=======================================================================
  _updateSelectionInfo() {
    if (this.KOS.currentSelectedBreakupId === this.currentSelectedBreakupId) return;
    if (this.KOS.currentSelectedBreakupId < 0) return;
    if (this.KOS.currentSelectedBreakupId >= this.nPixels) return;
    if (this.KOS.currentSelectedBreakupId === DUMPSTER_INVALID) return;

    this.currentSelectedBreakupId = this.KOS.currentSelectedBreakupId;
    this.pixelIndexOfSelectedBupId = this.PIN.BupIndexToPixelIndex[this.currentSelectedBreakupId];

    if (this.hiliteXf === DUMPSTER_INVALID) {
      this.hiliteXf = this.pixelIndexOfSelectedBupId % PIXELVIEW_W;
      this.hiliteYf = Math.floor(this.pixelIndexOfSelectedBupId / PIXELVIEW_W);
      this.keyOffsetX = 0;
      this.keyOffsetY = 0;
    }
  }

  //=======================================================================
  _updateMouseoverInfo() {
    if (this.KOS.currentMouseoverBreakupId === this.currentMouseoverBreakupId) return;
    if (this.KOS.currentMouseoverBreakupId < 0) return;
    if (this.KOS.currentMouseoverBreakupId >= this.nPixels) return;
    if (this.KOS.currentMouseoverBreakupId === DUMPSTER_INVALID) return;

    this.currentMouseoverBreakupId = this.KOS.currentMouseoverBreakupId;
    this.pixelIndexOfMouseoverBupId = this.PIN.BupIndexToPixelIndex[this.currentMouseoverBreakupId];

    if (this.hiliteMoXf === DUMPSTER_INVALID) {
      this.hiliteMoXf = this.pixelIndexOfMouseoverBupId % PIXELVIEW_W;
      this.hiliteMoYf = Math.floor(this.pixelIndexOfMouseoverBupId / PIXELVIEW_W);
    }
  }
}
