// Ported from Paragraph.pde

const PARA_MAX_N_LINES     = 8;
const PARA_TEXT_WIDTH_FUDGE = 0.5125;

const PARA_CHAR_WIDTHS = [
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  6,7,8,13,12,16,14,4,8,8,9,13,5,7,5,9,12,9,11,11,11,11,11,10,12,11,8,8,13,13,13,10,
  19,13,13,13,15,13,12,15,16,8,10,14,12,19,15,15,12,15,14,11,12,15,13,20,14,12,12,8,9,8,13,13,
  10,11,11,9,12,9,7,11,12,6,6,11,6,18,12,11,11,11,9,9,7,12,11,16,10,11,10,9,8,9,13,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  5,7,11,12,11,12,8,10,10,19,10,12,13,7,19,12,8,13,0,0,10,11,10,6,10,0,10,12,0,0,0,10,
  13,13,13,13,13,13,19,13,13,13,13,13,8,8,8,8,0,15,15,15,15,15,15,13,15,15,15,15,15,12,0,11,
  11,11,11,11,11,11,15,9,9,9,9,9,6,6,6,6,0,12,11,11,11,11,11,13,11,12,12,12,12,11,0,11
];

class Paragraph {

  constructor() {
    this.myStr = '';
    this.nLines = 0;
    this.myLeading = 12;
    this.b_layoutComputed = false;
    this.startCharIds = new Array(PARA_MAX_N_LINES).fill(0);
  }

  setStringAndComputeLayout(strg, pFont, maxAllowableWidth, firstLineIndent) {
    this.clear();
    this.firstLineIndent = firstLineIndent || 0;
    this.myStr = this._legalizeString(strg);
    this._computeLayout(maxAllowableWidth, this.firstLineIndent);
  }

  clear() {
    this.myStr = '';
    this.nLines = 0;
    this.firstLineIndent = 0;
    this.b_layoutComputed = false;
    for (let i = 0; i < PARA_MAX_N_LINES; i++) this.startCharIds[i] = 0;
  }

  _legalizeString(strg) {
    let out = '';
    for (let i = 0; i < strg.length; i++) {
      const ci = strg.charCodeAt(i);
      if (ci >= 32 && ci <= 126) out += strg[i];
    }
    return out;
  }

  _textWidth(st) {
    let w = 0;
    for (let i = 0; i < st.length; i++) {
      w += PARA_TEXT_WIDTH_FUDGE * PARA_CHAR_WIDTHS[st.charCodeAt(i)];
    }
    return w;
  }

  _computeLayout(maxAllowableWidth, firstLineIndent) {
    if (!this.myStr) return;
    const nChars = this.myStr.length;
    this.startCharIds[0] = 0;
    const indent = firstLineIndent || 0;

    if (this._textWidth(this.myStr) <= maxAllowableWidth - indent) {
      this.nLines = 1;
    } else {
      let startCharId = 0;
      let lineIdx = 0;

      while (startCharId < nChars && this.nLines < PARA_MAX_N_LINES) {
        const lineMax = lineIdx === 0 ? maxAllowableWidth - indent : maxAllowableWidth;

        // Advance character by character until the line would overflow.
        let fitEnd = startCharId;
        let w = 0;
        while (fitEnd < nChars) {
          const cw = PARA_TEXT_WIDTH_FUDGE * PARA_CHAR_WIDTHS[this.myStr.charCodeAt(fitEnd)];
          if (w + cw > lineMax) break;
          w += cw;
          fitEnd++;
        }

        // Safety: always make forward progress even if a single character is too wide.
        if (fitEnd === startCharId) fitEnd = startCharId + 1;

        if (fitEnd >= nChars) {
          // Remaining text fits — this is the last line.
          this.nLines++;
          if (this.nLines < PARA_MAX_N_LINES) this.startCharIds[this.nLines] = nChars;
          break;
        }

        // Scan backward to the nearest space to avoid breaking mid-word.
        // Fall back to the hard character break if no space is found.
        let nextStart = fitEnd;
        for (let i = fitEnd - 1; i > startCharId; i--) {
          if (this.myStr[i] === ' ') { nextStart = i + 1; break; }
        }

        // Skip any leading spaces at the start of the next line.
        while (nextStart < nChars && this.myStr[nextStart] === ' ') nextStart++;

        this.nLines++;
        startCharId = nextStart;
        if (this.nLines < PARA_MAX_N_LINES) this.startCharIds[this.nLines] = startCharId;
        lineIdx++;
      }
    }
    this.b_layoutComputed = true;
  }

  _isSpaceOrPunct(c) {
    return c === ' ' || c === '.' || c === ',' || c === '!' || c === '?' || c === ':';
  }

  render(x, y) {
    if (!this.b_layoutComputed) return;
    const indent = this.firstLineIndent || 0;
    let textY = y;

    if (this.nLines === 1) {
      text(this.myStr, x + indent, textY);
    } else {
      const nChars = this.myStr.length;
      let startChar = this.startCharIds[0];
      const nLinesSafe = Math.min(this.nLines, PARA_MAX_N_LINES - 1);
      const maxTextY = HEART_WALL_B + 6;

      for (let i = 0; i < nLinesSafe; i++) {
        const endChar = this.startCharIds[i + 1];
        if (startChar >= 0 && startChar < nChars && startChar <= endChar &&
            endChar >= 0 && endChar <= nChars) {
          if (textY <= maxTextY) {
            text(this.myStr.substring(startChar, endChar), i === 0 ? x + indent : x, textY);
          }
          textY += this.myLeading;
          startChar = endChar;
        }
      }
    }
  }
}
