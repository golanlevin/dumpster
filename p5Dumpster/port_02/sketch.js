// TheDumpster — p5.js port (port_02)

var KOS; // KnowerOfSelections
var BM;  // BreakupManager
var HM;  // HeartManager
var PBM; // ParagraphBalloonManager
var HBC; // HeartBalloonConnector
var DH;  // DumpsterHistogram
var PV;  // PixelView
var HD;  // HelpDisplayer

var pixelFont;
var textsReady = false;

// Preloaded raw assets (synchronously available in setup)
var _langDataLines, _langTagsLines, _kamalLines, _accessLines;
var _summaryFile, _histLines;
var _histbg, _dumpsterimg;

var _lastInteractionTime = 0;
var _balloonClickActive = false;      // true while mouse is held on a balloon
var _bPixelViewMouseDownInView = false; // true from mouseDown in pixel view until mouseUp
var _bPixelViewDragActive = false;    // true once mouse has moved >= 20px from click origin
var _pixelViewClickOriginX = 0;
var _pixelViewClickOriginY = 0;
var _pixelViewClickBupId = DUMPSTER_INVALID;

//------------------------------------------------------------
function preload() {
  _langDataLines = loadStrings('data/languageData.txt');
  _langTagsLines = loadStrings('data/languageTags.txt');
  _kamalLines    = loadStrings('data/kamalFlags.txt');
  _accessLines   = loadStrings('data/accessThemes.tsv');
  _summaryFile   = loadBytes ('data/breakupSummaryLengths.dat');
  _histLines     = loadStrings('data/breakupsPerDay2005.txt');
  pixelFont      = loadFont  ('data/6px2bus.ttf');
  _histbg        = loadImage ('data/hist_1010x125.jpg');
  _dumpsterimg   = loadImage ('data/dumpster_1010x675.jpg');
}

//------------------------------------------------------------
function setup() {
  createCanvas(DUMPSTER_APP_W, DUMPSTER_APP_H);
  pixelDensity(2); 
  noSmooth();

  KOS = new KnowerOfSelections();
  BM  = new BreakupManager();
  BM.loadFromAssets(_langDataLines, _langTagsLines, _kamalLines,
                    _summaryFile.bytes, _accessLines);

  HM  = new HeartManager(KOS, BM);
  PBM = new ParagraphBalloonManager();
  HBC = new HeartBalloonConnector(PBM, HM);
  DH  = new DumpsterHistogram(pixelFont, 0, HEART_WALL_B, DUMPSTER_APP_W, HISTOGRAM_H,
                               KOS, _histLines, _histbg);
  PV  = new PixelView(BM, KOS);
  HD  = new HelpDisplayer(pixelFont, BM, KOS);

  // Text corpus loads in the background; textsReady gates balloon text lookups.
  loadClips(function() {
    textsReady = true;
    console.log('Text snippets loaded:', Object.keys(Files).length);

    // Pick a random valid breakup as the initial selection.
    let randomId;
    do { randomId = Math.floor(random(N_BREAKUP_DATABASE_RECORDS_20K)); }
    while (!BM.bups[randomId].VALID);
    const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(randomId);
    _enactSelection(heartId);

    // Temporary: fixed breakup for debugging histogram flag issue.
    // const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(10158);
    // _enactSelection(heartId);
  });
}

//------------------------------------------------------------
function draw() {
  // Background
  background(0);
  image(_dumpsterimg, HEART_WALL_L, HEART_WALL_T);

  // HeartManager
  const bMouseInHeartArea = mouseX >= HEART_WALL_L && mouseX <= HEART_WALL_R &&
                             mouseY >= HEART_WALL_T && mouseY <= HEART_WALL_B;
  HM.informOfMouse(mouseX, mouseY, mouseIsPressed && bMouseInHeartArea && !_balloonClickActive);
  HM.mouseTestHearts();
  HM.updateHearts();
  HM.renderHeartObjects();
  if (!_bPixelViewDragActive) HM.performScheduledShuffling();

  // ParagraphBalloonManager
  PBM.informOfMouse(mouseX, mouseY, mouseIsPressed);
  PBM.render();

  // HeartBalloonConnector
  HBC.renderConnections();

  // DumpsterHistogram
  DH.informOfMouse(mouseX, mouseY, mouseIsPressed);
  DH.loop();

  // PixelView
  PV.informOfMouse(mouseX, mouseY, mouseIsPressed);
  if (_bPixelViewMouseDownInView && mouseIsPressed) {
    if (!_bPixelViewDragActive) {
      const dx = mouseX - _pixelViewClickOriginX;
      const dy = mouseY - _pixelViewClickOriginY;
      if (dx * dx + dy * dy >= PIXELVIEW_DRAG_THRESHOLD_PX * PIXELVIEW_DRAG_THRESHOLD_PX) _bPixelViewDragActive = true;
    }
    if (_bPixelViewDragActive) _enactPixelDrag();
  }
  PV.render();

  // HelpDisplayer
  HD.update(mouseX, mouseY);
  HD.render();

  if (!_bPixelViewDragActive && !HM.bCurrentlyDraggingSelectedHeart) _autoPlay();

  drawDraft(); 
}


function drawDraft(){
  textFont("Helvetica");
  textStyle(BOLD);
  textSize(288); 
  noStroke();
  fill(255,255,255, 60); 
  textAlign(CENTER);
  push(); 
  translate(width/2, height * 0.6); 
  rotate(radians(-15));
  text("DRAFT", 0,0); 
  pop(); 
  textAlign(LEFT);
}

//------------------------------------------------------------
function _autoPlay() {
  const elapsed = millis() - _lastInteractionTime;
  if (elapsed > DUMPSTER_LONELY_TIME) {
    if (random(1) < 0.01) {
      const randomId = Math.floor(random(N_BREAKUP_DATABASE_RECORDS_20K));
      if (BM.bups[randomId].VALID) {
        HM.decimateCurrentHeartPopulation();
        const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(randomId);
        _enactSelection(heartId);
      }
    }
  }
}

//------------------------------------------------------------
function _enactSelection(heartId) {
  if (heartId === DUMPSTER_INVALID || heartId < 0 || heartId >= MAX_N_HEARTS) return;
  const bupId = HM.hearts[heartId].breakupId;
  if (bupId === DUMPSTER_INVALID) return;

  PBM.execute(bupId, heartId);
  BM.informOfNewlySelectedBreakup(bupId);
  HM.refreshHeartColors(BM, bupId);
  PV.updateImage();
}

//------------------------------------------------------------
function _enactPixelDrag() {
  if (!PV.bMouseInView) return;
  const bupId = PV.getMousePixelBupId();
  if (bupId === DUMPSTER_INVALID || !BM.bups[bupId].VALID) return;
  if (bupId === KOS.currentSelectedBreakupId) return;

  PV.snapSelectionToBupId(bupId);
  KOS.currentMouseoverBreakupId           = bupId;
  KOS.currentMouseoverBreakupIdWithOffset = bupId;
  HM.updateSelectedHeartBreakupId(bupId);
  PBM.updateTopmostBalloonInPlace(bupId, HM.mouseSelectedHeartID);
  BM.informOfNewlySelectedBreakup(bupId);
  HM.refreshHeartColors(BM, bupId);
  PV.updateImage();
}

//------------------------------------------------------------
// Look up text for a breakup by 0-based index.
// Files keys look like "0/0/0/00000".
function getBreakupText(id) {
  if (!textsReady) return '';
  const s = String(id).padStart(5, '0');
  const txt = Files[s[0] + '/' + s[1] + '/' + s[2] + '/' + s] || '';
  const nl = txt.indexOf('\n');
  const body = nl !== -1 ? txt.slice(nl + 1) : txt;
  return body.replace(/ ` /g, "'").replace(/ ' /g, "'");
}

function getBreakupAuthorDisplay(id) {
  if (!textsReady || !BALLOON_SHOW_AUTHOR_NAME) return '';
  const s = String(id).padStart(5, '0');
  const txt = Files[s[0] + '/' + s[1] + '/' + s[2] + '/' + s] || '';
  const nl = txt.indexOf('\n');
  const authorLine = nl !== -1 ? txt.slice(0, nl) : txt;
  const paren = authorLine.indexOf('(');
  const name = (paren !== -1 ? authorLine.slice(paren + 1) : authorLine).trim().replace(/\s+/g, '');
  return name + ' >';
}

//------------------------------------------------------------
function _enactHistogramDayClick(dayIndex) {
  if (dayIndex < 0 || dayIndex + 1 > 365) return;

  // Collect all valid breakups whose date matches this day.
  const candidates = [];
  for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) {
    if (BM.bups[i].VALID && BM.bups[i].date === dayIndex + 1) candidates.push(i);
  }
  if (candidates.length === 0) return;

  // Pick one to become the main selected breakup (same flow as a pixel click).
  const selectedBupId = candidates[Math.floor(random(candidates.length))];
  HM.decimateCurrentHeartPopulation();
  const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(selectedBupId);
  _enactSelection(heartId);

  // console.log(`Histogram click: dayIndex=${dayIndex}, ${candidates.length} candidates`);
  // console.log(`  Selected: bupId=${selectedBupId}, date=${BM.bups[selectedBupId].date}`);

  // Immediately seed several more hearts from the same day.
  const beforeIds = new Set(HM.activeHeartIds);
  HM.initiateHeartsFromList(candidates, candidates.length);
  for (const hid of HM.activeHeartIds) {
    if (!beforeIds.has(hid)) {
      const bupId = HM.hearts[hid].breakupId;
      // console.log(`  Added heart ${hid}: bupId=${bupId}, date=${BM.bups[bupId].date}`);
    }
  }
}

//------------------------------------------------------------
function mousePressed() {
  _lastInteractionTime = millis();

  // Mag-view clicks (bottom-left loupe): treated like a pixel-view selection.
  const magClickedBupId = PV.checkMagClick(mouseX, mouseY);
  if (magClickedBupId !== DUMPSTER_INVALID) {
    PV.activateBupId(magClickedBupId);
    HM.decimateCurrentHeartPopulation();
    const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(magClickedBupId);
    _enactSelection(heartId);
    return;
  }

  // Histogram-area clicks: handle day selection, then stop.
  if (mouseY >= HEART_WALL_B) {
    if (mouseY <= DUMPSTER_APP_H && mouseX >= DH.histogramL && mouseX <= DH.histogramR) {
      _enactHistogramDayClick(DH.dataIndexOfCursor);
    }
    return;
  }

  // Balloon clicks are handled exclusively — they do not propagate to the
  // heart or pixel-view systems.
  const clickedBalloonIdx = PBM.getMouseContainingBalloon();
  if (clickedBalloonIdx !== DUMPSTER_INVALID) {
    _balloonClickActive = true;
    if (clickedBalloonIdx !== PBM.currentBalloonIndex) {
      const b = PBM.balloons[clickedBalloonIdx];
      if (b.heartId !== DUMPSTER_INVALID) {
        HM.causeHeartToBecomeTheMainSelection(b.heartId);
        _enactSelection(b.heartId);
      }
    }
    return;
  }

  HM.mousePressed();
  const heartClicked = HM.mouseClickedHeartID;
  if (heartClicked !== DUMPSTER_INVALID) {
    _enactSelection(heartClicked);
  } else if (PV.bMouseInView) {
    _pixelViewClickBupId = PV.getMousePixelBupId();
    _pixelViewClickOriginX = mouseX;
    _pixelViewClickOriginY = mouseY;
    _bPixelViewMouseDownInView = true;
    _bPixelViewDragActive = false;

    // Immediate click: snap yellow cursor and add to balloon stack + particle system.
    if (_pixelViewClickBupId !== DUMPSTER_INVALID && BM.bups[_pixelViewClickBupId].VALID) {
      PV.snapSelectionToBupId(_pixelViewClickBupId);
      HM.decimateCurrentHeartPopulation();
      const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(_pixelViewClickBupId);
      _enactSelection(heartId);
    }
  }
}

function mouseReleased() {
  _balloonClickActive = false;
  _bPixelViewMouseDownInView = false;
  if (_bPixelViewDragActive) PBM.restoreTopmostBalloonHeight();
  _bPixelViewDragActive = false;
  HM.mouseReleased();
  _lastInteractionTime = millis();
}

function mouseMoved() {
  _lastInteractionTime = millis();
}

function keyPressed() {
  _lastInteractionTime = millis();
  PV.sendArrowKey(keyCode);

  if (keyCode === ENTER && PV.bMouseInView) {
    const bupId = KOS.currentMouseoverBreakupIdWithOffset;
    if (bupId !== DUMPSTER_INVALID &&
        bupId !== KOS.currentSelectedBreakupId &&
        BM.bups[bupId].VALID) {
      HM.decimateCurrentHeartPopulation();
      const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(bupId);
      _enactSelection(heartId);
    }
  }
}
