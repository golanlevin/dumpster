
const   DUMPSTER_INVALID   = -1;
const   DUMPSTER_APP_W     = 1280;
const   DUMPSTER_APP_H     = 720;  // 16:9

//----------------------------------
const   DH_HILITEMODE_NONE = 0;
const   DH_HILITEMODE_OVER = 1;
const   DH_HILITEMODE_SELE = 2;
const   DH_HILITEMODE_MAUS = 3;

//----------------------------------
const   MAX_N_BALLOONS     = 14;
const   HISTOGRAM_SPACE_OCCUPANCY = 0.85;
const   DUMPSTER_LONELY_TIME = 5000;
const   HD_TEXT_BLURA      = 0.5;
const   HD_TEXT_BLURB      = (1.0- HD_TEXT_BLURA);
const   DH_BLURA           = 0.7;
const   DH_BLURB           = (1.0- DH_BLURA);

//----------------------------------
const   N_BREAKUP_LANGUAGE_DESCRIPTORS = 7;
const   N_BREAKUP_LANGUAGE_BITFLAGS = 4;
const   PIXELVIEW_H        = 200;
const   PIXELVIEW_W        = 100;
const   PIXELVIEW_L        = 1;   
const   PIXELVIEW_T        = 1;
const   PIXELVIEW_SCALE    = 3;
const   MALE_BLUE_AMOUNT   = 45;
// Lists which embedding assets this build actually ships, so the app never
// requests a .bin that isn't there. Written by textanalysis/make_embedding_asset.py.
const   EMBEDDING_MANIFEST_PATH = 'data/embeddings.json';
//----------------------------------
// Similarity blend. Six channels, combined in computeSimilarityOfAllBupsToCurrBup().
//
// These are *variance shares*, not raw multipliers. Each channel is z-scored
// across the valid records before weighting, so a channel set to 0.55 really
// does account for ~55% of the variation the viewer sees. (Exactly true if the
// channels are uncorrelated; measured |r| <= 0.12 between them here, so a good
// approximation.) They need not sum to 1 — they are normalized internally — but
// keeping them summing to 1 lets you read them as percentages.
//
// These are *ceilings*, not guarantees. A channel with no spread for a given
// selection carries no information and is skipped, its share redistributed over
// the live channels. That happens a lot, because the tag channels go flat
// whenever the selected record has no tags of that kind — measured over 120
// selections: kamalTags dead 61.7% of the time, age 45.0%, langTags 38.3%,
// accessTags 6.7%, content never. So content's realized share runs above its
// nominal 0.55 (measured ~67%).
//
// Why shares rather than weights: before standardization the channels had wildly
// different scales and firing rates, so nominal weight bore no relation to
// effect. The 2005 weights (content 0.20, length 0.05, age 0.10, langTags 0.30,
// kamalTags 0.40, accessTags 0.40) actually produced this:
//
//   channel      variance share   zero for
//   content           6.5%          1.5%
//   length            0.3%          0.0%   <- near-constant, did nothing
//   age               1.2%         88.8%   <- unknown age scored 0, not neutral
//   langTags          3.9%         94.7%
//   kamalTags        12.0%         97.5%   <- 12% of variance from 2.5% of records
//   accessTags       76.2%         49.7%   <- dominated everything
//
// i.e. ~76% shared demographic tags, ~6.5% what the texts actually said.
// Drop-one analysis: removing langTags took the top-20's mean content distance
// from 0.111 to 0.035, the single biggest gain; removing kamalTags made it
// slightly worse (0.121), so kamal is mildly helping and is kept.
const   SIM_SHARE_CONTENT     = 0.55;  // active regime's text-similarity channel
const   SIM_SHARE_ACCESS_TAGS = 0.25;  // shared sex/fault/instigator/themes
const   SIM_SHARE_AGE         = 0.10;  // age closeness, capped at AGE_DISTANCE_CAP
const   SIM_SHARE_KAMAL_TAGS  = 0.10;  // shared kamal category bits
const   SIM_SHARE_LANG_TAGS   = 0.00;  // shared language bitflags — retired, see above
const   SIM_SHARE_LENGTH      = 0.00;  // summary-length closeness — retired, see above

// Age difference at or beyond which two records count as maximally far apart.
const   AGE_DISTANCE_CAP   = 5.0;

// Score for the age channel when either record's age is unknown (age === 0).
// computeAgeDifference() returns DUMPSTER_INVALID there; the 2005 code left the
// term at 0.0, i.e. treated "unknown" as *maximally dissimilar*, penalising the
// 36.7% of records with no age. 0.5 treats it as neutral. Set 0.0 for the
// original behaviour.
const   AGE_UNKNOWN_SCORE  = 0.5;

// Final mapping of the blended score into [0,1]. The blend is a weighted sum of
// z-scores, so it is centred near 0 with sd near 1; these clamp it at
// mean -/+ k*sd and rescale. Dividing by the raw maximum instead (as the 2005
// code did) squashes everything, because the selected record is identical to
// itself and therefore sits many sd above the rest of the corpus.
const   SIM_CONTRAST_LO_SIGMA = 2.5;
const   SIM_CONTRAST_HI_SIGMA = 3.0;
const   HISTOGRAM_H        = DUMPSTER_APP_H - PIXELVIEW_H*PIXELVIEW_SCALE;
const   PIXELVIEW_B        = PIXELVIEW_T + PIXELVIEW_H*PIXELVIEW_SCALE;

//----------------------------------
// PixelView spatial layouts, switchable at runtime with keys 7/8/9 (or
// ?layout=7). Built offline by textanalysis/make_pixel_layout.py: a 2D UMAP of
// the clip embeddings, grid-rectified with a Linear Assignment (Jonker-
// Volgenant) solve *within* each group. The macro scaffolding — age bands top to
// bottom, sex ribbons, instigator runs — is inherited unchanged from the classic
// four-pass sort; only the ordering inside each group becomes semantic.
//
// Dropping a field from the grouping enlarges the groups, so the semantic layout
// gets more room but that attribute stops being spatially legible:
//
//   grouping              groups   >=100 clips cover   LAP solve
//   age,sex,instigator      278         82.7%            1.5 s
//   age,sex                 102         95.0%           13.8 s
//
// `asset: null` means run PixelIndexer's original four sorts, which are still
// present and are also the fallback if an asset is missing or fails to parse.
const   PIXELVIEW_LAYOUTS = [
  { key: '7', label: 'SORT-2005', asset: null },
  { key: '8', label: 'LAP-A/S/I', asset: 'data/pixel_layout_lap_asi.bin' },
  { key: '9', label: 'LAP-A/S',   asset: 'data/pixel_layout_lap_as.bin'  },
];
const   PIXELVIEW_LAYOUT_DEFAULT = 2;   // LAP-A/S: most semantically coherent (-12.7% vs random)

// Development key bindings: 1-4 switch the similarity regime, 7-9 the PixelView
// layout. Off for exhibition so a visitor cannot change the piece's behaviour.
// The ?regime= and ?layout= URL parameters still work either way.
const   ENABLE_DEBUG_KEYS = false;

// Arrow-key auto-repeat for the pixel-view cursor, in ms: how long to hold
// before repeating starts, then the interval between steps. Repeats are capped
// at one per frame, so the effective rate is min(1000/RATE, frameRate).
const   ARROW_REPEAT_DELAY_MS = 220;
const   ARROW_REPEAT_RATE_MS  = 45;

// Nonlinearity applied to similarity before it becomes PixelView luminance.
// >1 darkens and expands the top of the range, so only close matches stay bright
// and the field reads as a sparse constellation rather than an even wash; <1
// brightens and flattens. Chosen by eye with a mouseY sweep. Folded into the LUT
// exponents in PixelView._constructLUTs() rather than applied per pixel, since
// pow(pow(x,g),p) === pow(x,g*p) — free, and it avoids quantizing twice.
const   PIXELVIEW_LUMINANCE_GAMMA = 1.43;

//----------------------------------
// Bottom-left strip: mag loupe + help text on black, tucked under the pixel
// view and left of the histogram. This strip is the tightest vertical
// constraint in the app, so its offsets live here rather than inline.
const   MAGVIEW_NX         = 7;
const   MAGVIEW_NY         = 5;
const   MAGVIEW_SCALE      = 18;
const   MAGVIEW_W          = MAGVIEW_NX * MAGVIEW_SCALE;
const   MAGVIEW_H          = MAGVIEW_NY * MAGVIEW_SCALE;
// 12.5 app px == 25 device px at pixelDensity(2), so cell edges land on exact
// device pixels. The +1 nudges the cell grid inward far enough for the loupe's
// outer border ring (drawn at -1) to sit exactly on the margin.
const   MAGVIEW_MARGIN     = 12.5;
const   MAGVIEW_L          = MAGVIEW_MARGIN + 1;
const   MAGVIEW_T          = PIXELVIEW_B + MAGVIEW_MARGIN + 1;
const   HELP_TEXT_L        = MAGVIEW_L + MAGVIEW_W + 1 + MAGVIEW_MARGIN;
const   HELP_TEXT_T        = MAGVIEW_T + 8;

//----------------------------------
const   HEART_WALL_L       = PIXELVIEW_W*PIXELVIEW_SCALE +2;
const   HEART_WALL_R       = DUMPSTER_APP_W-2;
const   HEART_WALL_T       = 1;
const   HEART_WALL_B       = DUMPSTER_APP_H - HISTOGRAM_H;
const   HEART_AREA_W       = HEART_WALL_R - HEART_WALL_L;
const   HEART_AREA_H       = HEART_WALL_B - HEART_WALL_T;
const   opt_8dHA_W         = 7.99999/HEART_AREA_W; 
const   opt_8dHA_H         = 7.99999/HEART_AREA_H;
const   HEART_HEAP_CENTERX = HEART_WALL_L + HEART_AREA_W/4.0;
const   HEART_HEAP_CENTERY = HEART_WALL_B;

//----------------------------------
const   BALLOON_START_Y    =  7;
const   BALLOON_APPMARGIN_R = 7;
const   BALLOON_SPACING_Y  = 6;
const   BALLOON_W          = Math.min (90*4, (Math.floor (HEART_AREA_W / 2.0)) - BALLOON_APPMARGIN_R);
const   BALLOON_X          = DUMPSTER_APP_W - BALLOON_W - BALLOON_APPMARGIN_R;
const   CONNECTOR_BEZ_DIF  = HEART_AREA_W/5.0;

const   BALLOON_BODY_R     = 255;
const   BALLOON_BODY_G     = 200;
const   BALLOON_BODY_B     = 200;

const   BALLOON_BODY_R2    = 255;
const   BALLOON_BODY_G2    = 210;
const   BALLOON_BODY_B2    = 210;
const   BALLOON_OVER_ALPDELTA = 28;
const   BALLOON_ALP_BLURA  = 0.85;
const   BALLOON_ALP_BLURB  = (1.0 - BALLOON_ALP_BLURA);
const   BALLOON_FADE_QUADS = false;
const   BALLOON_TEXT_SIZE    = 11;
const   SHOW_NONGOOD_BREAKUPS = true;
const   PIXELVIEW_DRAG_THRESHOLD_PX = 16;
const   DH_STRIPE_ANTIALIAS_PX = 3.0;
const   BALLOON_LOADING_STRING = "Connecting ...";
const   BALLOON_SHOW_AUTHOR_NAME = true;

//----------------------------------
const   N_BREAKUP_DATABASE_RECORDS = 20038;
const   N_BREAKUP_DATABASE_RECORDS_20K = (PIXELVIEW_H*PIXELVIEW_W);
const   MAX_N_HEARTS       = 720;
const   HM_SHUFFLE_SLOP    = 0.135;
const   HM_SHUFFLE_PROBABILITY  = 0.08; // probability per frame of swapping a heart out

const   HEART_MIN_RAD      = 4.5;
const   HEART_MIN_RADp1    = HEART_MIN_RAD + 1;
const   HEART_MAX_RAD      = 14;
const   HEART_AVG_RAD      = (HEART_MIN_RAD + HEART_MAX_RAD)/2.0;
const   HEART_OVER_RADIUS   = 20;
const   HEART_SELECT_RADIUS = 28;
const   HEART_DRAG_RADIUS   = 36;
const   HEART_MIN_OVERLAP_DIST = 0.0;
const   HEART_NEIGHBORHOOD = (HEART_MAX_RAD * 4);
const   HEART_NEIGHBORHOOD_SQ = (HEART_NEIGHBORHOOD*HEART_NEIGHBORHOOD);

const   HEART_MASS_CONSTANT = 1.0/(HEART_AVG_RAD*HEART_AVG_RAD);
const   HEART_GRAVITY      = 0.030;
const   HEART_DAMPING      = 0.99;
const   HEART_COLLISION_DAMPING = 0.925;
const   HEART_HEAPING_K    = 0.03;
const   HEART_COLLISION_K  = -0.04;
const   HEART_MOUSE_K      = -0.35;

const   HEART_MAX_VEL      = 6.0;
const   HEART_MAX_VELd2    = HEART_MAX_VEL /2.0;
const   HEART_DIAM_SHAVE   = 1.49;

const   HEART_BLUR_CA      = 0.885;
const   HEART_BLUR_CB      = (1.00-HEART_BLUR_CA);
const   HEART_BLUR_RA      = 0.90;
const   HEART_BLUR_RB      = (1.00-HEART_BLUR_RA);

const   STATE_MOUSE_IGNORE  = 0; // i'm ignoring it.
const   STATE_MOUSE_OVER    = 1; // i'm hovering over it
const   STATE_MOUSE_SELECT  = 2; // it's just selected, but i'm not over it
const   STATE_MOUSE_DRAG    = 3; // im dragging it around, and it's selected

const   STATE_HEART_GONE    = -1;
const   STATE_HEART_FADING  = 0;
const   STATE_HEART_EXISTS  = 1;

//----------------------------------
// see http://www.opengl.org/resources/tutorials/advanced/advanced98/notes/node185.html
// http://www.sgi.com/misc/grafica/interp/
const   LUMINANCES = [0.3086, 0.6094, 0.0820];
const   LUMINANCES_R = LUMINANCES[0];
const   LUMINANCES_G = LUMINANCES[1];
const   LUMINANCES_B = LUMINANCES[2];
const   HEART_SATURATE_A = 1.5;
const   HEART_SATURATE_B = (1.0 - HEART_SATURATE_A);

const   bindices = [3, 7, 14, 28, 56, 112, 224, 192];
const   BUP_COMPARE_AGE    = 0;
const   BUP_COMPARE_SEX    = 1;
const   BUP_COMPARE_INSTIG = 2;
const   BUP_COMPARE_LANG   = 3;

//----------------------------------
const mean_egon = 0.204022240;
const stdv_egon = 0.097832600;

const mean_exon = 0.060806002; 
const stdv_exon = 0.090450930;

const mean_fukn = 0.013498707; 
const stdv_fukn = 0.056290355;

const mean_capn = 0.044475384; 
const stdv_capn = 0.109096274;

const mean_excn = 0.030499335; 
const stdv_excn = 0.068099186;

const mean_quen = 0.003471169;
const stdv_quen = 0.018286707;

const mean_pern = 0.093191720; 
const stdv_pern = 0.083592765;

const mean_age  = 16.62996500; 
const stdv_age  = 3.329887200;

const LANG_MEANS = [
    mean_egon, 
    mean_exon, 
    mean_fukn, 
    mean_capn, 
    mean_excn, 
    mean_quen, 
    mean_pern
];
  
const LANG_STDVS = [
    stdv_egon, 
    stdv_exon, 
    stdv_fukn, 
    stdv_capn, 
    stdv_excn, 
    stdv_quen, 
    stdv_pern
];
  