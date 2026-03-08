// Ported from HeartBalloonConnector.pde

class HeartBalloonConnector {

  constructor(PBM, HM) {
    this.PBM = PBM;
    this.HM  = HM;
    this._precomputeBezierArrays();
    this._precomputeCircleArrays();
  }

  //=========================================================================
  renderConnections() {
    const dc = drawingContext;
    const mouseSelectedHeartID = this.HM.mouseSelectedHeartID;
    const mouseoverBalloonId   = this.PBM.getMouseContainingBalloon();
    const mouseOverHeartID     = this.HM.mouseOverHeartID;
    const nBalloons = this.PBM.nExtantBalloons;

    dc.save();
    dc.lineCap = 'round';
    dc.lineWidth = 1;

    for (let b = 0; b < nBalloons; b++) {
      const breakupId = this.PBM.balloons[b].breakupId;
      const heartId   = this.PBM.balloons[b].heartId;
      if (breakupId === DUMPSTER_INVALID || heartId === DUMPSTER_INVALID) continue;

      const hpt = this.HM.getHeartLoc(heartId);
      const hx = hpt.px, hy = hpt.py;
      if (hx === DUMPSTER_INVALID || hy === DUMPSTER_INVALID) continue;

      const Hi = this.HM.hearts[heartId];
      const Hd = Hi.diam * 0.5 + 6;

      const balloonPy = this.PBM.balloons[b].py;
      const balloonPh = this.PBM.balloons[b].ph;
      const bx = BALLOON_X;
      const by = balloonPy + balloonPh / 2.0;

      const ax = bx - CONNECTOR_BEZ_DIF;
      const ay = by;
      const jx = (hx + (bx - CONNECTOR_BEZ_DIF)) / 2.0;
      const jy = (hy + by) / 2.0;

      const dx = jx - hx, dy = jy - hy;
      const dh = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const ix = hx + Hd * dx / dh;
      const iy = hy + Hd * dy / dh;

      let Hr = (Hi.colr + BALLOON_BODY_R) / 2.0;
      let Hg = (Hi.colg + BALLOON_BODY_G) / 2.0;
      let Hb = (Hi.colb + BALLOON_BODY_B) / 2.0;

      let bover = false;
      if (b === mouseoverBalloonId) {
        Hr = Hi.colr; Hg = Hi.colg; Hb = 255;
        Hi.colr = Hi.colrt = 0;
        Hi.colg = Hi.colgt = 0;
        Hi.colb = Hi.colbt = 255;
        bover = true;
      }
      if (heartId === mouseOverHeartID || Hi.mouseState === STATE_MOUSE_OVER ||
          (this.HM.bCurrentlyDraggingSelectedHeart && heartId === mouseSelectedHeartID)) {
        this.PBM.balloons[b].b_correspondingHeartIsMousedOver = true;
        bover = true;
      } else {
        this.PBM.balloons[b].b_correspondingHeartIsMousedOver = false;
      }
      if (heartId === mouseSelectedHeartID) { Hr = 255; Hg = 255; Hb = 0; }

      const grad = dc.createLinearGradient(ix, iy, bx, by);
      grad.addColorStop(0, `rgb(${Math.round(Hr)},${Math.round(Hg)},${Math.round(Hb)})`);
      grad.addColorStop(1, `rgb(${BALLOON_BODY_R},${BALLOON_BODY_G},${BALLOON_BODY_B})`);
      dc.strokeStyle = grad;
      dc.setLineDash(bover ? [1, 2.5] : [1, 5.0]);

      // Bezier: heart-circumference point → midpoint CP → balloon-left CP → balloon edge
      dc.beginPath();
      dc.moveTo(ix, iy);
      dc.bezierCurveTo(jx, jy, ax, ay, bx, by);
      dc.stroke();

      // Circle ring at the heart
      dc.setLineDash([]);
      dc.beginPath();
      dc.arc(hx, hy, Hd, 0, Math.PI * 2);
      dc.stroke();
    }

    dc.restore();
    strokeWeight(1); // re-sync p5.js internal state
  }

  //=========================================================================
  renderConnectionsOld() {
    strokeWeight(1.0);

    const mouseSelectedHeartID = this.HM.mouseSelectedHeartID;
    const mouseoverBalloonId   = this.PBM.getMouseContainingBalloon();
    const mouseOverHeartID     = this.HM.mouseOverHeartID;
    const nBalloons = this.PBM.nExtantBalloons;

    for (let b = 0; b < nBalloons; b++) {
      const breakupId = this.PBM.balloons[b].breakupId;
      const heartId   = this.PBM.balloons[b].heartId;
      if (breakupId === DUMPSTER_INVALID || heartId === DUMPSTER_INVALID) continue;

      const hpt = this.HM.getHeartLoc(heartId);
      const hx = hpt.px, hy = hpt.py;
      if (hx === DUMPSTER_INVALID || hy === DUMPSTER_INVALID) continue;

      const Hi = this.HM.hearts[heartId];
      const Hd = Hi.diam * 0.5 + 6;

      const balloonPy = this.PBM.balloons[b].py;
      const balloonPh = this.PBM.balloons[b].ph;
      const bx = Math.floor(BALLOON_X - 3);
      const by = balloonPy + balloonPh / 2.0;

      const ax = bx - CONNECTOR_BEZ_DIF;
      const ay = by;
      const jx = (hx + (bx - CONNECTOR_BEZ_DIF)) / 2.0;
      const jy = (hy + by) / 2.0;

      const dx = jx - hx, dy = jy - hy;
      const dh = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const ix = hx + Hd * dx / dh;
      const iy = hy + Hd * dy / dh;

      let Hr = (Hi.colr + BALLOON_BODY_R) / 2.0;
      let Hg = (Hi.colg + BALLOON_BODY_G) / 2.0;
      let Hb = (Hi.colb + BALLOON_BODY_B) / 2.0;
      const endr = BALLOON_BODY_R, endg = BALLOON_BODY_G, endb = BALLOON_BODY_B;

      let bover = false;
      if (b === mouseoverBalloonId) {
        Hr = Hi.colr; Hg = Hi.colg; Hb = 255;
        Hi.colr = Hi.colrt = 0;
        Hi.colg = Hi.colgt = 0;
        Hi.colb = Hi.colbt = 255;
        bover = true;
      }
      if (heartId === mouseOverHeartID || Hi.mouseState === STATE_MOUSE_OVER ||
          (this.HM.bCurrentlyDraggingSelectedHeart && heartId === mouseSelectedHeartID)) {
        this.PBM.balloons[b].b_correspondingHeartIsMousedOver = true;
        bover = true;
      } else {
        this.PBM.balloons[b].b_correspondingHeartIsMousedOver = false;
      }
      if (heartId === mouseSelectedHeartID) { Hr = 255; Hg = 255; Hb = 0; }

      this._drawBezier(ix, iy, jx, jy, ax, ay, bx, by, Hr, Hg, Hb, endr, endg, endb, bover);
      this._drawCircleNoBoundaryCheck(hx, hy, Hd, Hr, Hg, Hb, bover);
    }

    strokeWeight(1.0);
  }

  //=========================================================================
  _drawBezier(x0, y0, x1, y1, x2, y2, x3, y3, r0, g0, b0, r3, g3, b3, bover) {
    const skip = bover ? 1 : 2;
    const bp = this._bezPoints;

    // Optimization: if bezier endpoint is below the wall, clip points above wall
    const clipY = y3 > HEART_WALL_B;

    beginShape(POINTS);
    for (let i = 0; i < this.nBezPoints; i += skip) {
      const f0 = bp.onemt3[i], f1 = bp.bto2[i], f2 = bp.bt2o[i], f3 = bp.bt3[i];
      const by_ = f0 * y0 + f1 * y1 + f2 * y2 + f3 * y3;
      if (clipY && by_ >= HEART_WALL_B) continue;
      const bx_ = f0 * x0 + f1 * x1 + f2 * x2 + f3 * x3;
      stroke(
        bp.bt[i] * r3 + bp.onemt[i] * r0,
        bp.bt[i] * g3 + bp.onemt[i] * g0,
        bp.bt[i] * b3 + bp.onemt[i] * b0
      );
      vertex(bx_, by_);
    }
    endShape();
  }

  //=========================================================================
  _drawCircleNoBoundaryCheck(x, y, r, cr, cg, cb, bover) {
    stroke(cr, cg, cb);
    const skip = bover ? 1 : 2;
    beginShape(POINTS);
    for (let i = 0; i < this.nCircPoints; i += skip) {
      vertex(x + r * this._cx[i], y + r * this._cy[i]);
    }
    endShape();
  }

  //=========================================================================
  _precomputeCircleArrays() {
    this.nCircPoints = 96;
    this._cx = new Float32Array(this.nCircPoints);
    this._cy = new Float32Array(this.nCircPoints);
    for (let i = 0; i < this.nCircPoints; i++) {
      const t = Math.PI * 2.0 * i / (this.nCircPoints - 1);
      this._cx[i] = Math.cos(t);
      this._cy[i] = Math.sin(t);
    }
  }

  //=========================================================================
  _precomputeBezierArrays() {
    const nSeg = 127;
    this.nBezPoints = nSeg + 1;
    const bp = this._bezPoints = {
      bt:    new Float32Array(this.nBezPoints),
      bt2:   new Float32Array(this.nBezPoints),
      bt3:   new Float32Array(this.nBezPoints),
      onemt: new Float32Array(this.nBezPoints),
      onemt2:new Float32Array(this.nBezPoints),
      onemt3:new Float32Array(this.nBezPoints),
      bto2:  new Float32Array(this.nBezPoints),
      bt2o:  new Float32Array(this.nBezPoints),
    };
    for (let p = 0; p < this.nBezPoints; p++) {
      const t = Math.pow(p / nSeg, 1.5);
      bp.bt[p]    = t;
      bp.bt2[p]   = t * t;
      bp.bt3[p]   = t * t * t;
      bp.onemt[p] = 1.0 - t;
      bp.onemt2[p]= (1.0 - t) * (1.0 - t);
      bp.onemt3[p]= (1.0 - t) * (1.0 - t) * (1.0 - t);
      bp.bto2[p]  = 3.0 * t * bp.onemt2[p];
      bp.bt2o[p]  = 3.0 * t * t * bp.onemt[p];
    }
  }
}
