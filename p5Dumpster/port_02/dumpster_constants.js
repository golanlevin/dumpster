
const   DUMPSTER_INVALID   = -1;
const   DUMPSTER_APP_W     = 1280;
const   DUMPSTER_APP_H     = 800;

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
const   PIXELVIEW_H        = 222; 
const   PIXELVIEW_W        = 90;  
const   PIXELVIEW_L        = 1;   
const   PIXELVIEW_T        = 1;
const   PIXELVIEW_SCALE    = 3;
const   MALE_BLUE_AMOUNT   = 45;
const   HISTOGRAM_H        = DUMPSTER_APP_H - PIXELVIEW_H*PIXELVIEW_SCALE;

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
const   N_BREAKUP_DATABASE_RECORDS_20K = (222*90); 
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
  