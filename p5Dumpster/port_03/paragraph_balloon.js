// Ported from ParagraphBalloon.pde

const PB_SHADOW_OFFSET = 3;

class ParagraphBalloon {

  constructor() {
    this.myParagraph   = new Paragraph();
    this.breakupId     = DUMPSTER_INVALID;
    this.heartId       = DUMPSTER_INVALID;

    this.paraFont      = null; // set via setFont()

    this.px = BALLOON_X;
    this.py = BALLOON_START_Y;
    this.pw = BALLOON_W;
    this.ph = 64;
    this.targety = this.py;

    this.margL = 13;
    this.margR = 32; // 15 in original
    this.margT = 19; // 17
    this.margB = 2;
    this.paragraphWidth = this.pw - (this.margL + this.margR);

    this.authorDisplay = '';
    this.authorWidth   = 0;
    this.dateString    = '';

    this.b_prepared   = false;
    this.b_drawShadow = true;
    this.bIsCurrentBalloonIndex = false;
    this.b_correspondingHeartIsMousedOver = false;
    this.b_stillLoading  = true;
    this.bNewTextAppeared = false;

    // Colors — p5.Color objects, valid after p5 is ready
    this.textColor = color(0, 0, 0);
    this.edgeColor = color(192, 150, 150);
    this.shadColor = color(0, 0, 0, 50);

    this.balloonAlpha        = 0;
    this.balloonAlphaTarget  = 0;
    this.balloonAlpha2       = 0;
    this.balloonAlphaTarget2 = 0;
  }

  setFont(pF) {
    this.paraFont = pF;
  }

  setStringAndComputeLayout(aBreakupString, authorDisplay, bid, bOnlyLoading, dateString) {
    this.breakupId     = bid;
    this.authorDisplay = authorDisplay || '';
    this.dateString    = dateString    || '';

    // Measure the bold author label width so the first line of body text can be indented.
    let authorWidth = 0;
    if (this.authorDisplay) {
      push();
      textFont(this.paraFont);
      textStyle(BOLD);
      textSize(BALLOON_TEXT_SIZE);
      authorWidth = textWidth(this.authorDisplay + ' ');
      pop();
    }
    this.authorWidth = authorWidth;

    this.myParagraph.setStringAndComputeLayout(
      aBreakupString, this.paraFont, this.paragraphWidth, authorWidth);
    const paraHeight = this.myParagraph.nLines * this.myParagraph.myLeading;
    this.ph = Math.ceil(paraHeight + this.margT + this.margB);
    this.b_prepared = true;

    if (bOnlyLoading) {
      this.b_stillLoading = true;
      this.balloonAlpha  = 0;
      this.balloonAlpha2 = 0;
    } else {
      this.b_stillLoading = false;
    }
    this.bNewTextAppeared = true;
  }

  informOfCurrency(c) {
    this.bIsCurrentBalloonIndex = c;
  }

  setPositionY(y)  { this.py = y; this.targety = y; }
  setTargetY(y)    { this.targety = y; }

  updatePositionY() {
    this.py = 0.8 * this.py + 0.2 * this.targety;
    if (Math.abs(this.py - this.targety) < 1.0) this.py = this.targety;
  }

  render(mouseIsOver) {
    if (!this.b_prepared) return;

    const bcr = BALLOON_BODY_R;
    const bcg = BALLOON_BODY_G;
    const bcb = BALLOON_BODY_B;

    let tcr = red(this.textColor);
    let tcg = green(this.textColor);
    let tcb = blue(this.textColor);
    const cornerCol = color(60, 30, 30);

    if (mouseIsOver) tcr = 32;

    const pyfrac = (this.py - HEART_WALL_T) / HEART_AREA_H;
    if (pyfrac < 1.0 && pyfrac >= 0.0) {
      const dh = min(this.ph, HEART_WALL_B - this.py);

      const pyfracInv = 1.0 - pyfrac;
      const ball_alp = 255.0 * Math.pow(pyfracInv, 0.625);
      const text_alp = 255.0 * Math.pow(pyfracInv, 0.050);

      if (mouseIsOver || this.b_correspondingHeartIsMousedOver) {
        const boosted = min(255, ball_alp + BALLOON_OVER_ALPDELTA);
        if (!this.b_stillLoading) this.balloonAlpha = boosted;
      }
      this.balloonAlphaTarget = ball_alp;
      this.balloonAlpha = BALLOON_ALP_BLURA * this.balloonAlpha + BALLOON_ALP_BLURB * this.balloonAlphaTarget;
      const alpi = Math.round(this.balloonAlpha);

      // Shadow below balloon
      const sy = this.py + dh;
      if (sy < HEART_WALL_B && this.b_drawShadow) {
        fill(this.shadColor);
        rect(this.px + PB_SHADOW_OFFSET, sy, this.pw - PB_SHADOW_OFFSET, PB_SHADOW_OFFSET);
      }

      // Draw balloon body (BALLOON_FADE_QUADS is always false)
      if (alpi >= 254) {
        fill(bcr, bcg, bcb);
      } else {
        fill(bcr, bcg, bcb, alpi);
      }
      rect(this.px, this.py, this.pw, dh, 5);

      

      // Text
      fill(tcr, tcg, tcb, text_alp);
      if (this.authorDisplay) {
        push();
        textStyle(BOLD);
        text(this.authorDisplay, this.px + this.margL, this.py + this.margT);
        textStyle(ITALIC);
        pop();
      }
      this.myParagraph.render(this.px + this.margL, this.py + this.margT);

      // Date label — pixel font, rotated 90° clockwise, in right margin
      if (this.dateString) {
        push();
        textFont(pixelFont, 6);
        textStyle(NORMAL);
        textAlign(LEFT);
        fill(tcr, tcg, tcb, text_alp * 0.30);
        noStroke();
        translate(this.px + this.pw - 14, this.py + this.margL - 3);
        rotate(HALF_PI);
        text(this.dateString, 0, 0);
        pop();
      }
    }
  }
}
