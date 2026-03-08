// Ported from HeartManager.pde
// References global PBM (ParagraphBalloonManager).

class HeartManager {

  constructor(KOS, BM) {
    this.KOS = KOS;
    this.BM  = BM;

    this.myMouseX   = 0;
    this.myMouseY   = 0;
    this.bMousePressed = false;

    this.mouseOverHeartID     = DUMPSTER_INVALID;
    this.mouseClickedHeartID  = DUMPSTER_INVALID;
    this.mouseSelectedHeartID = DUMPSTER_INVALID;
    this.bCurrentlyDraggingSelectedHeart = false;

    // handyPoint: reusable {px, py} object for getHeartLoc
    this._handyPoint = { px: DUMPSTER_INVALID, py: DUMPSTER_INVALID };

    this.hearts = new Array(MAX_N_HEARTS);
    for (let i = 0; i < MAX_N_HEARTS; i++) {
      this.hearts[i] = new Heart(i, BM);
    }

    // Compact list of non-GONE heart indices for render and other O(N) passes.
    this.activeHeartIds = [];
    for (let i = 0; i < MAX_N_HEARTS; i++) this.activeHeartIds.push(i);
  }

  //====================================================================
  decimateCurrentHeartPopulation() {
    const nExtantBalloons = PBM.nExtantBalloons;
    const nToKill = 10;
    for (let i = 0; i < nToKill; i++) {
      const randId = Math.floor(Math.random() * MAX_N_HEARTS);
      const h = this.hearts[randId];
      if (h.mouseState === STATE_MOUSE_IGNORE && h.existState === STATE_HEART_EXISTS) {
        let bRandIdOk = true;
        for (let b = 0; b < nExtantBalloons; b++) {
          if (randId === PBM.balloons[b].heartId) { bRandIdOk = false; break; }
        }
        if (bRandIdOk) h.initiateDisappearance();
      }
    }
  }

  //====================================================================
  addSelectedBreakupFromOutsideAndGetNewHeartId(newBreakupIndex) {
    let newHeartId = DUMPSTER_INVALID;
    let bBreakupAlreadyPresent = false;
    let indexOfHeartAlreadyContaining = DUMPSTER_INVALID;

    for (let i = 0; i < MAX_N_HEARTS; i++) {
      const Hi = this.hearts[i];
      if (Hi.existState === STATE_HEART_EXISTS && newBreakupIndex === Hi.breakupId) {
        bBreakupAlreadyPresent = true;
        indexOfHeartAlreadyContaining = i;
      }
    }

    if (bBreakupAlreadyPresent) {
      if (indexOfHeartAlreadyContaining !== this.mouseSelectedHeartID) {
        this.causeHeartToBecomeTheMainSelection(indexOfHeartAlreadyContaining);
        newHeartId = indexOfHeartAlreadyContaining;
      }
    } else {
      const nExtantBalloons = PBM.nExtantBalloons;

      // Find an available (GONE) heart slot
      let indexOfAvailableHeart = DUMPSTER_INVALID;
      for (let j = 0; j < MAX_N_HEARTS; j++) {
        if (this.hearts[j].existState === STATE_HEART_GONE) {
          indexOfAvailableHeart = j;
          break;
        }
      }

      // If no GONE slot, kill the least-similar heart not attached to a balloon
      if (indexOfAvailableHeart === DUMPSTER_INVALID) {
        let leastSim = 1.0;
        let heartIdWithLeastSim = DUMPSTER_INVALID;
        for (let i = 0; i < MAX_N_HEARTS; i++) {
          const hSim = this.BM.SIMILARITIES[this.hearts[i].breakupId];
          if (hSim < leastSim) {
            let notAttached = true;
            for (let b = 0; b < nExtantBalloons; b++) {
              if (i === PBM.balloons[b].heartId) { notAttached = false; break; }
            }
            if (notAttached) { leastSim = hSim; heartIdWithLeastSim = i; }
          }
        }
        if (heartIdWithLeastSim !== DUMPSTER_INVALID) {
          indexOfAvailableHeart = heartIdWithLeastSim;
        } else {
          // Emergency fallback: first heart not attached to a balloon
          for (let i = 0; i < MAX_N_HEARTS; i++) {
            let notAttached = true;
            for (let b = 0; b < nExtantBalloons; b++) {
              if (i === PBM.balloons[b].heartId) { notAttached = false; break; }
            }
            if (notAttached) { indexOfAvailableHeart = i; break; }
          }
        }
      }

      if (indexOfAvailableHeart !== DUMPSTER_INVALID) {
        const wasGone = this.hearts[indexOfAvailableHeart].existState === STATE_HEART_GONE;
        this.hearts[indexOfAvailableHeart].initiate(newBreakupIndex, 1.0);
        if (wasGone) this.activeHeartIds.push(indexOfAvailableHeart);
        if (indexOfAvailableHeart !== this.mouseSelectedHeartID) {
          this.causeHeartToBecomeTheMainSelection(indexOfAvailableHeart);
          newHeartId = indexOfAvailableHeart;
        }
      }
    }
    return newHeartId;
  }

  //====================================================================
  causeHeartToBecomeTheMainSelection(heartId) {
    if (heartId <= DUMPSTER_INVALID || heartId >= MAX_N_HEARTS) return;
    if (this.hearts[heartId].existState === STATE_HEART_GONE) return;

    if (heartId !== this.mouseSelectedHeartID && this.mouseSelectedHeartID !== DUMPSTER_INVALID) {
      this.hearts[this.mouseSelectedHeartID].setMouseState(STATE_MOUSE_IGNORE);
    }

    this.mouseSelectedHeartID = heartId;
    this.mouseClickedHeartID  = heartId;
    this.hearts[heartId].setMouseState(STATE_MOUSE_SELECT);
    this.bCurrentlyDraggingSelectedHeart = false;

    this.KOS.currentSelectedBreakupId = this.hearts[heartId].breakupId;
  }

  //====================================================================
  computeMeanSimilarity() {
    let nExtant = 0;
    let meanSim = 0;
    for (let i = 0; i < MAX_N_HEARTS; i++) {
      if (this.hearts[i].existState === STATE_HEART_EXISTS) {
        meanSim += this.hearts[i].similarityToSelected;
        nExtant++;
      }
    }
    return nExtant > 0 ? meanSim / nExtant : 0;
  }

  //====================================================================
  removeBadMatchingHeartRandomly(meanSimilarity) {
    if (Math.random() >= HM_SHUFFLE_PROBABILITY) return;
    const nExtantBalloons = PBM.nExtantBalloons;
    const threshold = (1.0 - HM_SHUFFLE_SLOP) * meanSimilarity + HM_SHUFFLE_SLOP * 1.0;

    let found = false;
    let randHeartId = 0;
    let nTries = 0;
    do {
      randHeartId = Math.floor(Math.random() * MAX_N_HEARTS);
      const h = this.hearts[randHeartId];
      if (h.mouseState === STATE_MOUSE_IGNORE && h.existState === STATE_HEART_EXISTS) {
        const sim = h.similarityToSelected;
        if (sim <= threshold || meanSimilarity < 0.01) {
          let notAttached = true;
          for (let b = 0; b < nExtantBalloons; b++) {
            if (randHeartId === PBM.balloons[b].heartId) { notAttached = false; break; }
          }
          if (notAttached) found = true;
        }
      }
      nTries++;
    } while (!found && nTries < 20);

    if (found) this.hearts[randHeartId].initiateDisappearance();
  }

  //====================================================================
  addWellMatchingHeartRandomly(meanSimilarity) {
    if (Math.random() >= 0.975) return;

    let indexOfAvailableHeart = DUMPSTER_INVALID;
    for (let j = 0; j < MAX_N_HEARTS; j++) {
      if (this.hearts[j].existState === STATE_HEART_GONE) {
        indexOfAvailableHeart = j;
        break;
      }
    }
    if (indexOfAvailableHeart === DUMPSTER_INVALID) return;

    const threshold = (1.0 - HM_SHUFFLE_SLOP) * meanSimilarity;
    let newBreakupIndex = Math.floor(Math.random() * N_BREAKUP_DATABASE_RECORDS_20K);
    let sim = 0;
    let nTries = 0;

    if (meanSimilarity >= 0.10) {
      do {
        let alreadyRepresented = false;
        let badData = false;
        do {
          newBreakupIndex = Math.floor(Math.random() * N_BREAKUP_DATABASE_RECORDS_20K);
          alreadyRepresented = false;
          badData = false;
          for (let i = 0; i < MAX_N_HEARTS; i++) {
            if (newBreakupIndex === this.hearts[i].breakupId) { alreadyRepresented = true; break; }
          }
          if (!this.BM.bups[newBreakupIndex].VALID) badData = true;
        } while (alreadyRepresented || badData);

        sim = this.BM.SIMILARITIES[newBreakupIndex];
        nTries++;
      } while (sim < threshold && nTries < 80);
    } else {
      sim = this.BM.SIMILARITIES[newBreakupIndex];
    }

    this.hearts[indexOfAvailableHeart].initiate(newBreakupIndex, sim);
    this.activeHeartIds.push(indexOfAvailableHeart);
  }

  //====================================================================
  // Initiate up to `count` hearts from the provided breakup-ID array,
  // skipping IDs already present in the simulation.
  initiateHeartsFromList(bupIds, count) {
    // Shuffle a copy so we pick randomly
    const shuffled = bupIds.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }

    let added = 0;
    for (let k = 0; k < shuffled.length && added < count; k++) {
      const bupId = shuffled[k];

      // Skip if already present
      let alreadyPresent = false;
      for (let i = 0; i < MAX_N_HEARTS; i++) {
        if (this.hearts[i].existState !== STATE_HEART_GONE && this.hearts[i].breakupId === bupId) {
          alreadyPresent = true; break;
        }
      }
      if (alreadyPresent) continue;

      // Find an available (GONE) slot; if none, evict the least-similar non-selected,
      // non-balloon existing heart (same strategy as addSelectedBreakupFromOutside).
      let slot = DUMPSTER_INVALID;
      for (let j = 0; j < MAX_N_HEARTS; j++) {
        if (this.hearts[j].existState === STATE_HEART_GONE) { slot = j; break; }
      }
      if (slot === DUMPSTER_INVALID) {
        const nExtantBalloons = PBM.nExtantBalloons;
        let leastSim = 1.0;
        for (let j = 0; j < MAX_N_HEARTS; j++) {
          if (j === this.mouseSelectedHeartID) continue;
          if (this.hearts[j].existState !== STATE_HEART_EXISTS) continue;
          let attached = false;
          for (let b = 0; b < nExtantBalloons; b++) {
            if (j === PBM.balloons[b].heartId) { attached = true; break; }
          }
          if (!attached && this.BM.SIMILARITIES[this.hearts[j].breakupId] < leastSim) {
            leastSim = this.BM.SIMILARITIES[this.hearts[j].breakupId];
            slot = j;
          }
        }
      }
      if (slot === DUMPSTER_INVALID) break;

      const wasGone = this.hearts[slot].existState === STATE_HEART_GONE;
      const sim = this.BM.SIMILARITIES[bupId];
      this.hearts[slot].initiate(bupId, sim);
      if (wasGone) this.activeHeartIds.push(slot);
      added++;
    }
  }

  //====================================================================
  performScheduledShuffling() {
    const meanSim = this.computeMeanSimilarity();
    this.removeBadMatchingHeartRandomly(meanSim);
    this.addWellMatchingHeartRandomly(meanSim);
  }

  //====================================================================
  getHeartIdWithBreakupId(whichBreakup) {
    if (whichBreakup < 0 || whichBreakup >= N_BREAKUP_DATABASE_RECORDS) return DUMPSTER_INVALID;
    for (let i = 0; i < MAX_N_HEARTS; i++) {
      const hi = this.hearts[i];
      if (hi.breakupId === whichBreakup && hi.existState !== STATE_HEART_GONE) {
        return hi.heartId;
      }
    }
    return DUMPSTER_INVALID;
  }

  getHeartLoc(whichHeartId) {
    this._handyPoint.px = DUMPSTER_INVALID;
    this._handyPoint.py = DUMPSTER_INVALID;
    if (whichHeartId >= 0 && whichHeartId < MAX_N_HEARTS) {
      const hi = this.hearts[whichHeartId];
      if (hi.existState !== STATE_HEART_GONE) {
        this._handyPoint.px = hi.px;
        this._handyPoint.py = hi.py;
      }
    }
    return this._handyPoint;
  }

  //====================================================================
  informOfMouse(mx, my, bm) {
    this.bMousePressed = bm;
    this.myMouseX = mx;
    this.myMouseY = my;
  }

  mousePressed() {
    this.mouseClickedHeartID = DUMPSTER_INVALID;
    this.bCurrentlyDraggingSelectedHeart = false;
    const whichClicked = this._whichHeartIsMouseInside();

    if (whichClicked !== DUMPSTER_INVALID) {
      if (whichClicked !== this.mouseSelectedHeartID && this.mouseSelectedHeartID !== DUMPSTER_INVALID) {
        this.hearts[this.mouseSelectedHeartID].setMouseState(STATE_MOUSE_IGNORE);
      }
      this.mouseSelectedHeartID = whichClicked;
      this.mouseClickedHeartID  = whichClicked;
      this.hearts[whichClicked].setMouseState(STATE_MOUSE_DRAG);
      this.bCurrentlyDraggingSelectedHeart = true;
      this.KOS.currentSelectedBreakupId = this.hearts[whichClicked].breakupId;
    }
  }

  // Update the selected heart's breakupId in-place without changing its visual state.
  updateSelectedHeartBreakupId(newBupId) {
    if (this.mouseSelectedHeartID === DUMPSTER_INVALID) return;
    this.hearts[this.mouseSelectedHeartID].breakupId = newBupId;
    this.KOS.currentSelectedBreakupId = newBupId;
  }

  refreshHeartColors(BM, clickedHeartBreakupID) {
    if (clickedHeartBreakupID <= DUMPSTER_INVALID || clickedHeartBreakupID >= N_BREAKUP_DATABASE_RECORDS) return;
    for (let i = 0; i < MAX_N_HEARTS; i++) {
      const heartBupId = this.hearts[i].breakupId;
      if (heartBupId !== DUMPSTER_INVALID) {
        this.hearts[i].setSimilarityToSelected(BM.SIMILARITIES[heartBupId]);
      }
    }
  }

  mouseReleased() {
    this.bCurrentlyDraggingSelectedHeart = false;
  }

  //====================================================================
  renderHeartObjects() {
    const dc = drawingContext;
    const TWO_PI = Math.PI * 2;

    dc.save();
    for (let k = 0; k < this.activeHeartIds.length; k++) {
      const h = this.hearts[this.activeHeartIds[k]];
      if (h.existState === STATE_HEART_GONE) continue;
      dc.fillStyle = `rgb(${h.colr|0},${h.colg|0},${h.colb|0})`;
      dc.beginPath();
      dc.arc(h.px, h.py, h.diam * 0.5, 0, TWO_PI);
      dc.fill();
    }
    dc.restore();

    // Special rendering for mouseover and selected — only ever 1-2 hearts, p5.js is fine
    ellipseMode(CENTER);
    if (this.mouseOverHeartID !== DUMPSTER_INVALID && this.mouseOverHeartID !== this.mouseSelectedHeartID) {
      this.hearts[this.mouseOverHeartID].renderMouseOver();
    }
    if (this.mouseSelectedHeartID !== DUMPSTER_INVALID) {
      this.hearts[this.mouseSelectedHeartID].renderMouseSelected();
    }
  }

  //====================================================================
  renderHeartObjectsOld() {
    ellipseMode(CENTER);
    noStroke();
    for (let k = 0; k < this.activeHeartIds.length; k++) {
      this.hearts[this.activeHeartIds[k]].render();
    }
    if (this.mouseOverHeartID !== DUMPSTER_INVALID && this.mouseOverHeartID !== this.mouseSelectedHeartID) {
      this.hearts[this.mouseOverHeartID].renderMouseOver();
    }
    if (this.mouseSelectedHeartID !== DUMPSTER_INVALID) {
      this.hearts[this.mouseSelectedHeartID].renderMouseSelected();
    }
  }

  //====================================================================
  _whichHeartIsMouseInside() {
    if (this.myMouseX <= HEART_WALL_L || this.myMouseX >= HEART_WALL_R ||
        this.myMouseY <= HEART_WALL_T || this.myMouseY >= HEART_WALL_B) return DUMPSTER_INVALID;

    const mxbin = Math.floor(7.99999 * (this.myMouseX - HEART_WALL_L) / HEART_AREA_W);
    const mybin = Math.floor(7.99999 * (this.myMouseY - HEART_WALL_T) / HEART_AREA_H);
    const myMouseXbins = bindices[mxbin];
    const myMouseYbins = bindices[mybin];

    for (let i = 0; i < MAX_N_HEARTS; i++) {
      const Hi = this.hearts[i];
      if (Hi.existState !== STATE_HEART_GONE) {
        if ((myMouseXbins & Hi.xbins) > 0 && (myMouseYbins & Hi.ybins) > 0) {
          if (this.myMouseX >= Hi.xMin && this.myMouseX <= Hi.xMax &&
              this.myMouseY >= Hi.yMin && this.myMouseY <= Hi.yMax) {
            const dx = Hi.px - this.myMouseX;
            const dy = Hi.py - this.myMouseY;
            if ((dx * dx + dy * dy) < Hi.rad_sq) return i;
          }
        }
      }
    }
    return DUMPSTER_INVALID;
  }

  //====================================================================
  mouseTestHearts() {
    this.mouseOverHeartID = this._whichHeartIsMouseInside();

    for (let i = 0; i < MAX_N_HEARTS; i++) {
      this.hearts[i].setMouseState(STATE_MOUSE_IGNORE);
    }

    if (this.mouseOverHeartID !== DUMPSTER_INVALID) {
      if (this.bMousePressed) {
        if (!this.bCurrentlyDraggingSelectedHeart && this.mouseOverHeartID !== this.mouseSelectedHeartID) {
          this.hearts[this.mouseOverHeartID].setMouseState(STATE_MOUSE_OVER);
        }
      } else {
        if (this.mouseOverHeartID !== this.mouseSelectedHeartID) {
          this.hearts[this.mouseOverHeartID].setMouseState(STATE_MOUSE_OVER);
        } else {
          this.hearts[this.mouseSelectedHeartID].setMouseState(STATE_MOUSE_SELECT);
        }
      }
    }

    if (this.mouseSelectedHeartID !== DUMPSTER_INVALID) {
      this.hearts[this.mouseSelectedHeartID].setMouseState(STATE_MOUSE_SELECT);
      if (this.mouseOverHeartID === this.mouseSelectedHeartID && this.bMousePressed) {
        if (this.bCurrentlyDraggingSelectedHeart) {
          this.hearts[this.mouseSelectedHeartID].setMouseState(STATE_MOUSE_DRAG);
        }
      }
    }

    if (this.mouseOverHeartID !== DUMPSTER_INVALID) {
      const Hi = this.hearts[this.mouseOverHeartID];
      const dx = Hi.px - this.myMouseX;
      const dy = Hi.py - this.myMouseY;
      if ((dx * dx + dy * dy) < Hi.rad_sq) {
        Hi.accumulateForce(HEART_MOUSE_K * dx, HEART_MOUSE_K * dy);
      }
    }

    if (this.mouseOverHeartID !== DUMPSTER_INVALID) {
      this.KOS.currentMouseoverBreakupId = this.hearts[this.mouseOverHeartID].breakupId;
    } else {
      this.KOS.currentMouseoverBreakupId = DUMPSTER_INVALID;
    }
  }

  //====================================================================
  updateHearts() {
    this.hearts[0].setMouseInformation(this.bCurrentlyDraggingSelectedHeart, this.myMouseX, this.myMouseY);

    // Pass A: all force accumulation in one traversal.
    const hasSelected = this.mouseSelectedHeartID !== DUMPSTER_INVALID;
    let spx, spy, spr;
    if (hasSelected) {
      const selH = this.hearts[this.mouseSelectedHeartID];
      spx = selH.px; spy = selH.py; spr = selH.rad;
    }
    for (let i = 0; i < MAX_N_HEARTS; i++) {
      this.hearts[i].accumulateGravityForce();
      this.hearts[i].accumulateCentralizingForce();
      if (hasSelected) {
        if (i !== this.mouseSelectedHeartID) {
          this.hearts[i].accumulateAttractionForceToSelected(spx, spy, spr);
        } else if (this.bMousePressed) {
          this.hearts[this.mouseSelectedHeartID].px = this.myMouseX;
          this.hearts[this.mouseSelectedHeartID].py = this.myMouseY;
          this.hearts[this.mouseSelectedHeartID].setMouseState(STATE_MOUSE_DRAG);
        }
      }
    }

    for (let i = 0; i < MAX_N_HEARTS; i++) {
      const Hi = this.hearts[i];
      if (Hi.existState === STATE_HEART_GONE) continue;

      const xi = Hi.px, yi = Hi.py;
      const ixMin = Hi.xMin, ixMax = Hi.xMax;
      const iyMin = Hi.yMin, iyMax = Hi.yMax;
      const irad  = Hi.rad;
      const ixbins = Hi.xbins, iybins = Hi.ybins;

      for (let j = 0; j < i; j++) {
        const Hj = this.hearts[j];
        if (Hj.existState !== STATE_HEART_GONE) {
          if ((ixbins & Hj.xbins) > 0 && (iybins & Hj.ybins) > 0) {
            if (!(ixMin > Hj.xMax || Hj.xMin > ixMax || iyMin > Hj.yMax || Hj.yMin > iyMax)) {
              const dx = xi - Hj.px;
              const dy = yi - Hj.py;
              const dh = Math.sqrt(dx * dx + dy * dy);
              const overlap = dh - (irad + Hj.rad);
              if (overlap < HEART_MIN_OVERLAP_DIST) {
                const lapforce = HEART_COLLISION_K * overlap;
                const fx = dx * lapforce;
                const fy = dy * lapforce;
                const imassInv = 1.0 / Hi.mass;
                const jmassInv = 1.0 / Hj.mass;
                Hi.vx = HEART_COLLISION_DAMPING * (Hi.vx + fx * imassInv);
                Hi.vy = HEART_COLLISION_DAMPING * (Hi.vx + fy * imassInv); // faithful to original (vx typo)
                Hj.vx = HEART_COLLISION_DAMPING * (Hj.vx - fx * jmassInv);
                Hj.vy = HEART_COLLISION_DAMPING * (Hj.vy - fy * jmassInv);
              }
            }
          }
        }
      }
    }

    for (let i = 0; i < MAX_N_HEARTS; i++) {
      const wasGone = this.hearts[i].existState === STATE_HEART_GONE;
      this.hearts[i].update();
      if (!wasGone && this.hearts[i].existState === STATE_HEART_GONE) {
        const idx = this.activeHeartIds.indexOf(i);
        if (idx !== -1) this.activeHeartIds.splice(idx, 1);
      }
    }
  }
}
