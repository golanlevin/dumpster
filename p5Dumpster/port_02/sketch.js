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
  HM.informOfMouse(mouseX, mouseY, mouseIsPressed && bMouseInHeartArea);
  HM.mouseTestHearts();
  HM.updateHearts();
  HM.renderHeartObjects();
  HM.performScheduledShuffling();

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
  PV.render();

  // HelpDisplayer
  HD.update(mouseX, mouseY);
  HD.render();

  _autoPlay();

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
// Look up text for a breakup by 0-based index.
// Files keys look like "0/0/0/00000".
function getBreakupText(id) {
  if (!textsReady) return '';
  const s = String(id).padStart(5, '0');
  const txt = Files[s[0] + '/' + s[1] + '/' + s[2] + '/' + s] || '';
  const nl = txt.indexOf('\n');
  const body = nl !== -1 ? txt.slice(nl + 1) : txt;
  return body.replace(/ ' /g, "'");
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
function mousePressed() {
  _lastInteractionTime = millis();

  // Clicks in the histogram area should not propagate to the simulation.
  if (mouseY >= HEART_WALL_B) return;

  HM.mousePressed();
  PV.mousePressed();

  const heartClicked = HM.mouseClickedHeartID;
  const pixelClicked = PV.pixelClickedBreakupId;

  if (heartClicked !== DUMPSTER_INVALID && pixelClicked === DUMPSTER_INVALID) {
    _enactSelection(heartClicked);
  } else if (heartClicked === DUMPSTER_INVALID && pixelClicked !== DUMPSTER_INVALID) {
    if (BM.bups[pixelClicked].VALID) {
      HM.decimateCurrentHeartPopulation();
      const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(pixelClicked);
      _enactSelection(heartId);
    }
  }
}

function mouseReleased() {
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
    const bupId = PV.pixelClickedBreakupId;
    if (bupId !== DUMPSTER_INVALID && BM.bups[bupId].VALID) {
      HM.decimateCurrentHeartPopulation();
      const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(bupId);
      _enactSelection(heartId);
    }
  }
}
