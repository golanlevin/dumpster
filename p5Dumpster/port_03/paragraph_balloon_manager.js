// Ported from ParagraphBalloonManager.pde
// Key change from original: SadnessFetcher (async HTTP) replaced by
// synchronous getBreakupText() lookup from the pre-loaded Files dict.

class ParagraphBalloonManager {

  constructor() {
    this.currentBreakupID   = DUMPSTER_INVALID;
    this.mouseoverBalloonID = DUMPSTER_INVALID;
    this.nExtantBalloons    = 0;
    this.currentBalloonIndex = DUMPSTER_INVALID;

    this.mouseX = 0;
    this.mouseY = 0;
    this.bMousePressed  = false;
    this.bNewRequestMade = false;

    // Use Georgia Italic for the balloon paragraph text.
    // (Original used "Georgia-Italic-9.vlw"; we use a CSS string font.)
    this.paragraphFont = 'Georgia';

    this.balloons = new Array(MAX_N_BALLOONS);
    for (let i = 0; i < MAX_N_BALLOONS; i++) {
      this.balloons[i] = new ParagraphBalloon();
      this.balloons[i].setFont(this.paragraphFont);
      this.balloons[i].setStringAndComputeLayout('', '', DUMPSTER_INVALID, true);
    }
  }

  //====================================================================
  informOfMouse(mx, my, bm) {
    this.bMousePressed = bm;
    this.mouseX = mx;
    this.mouseY = my;
  }

  //====================================================================
  execute(breakupId, heartId) {
    if (breakupId < 0 || breakupId >= N_BREAKUP_DATABASE_RECORDS) return;

    const alreadyIdx = this._findIndexOfBalloonAlreadyContaining(breakupId);
    if (alreadyIdx !== DUMPSTER_INVALID) {
      if (alreadyIdx === this.currentBalloonIndex) {
        // Already on top — do nothing.
      } else if (alreadyIdx < this.currentBalloonIndex) {
        // Case I: shift down, bring to top
        const tempPy      = this.balloons[alreadyIdx].py;
        const tempBalloon = this.balloons[alreadyIdx];
        for (let i = alreadyIdx; i < this.currentBalloonIndex; i++) {
          this.balloons[i] = this.balloons[(i + 1) % MAX_N_BALLOONS];
        }
        this.balloons[this.currentBalloonIndex] = tempBalloon;
        this.balloons[this.currentBalloonIndex].setPositionY(tempPy);
        this.balloons[this.currentBalloonIndex].setTargetY(BALLOON_START_Y);
        this._retargetFrom(this.currentBalloonIndex);
      } else {
        // Case II: shift up, bring to current+1
        const tempPy      = this.balloons[alreadyIdx].py;
        const tempBalloon = this.balloons[alreadyIdx];
        for (let i = alreadyIdx - 1; i > this.currentBalloonIndex; i--) {
          this.balloons[(i + 1) % MAX_N_BALLOONS] = this.balloons[i];
        }
        this.currentBalloonIndex = (this.currentBalloonIndex + 1) % MAX_N_BALLOONS;
        this.nExtantBalloons = Math.min(this.nExtantBalloons + 1, MAX_N_BALLOONS);
        this.balloons[this.currentBalloonIndex] = tempBalloon;
        this.balloons[this.currentBalloonIndex].setPositionY(tempPy);
        this.balloons[this.currentBalloonIndex].setTargetY(BALLOON_START_Y);
        this._retargetFrom(this.currentBalloonIndex);
      }
    } else {
      // New balloon: advance ring buffer, load text synchronously.
      this.currentBalloonIndex = (this.currentBalloonIndex + 1) % MAX_N_BALLOONS;
      this.nExtantBalloons = Math.min(this.nExtantBalloons + 1, MAX_N_BALLOONS);

      const text   = getBreakupText(breakupId);
      const author = getBreakupAuthorDisplay(breakupId);
      this.balloons[this.currentBalloonIndex].setStringAndComputeLayout(text, author, breakupId, false, '');
      const nLines = this.balloons[this.currentBalloonIndex].myParagraph.nLines;
      this.balloons[this.currentBalloonIndex].dateString = this._dateStringForBupId(breakupId, nLines >= 3);
      this.balloons[this.currentBalloonIndex].setPositionY(BALLOON_START_Y);
      this.balloons[this.currentBalloonIndex].heartId = heartId;
      this.bNewRequestMade = true;
    }
  }

  //====================================================================
  _findIndexOfBalloonAlreadyContaining(breakupId) {
    for (let i = 0; i < this.nExtantBalloons; i++) {
      if (this.balloons[i].breakupId === breakupId) return i;
    }
    return DUMPSTER_INVALID;
  }

  //====================================================================
  _retargetFrom(fromIndex) {
    let starty = this.balloons[fromIndex].targety;
    for (let i = 0; i < this.nExtantBalloons; i++) {
      const bid = (fromIndex - i + MAX_N_BALLOONS) % MAX_N_BALLOONS;
      this.balloons[bid].setTargetY(starty);
      starty += this.balloons[bid].ph + BALLOON_SPACING_Y;
    }
  }

  //====================================================================
  render() {
    this._update();
    noTint();
    noStroke();
    textFont(this.paragraphFont);
    textStyle(ITALIC);
    textSize(BALLOON_TEXT_SIZE);

    for (let i = 0; i < this.nExtantBalloons; i++) {
      this.balloons[i].informOfCurrency(i === this.currentBalloonIndex);
      this.balloons[i].render(i === this.mouseoverBalloonID);
    }
    textStyle(NORMAL);
  }

  //====================================================================
  getMouseContainingBalloon() {
    let resultIndex = DUMPSTER_INVALID;
    if (this.mouseX > HEART_WALL_L && this.mouseY < HEART_WALL_B &&
        this.mouseX < HEART_WALL_R && this.mouseY > HEART_WALL_T) {
      for (let i = 0; i < this.nExtantBalloons; i++) {
        const b = this.balloons[i];
        if (this.mouseX > b.px && this.mouseX < b.px + b.pw &&
            this.mouseY > b.py && this.mouseY < b.py + b.ph) {
          resultIndex = i;
          break;
        }
      }
    }
    this.mouseoverBalloonID = resultIndex;
    return resultIndex;
  }

  //====================================================================
  getTopBalloonCenterY() {
    if (this.nExtantBalloons > 0 && this.currentBalloonIndex > DUMPSTER_INVALID) {
      const b = this.balloons[this.currentBalloonIndex];
      return b.py + b.ph / 2.0;
    }
    return DUMPSTER_INVALID;
  }

  //====================================================================
  _update() {
    this._retargetBalloons();
    for (let i = 0; i < this.nExtantBalloons; i++) {
      this.balloons[i].updatePositionY();
    }
  }

  //====================================================================
  //====================================================================
  // Update the topmost balloon's text in-place (no new stack entry).
  // Ensures a minimum height of 4 lines during pixel-view drag.
  updateTopmostBalloonInPlace(breakupId, heartId) {
    if (this.currentBalloonIndex === DUMPSTER_INVALID || this.nExtantBalloons === 0) return;
    const b = this.balloons[this.currentBalloonIndex];
    const text   = getBreakupText(breakupId);
    const author = getBreakupAuthorDisplay(breakupId);
    b.setStringAndComputeLayout(text, author, breakupId, false, '');
    const minPh = Math.ceil(5 * b.myParagraph.myLeading + b.margT + b.margB);
    b.ph = Math.max(b.ph, minPh);
    b.dateString = this._dateStringForBupId(breakupId, b.myParagraph.nLines >= 3);
    if (heartId !== undefined && heartId !== DUMPSTER_INVALID) b.heartId = heartId;
  }

  //====================================================================
  // Re-layout the topmost balloon at its natural height after a drag ends.
  restoreTopmostBalloonHeight() {
    if (this.currentBalloonIndex === DUMPSTER_INVALID || this.nExtantBalloons === 0) return;
    const b = this.balloons[this.currentBalloonIndex];
    if (b.breakupId === DUMPSTER_INVALID) return;
    const text   = getBreakupText(b.breakupId);
    const author = getBreakupAuthorDisplay(b.breakupId);
    b.setStringAndComputeLayout(text, author, b.breakupId, false, '');
    b.dateString = this._dateStringForBupId(b.breakupId, b.myParagraph.nLines >= 3);
    // bNewTextAppeared is true, so lower balloons will smoothly retarget upward.
  }

  //====================================================================
  _dateStringForBupId(bupId, bShowYear) {
    if (bupId < 0 || bupId >= N_BREAKUP_DATABASE_RECORDS) return '';
    const d = BM.bups[bupId].date;
    if (d <= 0) return '';
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let remaining = d - 1;
    for (let m = 0; m < 12; m++) {
      if (remaining < lengths[m]) {
        const str = (m + 1) + '-' + (remaining + 1);
        return bShowYear ? str + '-05' : str;
      }
      remaining -= lengths[m];
    }
    return '';
  }

  //====================================================================
  _retargetBalloons() {
    if (this.bNewRequestMade) {
      this.bNewRequestMade = false;
      let starty = this.balloons[this.currentBalloonIndex].py;
      starty += this.balloons[this.currentBalloonIndex].ph + BALLOON_SPACING_Y;

      if (this.nExtantBalloons < MAX_N_BALLOONS) {
        for (let i = this.currentBalloonIndex - 1; i >= 0; i--) {
          this.balloons[i].setTargetY(starty);
          starty += this.balloons[i].ph + BALLOON_SPACING_Y;
        }
      } else {
        for (let i = 1; i < MAX_N_BALLOONS; i++) {
          const bid = (this.currentBalloonIndex - i + MAX_N_BALLOONS) % MAX_N_BALLOONS;
          this.balloons[bid].setTargetY(starty);
          starty += this.balloons[bid].ph + BALLOON_SPACING_Y;
        }
      }
    }

    for (let b = 0; b < this.nExtantBalloons; b++) {
      if (this.balloons[b].bNewTextAppeared) {
        this.balloons[b].bNewTextAppeared = false;
        const BI = b;
        let starty = this.balloons[BI].py + this.balloons[BI].ph + BALLOON_SPACING_Y;

        if (this.nExtantBalloons < MAX_N_BALLOONS) {
          for (let i = BI - 1; i >= 0; i--) {
            this.balloons[i].setTargetY(starty);
            starty += this.balloons[i].ph + BALLOON_SPACING_Y;
          }
        } else {
          if (this.currentBalloonIndex === BI) {
            for (let i = 1; i < MAX_N_BALLOONS; i++) {
              const bid = (this.currentBalloonIndex - i + MAX_N_BALLOONS) % MAX_N_BALLOONS;
              this.balloons[bid].setTargetY(starty);
              starty += this.balloons[bid].ph + BALLOON_SPACING_Y;
            }
          } else if (this.currentBalloonIndex > BI) {
            for (let i = BI - 1; i >= 0; i--) {
              this.balloons[i].setTargetY(starty);
              starty += this.balloons[i].ph + BALLOON_SPACING_Y;
            }
            for (let i = MAX_N_BALLOONS - 1; i > this.currentBalloonIndex; i--) {
              this.balloons[i].setTargetY(starty);
              starty += this.balloons[i].ph + BALLOON_SPACING_Y;
            }
          } else {
            for (let i = BI - 1; i > this.currentBalloonIndex; i--) {
              this.balloons[i].setTargetY(starty);
              starty += this.balloons[i].ph + BALLOON_SPACING_Y;
            }
          }
        }
      }
    }
  }
}
