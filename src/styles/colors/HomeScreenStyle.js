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
  // (teal + a warm amber accent) plus a faint dot grid threaded through the
  // middle of the page. Everything sits well under ~7% opacity so it reads as
  // paper texture, never competing with card content or text.
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
    backgroundColor: 'rgba(52, 233, 253, 0.06)',
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

  // ── Hero card (Translator / Motion / Learn / Dictionary) ────────────────────
  // Deliberately a darker, denser teal than the header (#0D2B2E vs tealDeep)
  // with a glow, graph-paper grid and faint watermark, so it reads as its own
  // surface rather than a continuation of the header band above it.
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
  translatorGlowBottom: {
    position: 'absolute',
    bottom: -70,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(126,221,227,0.16)',
  },
  // Graph-paper style grid — hairline and low-opacity so it reads as a
  // surface material, not as content competing with the text.
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
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Sized to fit comfortably inside the 44×44 icon wrapper.
  translatorCustomIcon: {
    width: 30,
    height: 30,
    tintColor: '#ffffff',
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

  // ── Spacing between stacked hero cards ──────────────────────────────────────
  heroGap: {
    marginBottom: 16,
  },

  // ── Misc (kept for RecentRow compatibility) ───────────────────────────────────
  // Not used by HomeScreen. Delete this block if RecentRow no longer exists.
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