// Ported from Heart.pde

class Heart {

  constructor(h_id, BM) {
    this.BM = BM;
    this.heartId  = h_id;
    this.breakupId = Math.floor(random(N_BREAKUP_DATABASE_RECORDS_20K));

    this.xbins = 0;
    this.ybins = 0;

    this.innerColorOver     = color(255, 100, 180);
    this.innerColorSelected = color(255, 245,   0);
    this.innerColorHeart    = color(255, 180,  90);

    this.rad       = BM.bups[this.breakupId].heartRadius;
    this.rad_sq    = this.rad * this.rad;
    this.mass      = (1 + this.rad_sq) * HEART_MASS_CONSTANT;
    this.diamShave = (this.rad > HEART_MIN_RADp1) ? HEART_DIAM_SHAVE : 0;
    this.diam      = this.rad * 2.0 - this.diamShave;

    this.rad_backup = this.rad;
    this.rad_target = this.rad;
    this.mouseState = STATE_MOUSE_IGNORE;
    this.existState = STATE_HEART_EXISTS;

    this.my_wall_L = HEART_WALL_L + this.rad;
    this.my_wall_R = HEART_WALL_R - this.rad;
    this.my_wall_T = HEART_WALL_T + this.rad;
    this.my_wall_B = HEART_WALL_B - this.rad;

    this.px = this.my_wall_L + random(1) * (this.my_wall_R - this.my_wall_L);
    this.py = this.my_wall_T + random(1) * (this.my_wall_B - this.my_wall_T);
    this.ox = this.px;
    this.oy = this.py;
    this.qx = this.px;
    this.qy = this.py;
    this.xMin = this.px - this.rad;
    this.xMax = this.px + this.rad;
    this.yMin = this.py - this.rad;
    this.yMax = this.py + this.rad;
    this.vx = 2.0 * (random(1) - 0.5);
    this.vy = 2.0 * (random(1) - 0.5);
    this.vh = 0;

    this.similarityToSelected = random(1);
    const simCol = Math.pow(this.similarityToSelected, 0.9);

    this.colr  = this.colrb = this.colrt = simCol * 200.0;
    this.colg  = this.colgb = this.colgt = 32;
    this.colb  = this.colbb = this.colbt = 32;

    this.bCurrentlyDraggingSelectedHeart = false;
    this.myMouseX = 0;
    this.myMouseY = 0;
    this.bWasSpecificallyClicked = false;

    this._saturateColors();
  }

  //-----------------------------
  initiate(newBreakupIndex, sim) {
    this.breakupId = newBreakupIndex;
    this.xbins = 0;
    this.ybins = 0;

    this.rad       = this.BM.bups[this.breakupId].heartRadius;
    this.rad_sq    = this.rad * this.rad;
    this.mass      = (1 + this.rad_sq) * HEART_MASS_CONSTANT;
    this.diamShave = (this.rad > HEART_MIN_RADp1) ? HEART_DIAM_SHAVE : 0;
    this.diam      = this.rad * 2.0 - this.diamShave;

    this.rad_backup = this.rad;
    this.rad_target = this.rad;
    this.mouseState = STATE_MOUSE_IGNORE;
    this.existState = STATE_HEART_EXISTS;

    this.my_wall_L = HEART_WALL_L + this.rad;
    this.my_wall_R = HEART_WALL_R - this.rad;
    this.my_wall_T = HEART_WALL_T + this.rad;
    this.my_wall_B = HEART_WALL_B - this.rad;

    if (sim === 1.0) {
      this.px = width / 2;
      this.py = height / 2;
    } else {
      if (random(1) < 0.5) {
        const rxf = 0.50 * Math.pow(random(1), 1.50);
        this.px = this.my_wall_L + rxf * (this.my_wall_R - this.my_wall_L);
        this.py = HEART_WALL_T;
      } else {
        const ryf = random(1);
        this.px = HEART_WALL_R;
        this.py = this.my_wall_T + ryf * (this.my_wall_B - this.my_wall_T);
      }
    }

    this.xMin = this.px - this.rad;
    this.xMax = this.px + this.rad;
    this.yMin = this.py - this.rad;
    this.yMax = this.py + this.rad;
    this.vx = 0.8 * (random(1) - 0.5);
    this.vy = 2.5 + 2.0 * random(1);

    this.similarityToSelected = sim;
    const simCol = Math.pow(sim, 0.9);

    this.colr  = this.colrb = this.colrt = simCol * 200.0;
    this.colg  = this.colgb = this.colgt = 32;
    this.colb  = this.colbb = this.colbt = 32;
    this._saturateColors();
  }

  //-----------------------------
  setSimilarityToSelected(sim) {
    if (this.existState !== STATE_HEART_GONE) {
      this.similarityToSelected = sim;
      const simCol = Math.pow(sim, 0.9);
      this.colrb = simCol * 200.0;
      this.colgb = 32;
      this.colbb = 32;
      this._saturateColors();
    }
  }

  //-----------------------------
  _saturateColors() {
    const lumr = this.colrb * LUMINANCES_R;
    const lumg = this.colgb * LUMINANCES_G;
    const lumb = this.colbb * LUMINANCES_B;
    this.colrt = this.colrb = max(0, min(255, HEART_SATURATE_B * lumr + HEART_SATURATE_A * this.colrb));
    this.colgt = this.colgb = max(0, min(255, HEART_SATURATE_B * lumg + HEART_SATURATE_A * this.colgb));
    this.colbt = this.colbb = max(0, min(255, HEART_SATURATE_B * lumb + HEART_SATURATE_A * this.colbb));
  }

  //-----------------------------
  accumulateForce(fx, fy) {
    this.vx += fx / this.mass;
    this.vy += fy / this.mass;
  }

  accumulateGravityForce() {
    this.vy += HEART_GRAVITY;
  }

  accumulateAttractionForceToSelected(spx, spy, spr) {
    if (this.existState === STATE_HEART_GONE) return;
    if (this.similarityToSelected < 0.33) return;
    const dx = spx - this.px;
    const dy = spy - this.py;
    const dSq = dx * dx + dy * dy;
    if (dSq <= spr * spr) return;
    const dh = Math.sqrt(dSq) - spr;
    const f = 0.15 * (this.similarityToSelected - 0.33) / (dh + 1);
    this.vx += f * dx;
    this.vy += f * dy;
  }

  accumulateCentralizingForce() {
    if (this.existState !== STATE_HEART_GONE) {
      const dx = HEART_HEAP_CENTERX - this.px;
      const dy = HEART_HEAP_CENTERY - this.py;
      const dh = dx * dx + dy * dy;
      if (dh > HEART_NEIGHBORHOOD_SQ) {
        const dhInv = HEART_HEAPING_K / Math.sqrt(dh);
        this.vx += dx * dhInv;
        this.vy += dy * dhInv / this.mass;
      }
    }
  }

  setMouseInformation(bdrag, mx, my) {
    this.bCurrentlyDraggingSelectedHeart = bdrag;
    this.myMouseX = mx;
    this.myMouseY = my;
  }

  //-----------------------------
  update() {
    if (this.existState === STATE_HEART_GONE) return;

    // Interpolate color toward target
    const dcolr = Math.abs(this.colrt - this.colr);
    const dcolg = Math.abs(this.colgt - this.colg);
    const dcolb = Math.abs(this.colbt - this.colb);
    if ((dcolr + dcolg + dcolb) > 0.50) {
      this.colr = HEART_BLUR_CA * this.colr + HEART_BLUR_CB * this.colrt;
      this.colg = HEART_BLUR_CA * this.colg + HEART_BLUR_CB * this.colgt;
      this.colb = HEART_BLUR_CA * this.colb + HEART_BLUR_CB * this.colbt;
    }

    // Interpolate radius toward target
    if (Math.abs(this.rad - this.rad_target) > 0.25) {
      this.rad    = HEART_BLUR_RA * this.rad + HEART_BLUR_RB * this.rad_target;
      this.rad_sq = this.rad * this.rad;
      this.mass   = (1 + this.rad_sq) * HEART_MASS_CONSTANT;
      this.diamShave = (this.rad > HEART_MIN_RADp1) ? HEART_DIAM_SHAVE : 0;
      this.diam   = this.rad * 2.0 - this.diamShave;
      this.my_wall_L = HEART_WALL_L + this.rad;
      this.my_wall_T = HEART_WALL_T + this.rad;
      this.my_wall_R = HEART_WALL_R - this.rad;
      this.my_wall_B = HEART_WALL_B - this.rad;

      if (Math.abs(this.rad - this.rad_target) < 0.25) {
        this.rad = this.rad_target;
        if (this.existState === STATE_HEART_FADING && this.rad === 0) {
          this.existState = STATE_HEART_GONE;
        }
      }
    }

    this.ox = this.px;
    this.oy = this.py;
    this.vx *= HEART_DAMPING;
    this.vy *= HEART_DAMPING;

    if (this.bCurrentlyDraggingSelectedHeart &&
        (this.mouseState === STATE_MOUSE_DRAG || this.mouseState === STATE_MOUSE_SELECT)) {
      this.qx = 0.20 * this.px + 0.80 * this.myMouseX;
      this.qy = 0.20 * this.py + 0.80 * this.myMouseY;
      this.vx = this.qx - this.px;
      this.vy = this.qy - this.py;
    } else {
      this.qx = this.ox + this.vx;
      this.qy = this.oy + this.vy;

      if (this.xbins === 3) {
        if (this.ox >= this.my_wall_L && this.qx < this.my_wall_L) {
          this.qx = this.my_wall_L + (this.my_wall_L - this.qx);
          this.vx = -this.vx;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      } else if (this.xbins === 192) {
        if (this.ox < this.my_wall_R && this.qx >= this.my_wall_R) {
          this.qx = this.my_wall_R - (this.qx - this.my_wall_R);
          this.vx = -this.vx;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      }
      if (this.ybins === 192) {
        if (this.oy < this.my_wall_B && this.qy >= this.my_wall_B) {
          this.qy = this.my_wall_B - (this.qy - this.my_wall_B);
          this.vy = -this.vy;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      } else if (this.ybins === 3) {
        if (this.oy >= this.my_wall_T && this.qy < this.my_wall_T) {
          this.qy = this.my_wall_T + (this.my_wall_T - this.qy);
          this.vy = -this.vy;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      }
    }

    this.px = min(this.my_wall_R, max(this.my_wall_L, this.qx));
    this.py = min(this.my_wall_B, max(this.my_wall_T, this.qy));
    this.xMin = this.px - this.rad;
    this.xMax = this.px + this.rad;
    this.yMin = this.py - this.rad;
    this.yMax = this.py + this.rad;

    if (Math.abs(this.vx) > HEART_MAX_VELd2 || Math.abs(this.vy) > HEART_MAX_VELd2) {
      this.vh = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (this.vh > HEART_MAX_VEL) {
        const frac = HEART_MAX_VEL / this.vh;
        this.vh = HEART_MAX_VEL;
        this.vx *= frac;
        this.vy *= frac;
      }
    }

    this.xbins = bindices[Math.floor(opt_8dHA_W * (this.px - HEART_WALL_L))];
    this.ybins = bindices[Math.floor(opt_8dHA_H * (this.py - HEART_WALL_T))];
  }

  //-----------------------------
  initiateDisappearance() {
    if (this.mouseState === STATE_MOUSE_IGNORE) {
      this.existState = STATE_HEART_FADING;
      this.rad_target = 0;
    }
  }

  setMouseState(mState) {
    this.mouseState = mState;
    if (this.existState === STATE_HEART_GONE) return;
    switch (this.mouseState) {
      case STATE_MOUSE_DRAG:
        this.existState = STATE_HEART_EXISTS;
        this.rad_target = HEART_DRAG_RADIUS;
        this.colr = this.colrt = 255;
        this.colg = this.colgt = 128;
        this.colb = this.colbt = 0;
        break;
      case STATE_MOUSE_SELECT:
        this.existState = STATE_HEART_EXISTS;
        this.rad_target = HEART_SELECT_RADIUS;
        this.colr = this.colrt = 255;
        this.colg = this.colgt = 100;
        this.colb = this.colbt = 0;
        break;
      case STATE_MOUSE_OVER:
        this.existState = STATE_HEART_EXISTS;
        this.rad_target = HEART_OVER_RADIUS;
        this.colr = this.colrt = 0;
        this.colg = this.colgt = 0;
        this.colb = this.colbt = 255;
        break;
      case STATE_MOUSE_IGNORE:
        this.rad_target = (this.existState === STATE_HEART_EXISTS) ? this.rad_backup : 0;
        this.colrt = this.colrb;
        this.colgt = this.colgb;
        this.colbt = this.colbb;
        break;
    }
  }

  render() {
    if (this.existState !== STATE_HEART_GONE) {
      fill(this.colr, this.colg, this.colb);
      ellipse(this.px, this.py, this.diam, this.diam);
    }
  }

  renderMouseOver() {
    noStroke();
    fill(this.colr, this.colg, this.colb);
    ellipse(this.px, this.py, this.diam, this.diam);
    fill(this.innerColorOver);
    ellipse(this.px, this.py, this.diam - 12, this.diam - 12);
  }

  renderMouseSelected() {
    stroke(0, 0, 0);
    fill(this.colr, this.colg, this.colb);
    ellipse(this.px, this.py, this.diam, this.diam);
    noStroke();
    fill(this.innerColorSelected);
    ellipse(this.px, this.py, this.diam - 12, this.diam - 12);
  }
}
