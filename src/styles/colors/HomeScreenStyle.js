// HomeScreenStyle.js
import { StyleSheet, Platform } from 'react-native';
import { COLOR, FONT, RADIUS, WINDOW_WIDTH as W } from './theme';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR.bgPage,
  },

  // ── Ambient page background ─────────────────────────────────────────────────
  // Two soft, out-of-focus color blobs anchored off-canvas top-left/bottom-right
  // (teal + a warm amber accent, echoing the Saved Signs tint) plus a faint dot
  // grid threaded through the middle of the page. Everything sits well under
  // 6% opacity so it reads as paper texture, never competing with card content
  // or text — the cards' own opaque backgrounds sit on top regardless.
  pageBgLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  pageBgBlobTop: {
    position: 'absolute',
    top: 140,
    left: -90,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(52, 233, 253, 0.3)',
  },
  pageBgBlobBottom: {
    position: 'absolute',
    bottom: 60,
    right: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(245,158,11,0.07)',
  },
  pageDotGrid: {
    position: 'absolute',
    top: 260,
    left: 0,
    right: 0,
    gap: 28,
  },
  pageDotRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  pageDot: {
    width: 4,
    height: 4,
    borderRadius: 1.5,
    backgroundColor: 'rgba(10,155,170,0.10)',
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: COLOR.tealDeep,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 12,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  // Header signature: one soft circular blob, tucked top-right, barely-there.
  headerBlob: {
    position: 'absolute',
    top: -W * 0.2,
    right: -W * 0.15,
    width: W * 0.55,
    height: W * 0.55,
    borderRadius: W * 0.275,
    backgroundColor: 'rgba(126,221,227,0.10)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  headerGreeting: {
    fontFamily: FONT.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  headerName: {
    fontFamily: FONT.serif,
    fontSize: 26,
    color: COLOR.white,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scroll ────────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },

  // ── Translator CTA (hero card) ──────────────────────────────────────────────
  // Solid hero card that replaces the old live-camera viewfinder. Deliberately
  // a darker, denser teal than the header (#0D2B2E vs tealDeep) with an offset
  // dual-glow + faint pulse-line watermark, so it reads as its own surface
  // rather than a continuation of the header band above it.
  translatorCard: {
    backgroundColor: '#0D2B2E',
    borderRadius: RADIUS.xl,
    padding: 22,
    overflow: 'hidden',
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 6,
  },
  translatorGlowTop: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(10,155,170,0.35)',
  },
  translatorGlowBottom: {
    position: 'absolute',
    bottom: -70,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(126,221,227,0.16)',
  },
  // Graph-paper style grid — gives the card real texture instead of a flat
  // fill. Lines are hairline and low-opacity so they read as a surface
  // material, not as content competing with the text.
  translatorGridLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  translatorGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  translatorGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  translatorWatermark: {
    position: 'absolute',
    bottom: -22,
    right: -14,
  },
  // Scrim sits above the pattern/glow and below the text, darkening just
  // enough that title/body copy stay fully legible no matter what's behind.
  translatorScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,43,46,0.38)',
  },
  translatorTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  translatorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  translatorLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  translatorLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR.tealLight,
  },
  translatorLiveText: {
    fontFamily: FONT.sans,
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1,
  },
  translatorTitle: {
    fontFamily: FONT.serif,
    fontSize: 21,
    color: COLOR.white,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  translatorSub: {
    fontFamily: FONT.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 22,
    maxWidth: '92%',
  },
  translatorCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  translatorCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLOR.tealLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: 18,
    height: 46,
  },
  translatorCtaText: {
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: '700',
    color: COLOR.tealDeep,
    letterSpacing: 0.2,
  },

  // ── Section Label ─────────────────────────────────────────────────────────────
  sectionLabel: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // ── Phrasebook Card ───────────────────────────────────────────────────────────
  phrasebookCard: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  phrasebookCardBody: {
    flex: 1,
    padding: 18,
  },
  phrasebookCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  phrasebookIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phrasebookFslBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(10,155,170,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
  },
  phrasebookFslBadgeText: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.tealBright,
    letterSpacing: 0.8,
  },
  phrasebookCardTitle: {
    fontFamily: FONT.serif,
    fontSize: 17,
    color: COLOR.inkPrimary,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  phrasebookCardSub: {
    fontFamily: FONT.sans,
    fontSize: 12,
    color: COLOR.inkFaint,
    lineHeight: 17,
    marginBottom: 14,
  },
  phrasebookChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  phrasebookChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.bgPage,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
  },
  phrasebookChipText: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '600',
    color: COLOR.inkMuted,
    letterSpacing: 0.3,
  },
  phrasebookChipMore: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
  },
  phrasebookChipMoreText: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: COLOR.tealBright,
    letterSpacing: 0.2,
  },
  phrasebookOpenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phrasebookOpenText: {
    fontFamily: FONT.sans,
    fontSize: 12,
    fontWeight: '700',
    color: COLOR.tealBright,
    letterSpacing: 0.2,
  },

  // Decorative right panel
  phrasebookCardDeco: {
    width: 72,
    backgroundColor: 'rgba(10,155,170,0.04)',
    borderLeftWidth: 1,
    borderLeftColor: COLOR.borderCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decoCircleOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(10,155,170,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  decoCircleInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(10,155,170,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Quick Actions (organized as a clean list of rows, each independently
  //    tappable, each with its own tinted icon so the four actions read as
  //    distinct destinations rather than a generic grid) ──────────────────────
  quickList: {
    gap: 10,
  },
  quickCard: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: FONT.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: COLOR.inkPrimary,
    lineHeight: 17,
  },
  quickSublabel: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    marginTop: 2,
  },

  // ── Misc (kept for RecentRow compatibility) ───────────────────────────────────
  card: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    overflow: 'hidden',
    marginBottom: 8,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.borderCard,
  },
  recentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentSign: {
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: '700',
    color: COLOR.inkPrimary,
  },
  recentTranslation: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    marginTop: 1,
  },
  recentTime: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    fontWeight: '500',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 5,
  },
  viewAllText: {
    fontFamily: FONT.sans,
    fontSize: 12,
    fontWeight: '600',
    color: COLOR.tealBright,
    letterSpacing: 0.2,
  },
});