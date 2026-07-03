import { StyleSheet, Platform, Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

// ─── Design Tokens ────────────────────────────────────────────────────────────
const COLOR = {
  // Primary teal brand ramp
  tealDeep: '#0D3D40',
  tealMid: '#0A5C62',
  tealBright: '#0A9BAA',
  tealLight: '#7EDDE3',
  tealGlow: 'rgba(10,155,170,0.18)',

  // Neutral teal-tinted
  inkPrimary: '#1A2E35',
  inkMuted: '#4A6E72',
  inkFaint: '#8AACAF',

  // Backgrounds
  bgPage: '#F0F5F5',
  bgCard: '#FFFFFF',
  bgInputIdle: '#FFFFFF',
  bgInputFocus: '#F8FEFF',

  // Borders
  borderIdle: '#D0E2E3',
  borderFocus: '#0A9BAA',
  borderCard: '#E2EDED',

  // Misc
  white: '#FFFFFF',
  placeholder: '#B0CCCF',
};

const FONT = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
};

const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 32,
  pill: 100,
};

// ─── INDEX SCREEN STYLES ──────────────────────────────────────────────────────
export const indexStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR.tealDeep,
  },

  // ── Decorative blobs ───────────────────────────────────────────────────────
  blobTopRight: {
    position: 'absolute',
    top: -W * 0.28,
    right: -W * 0.22,
    width: W * 0.75,
    height: W * 0.75,
    borderRadius: W * 0.375,
    backgroundColor: 'rgba(10,155,170,0.13)',
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: H * 0.18,
    left: -W * 0.3,
    width: W * 0.65,
    height: W * 0.65,
    borderRadius: W * 0.325,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Subtle dot-grid achieved via repeating borderBottom/Right tricks
    // For a true dot-grid use an SVG background image or react-native-svg
    opacity: 0.03,
  },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 24,
    marginBottom: 0,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  brandLogo: {
    width: 44,
    height: 44,
  },
  brandName: {
    fontFamily: FONT.serif,
    fontSize: 20,
    color: COLOR.white,
    letterSpacing: 0.3,
  },
  brandAccent: {
    color: COLOR.tealLight,
  },

  accessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: RADIUS.pill,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  accessBadgeText: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '500',
    letterSpacing: 0.4,
  },

  // ── Hero block ────────────────────────────────────────────────────────────
  heroBlock: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 36,
    justifyContent: 'flex-start',
  },

  eyebrowTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 18,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR.tealLight,
  },
  eyebrowText: {
    fontFamily: FONT.sans,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  headline: {
    fontFamily: FONT.serif,
    fontSize: 42,
    color: COLOR.white,
    lineHeight: 52,
    letterSpacing: -0.8,
    marginBottom: 14,
  },
  headlineAccent: {
    color: COLOR.tealLight,
    fontStyle: 'italic',
  },

  subheadline: {
    fontFamily: FONT.sans,
    fontSize: 14,
    color: 'rgba(255,255,255,0.52)',
    lineHeight: 22,
    letterSpacing: 0.1,
    maxWidth: 300,
    marginBottom: 24,
  },

  // ── Feature pills ─────────────────────────────────────────────────────────
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(126,221,227,0.22)',
    borderRadius: RADIUS.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pillText: {
    fontFamily: FONT.sans,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.2,
  },

  // ── Stat cards ────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 26,
    marginTop: 28,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FONT.serif,
    fontSize: 22,
    color: COLOR.tealLight,
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  statLabel: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── CTA block ─────────────────────────────────────────────────────────────
  ctaBlock: {
    paddingHorizontal: 26,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    gap: 12,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.tealLight,
    borderRadius: RADIUS.md,
    height: 56,
    gap: 10,
  },
  primaryBtnText: {
    fontFamily: FONT.sans,
    fontSize: 16,
    fontWeight: '700',
    color: COLOR.tealDeep,
    letterSpacing: 0.2,
  },
  primaryBtnArrow: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(13,61,64,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: RADIUS.md,
    height: 52,
  },
  secondaryBtnText: {
    fontFamily: FONT.sans,
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.2,
  },

  disclaimer: {
    textAlign: 'center',
    fontFamily: FONT.sans,
    fontSize: 11,
    color: 'rgba(255,255,255,0.32)',
    marginTop: 4,
    marginBottom: 30,
  },
  disclaimerLink: {
    color: 'rgba(126,221,227,0.65)',
    fontWeight: '600',
  },
});

// ─── SIGN-IN & REGISTER SCREEN STYLES (slide-up sheet) ────────────────────────
export const signInStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,28,30,0.55)',
  },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Changed: Height H * 0.9 ensures it never covers the very top of Index screen
    height: H * 0.9,
    backgroundColor: COLOR.bgPage,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#0D3D40',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: {
        elevation: 16,
      },
    }),
  },

  // ── Handle / Header (Compacted) ─────────────────────────────────────────
  handleWrap: {
    paddingTop: 10, // Reduced from 14
    paddingBottom: 12, // Reduced from 20
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.borderCard,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLOR.borderCard,
    marginBottom: 12, // Reduced from 20
  },
  sheetTitle: {
    fontFamily: FONT.serif,
    fontSize: 24, // Reduced from 26
    color: COLOR.inkPrimary,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  sheetSubtitle: {
    fontFamily: FONT.sans,
    fontSize: 13,
    color: COLOR.inkFaint,
    letterSpacing: 0.1,
  },

  // ── Form scroll ───────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16, // Reduced from 24
    paddingBottom: Platform.OS === 'ios' ? 60 : 40,
  },

  // ── Fields (Vertically Tightened) ─────────────────────────────────────────
  fieldGroup: {
    marginBottom: 12, // Reduced from 16
  },
  fieldLabel: {
    fontFamily: FONT.sans,
    fontSize: 11,
    fontWeight: '600',
    color: COLOR.inkMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6, // Reduced from 8
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.bgInputIdle,
    borderWidth: 1.5,
    borderColor: COLOR.borderIdle,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    height: 48, // Reduced from 52 to save significant space
    gap: 10,
  },
  inputRowFocused: {
    borderColor: COLOR.borderFocus,
    backgroundColor: COLOR.bgInputFocus,
  },
  input: {
    flex: 1,
    fontFamily: FONT.sans,
    fontSize: 15,
    color: COLOR.inkPrimary,
    paddingVertical: 0,
  },

  // ── Main Action Button ────────────────────────────────────────────────────
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.tealDeep,
    borderRadius: RADIUS.md,
    height: 52, // Reduced from 56
    marginTop: 8,
    gap: 10,
  },
  signInBtnDisabled: {
    opacity: 0.6,
  },
  signInBtnText: {
    fontFamily: FONT.sans,
    fontSize: 16,
    fontWeight: '600',
    color: COLOR.white,
    letterSpacing: 0.3,
  },
  signInArrow: {
    width: 22, // Reduced from 24
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16, // Reduced from 24
    marginBottom: 12, // Reduced from 16
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLOR.borderIdle,
  },
  dividerText: {
    fontFamily: FONT.sans,
    fontSize: 11,
    fontWeight: '600',
    color: COLOR.inkFaint,
    letterSpacing: 0.6,
  },

  // ── Social (Compacted) ────────────────────────────────────────────────────
  socialRow: {
    flexDirection: 'row',
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLOR.bgCard,
    borderWidth: 1.5,
    borderColor: COLOR.borderIdle,
    borderRadius: RADIUS.md,
    height: 46, // Reduced from 48
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20, // Reduced from 28
    gap: 4,
  },
  footerText: {
    fontFamily: FONT.sans,
    fontSize: 13,
    color: COLOR.inkFaint,
  },
  footerLink: {
    fontFamily: FONT.sans,
    fontSize: 13,
    fontWeight: '600',
    color: COLOR.tealMid,
  },
});

export const styles = signInStyles;
