// TranslatorScreenStyle.js

import { StyleSheet, Platform } from 'react-native';
import { COLOR, FONT, RADIUS, WINDOW_WIDTH as W } from './theme'; 

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR.bgPage,
  },

  // ── Permission / empty states ─────────────────────────────────────────────
  centeredFill: {
    flex: 1,
    backgroundColor: COLOR.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: FONT.serif,
    fontSize: 20,
    color: COLOR.inkPrimary,
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: FONT.sans,
    fontSize: 14,
    color: COLOR.inkFaint,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: COLOR.tealDeep,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute',
    top: -W * 0.2,
    right: -W * 0.15,
    width: W * 0.55,
    height: W * 0.55,
    borderRadius: W * 0.275,
    backgroundColor: 'rgba(10,155,170,0.13)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerEyebrow: {
    fontFamily: FONT.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  headerTitle: {
    fontFamily: FONT.serif,
    fontSize: 26,
    color: COLOR.white,
    letterSpacing: -0.4,
    marginTop: 2,
  },

  // ── Live badge ────────────────────────────────────────────────────────────
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    marginTop: 4,
  },
  liveBadgeActive: {
    backgroundColor: COLOR.greenSurface,
    borderColor: COLOR.greenBorder,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  liveDotActive: {
    backgroundColor: '#22C55E',
  },
  liveText: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.70)',
    letterSpacing: 0.8,
  },
  liveTextActive: {
    color: COLOR.green,
  },

  // ── Scroll content ────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 14,
  },

  // ── Banner ────────────────────────────────────────────────────────────────
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(217,119,6,0.08)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.20)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerCardError: {
    backgroundColor: COLOR.redSurface,
    borderColor: COLOR.redBorder,
  },
  bannerText: {
    fontFamily: FONT.sans,
    fontSize: 13,
    fontWeight: '600',
    color: COLOR.amber,
  },
  bannerTextError: {
    color: COLOR.red,
  },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    overflow: 'hidden',
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardMedical: {
    borderColor: 'rgba(217,119,6,0.30)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: FONT.serif,
    fontSize: 16,
    color: COLOR.inkPrimary,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    marginTop: 1,
  },

  // ── Viewfinder ────────────────────────────────────────────────────────────
  viewfinderWrap: {
    height: 260,
    backgroundColor: '#0D2B2E',
    overflow: 'hidden',
    marginHorizontal: 0,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: COLOR.tealLight,
    borderWidth: 2,
  },
  cornerTL: {
    top: 14, left: 14,
    borderRightWidth: 0, borderBottomWidth: 0,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 14, right: 14,
    borderLeftWidth: 0, borderBottomWidth: 0,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 14, left: 14,
    borderRightWidth: 0, borderTopWidth: 0,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 14, right: 14,
    borderLeftWidth: 0, borderTopWidth: 0,
    borderBottomRightRadius: 4,
  },

  // ── Prediction card ───────────────────────────────────────────────────────
  sectionLabel: {
    fontFamily: FONT.sans,
    fontSize: 9,
    fontWeight: '700',
    color: COLOR.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionLabelSpaced: {
    fontFamily: FONT.sans,
    fontSize: 9,
    fontWeight: '700',
    color: COLOR.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  predictionLabel: {
    fontFamily: FONT.serif,
    fontSize: 40,
    color: COLOR.inkPrimary,
    letterSpacing: -0.5,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  predictionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  predictionConf: {
    fontFamily: FONT.sans,
    fontSize: 13,
    color: COLOR.inkFaint,
  },
  medicalTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLOR.amberSurface,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  medicalTagText: {
    fontFamily: FONT.sans,
    fontSize: 11,
    fontWeight: '600',
    color: COLOR.amber,
  },

  // ── Output placeholder ────────────────────────────────────────────────────
  outputBox: {
    backgroundColor: COLOR.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLOR.borderCard,
    paddingBottom: 16,
    minHeight: 80,
    shadowColor: COLOR.tealDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  outputTextMuted: {
    fontFamily: FONT.sans,
    fontSize: 14,
    color: COLOR.inkFaint,
    fontStyle: 'italic',
    paddingHorizontal: 16,
    marginTop: 4,
  },

  // ── History rows ──────────────────────────────────────────────────────────
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLOR.borderCard,
  },
  historyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.tealGlow,
    borderWidth: 1,
    borderColor: 'rgba(10,155,170,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconMedical: {
    backgroundColor: COLOR.amberSurface,
    borderColor: 'rgba(217,119,6,0.20)',
  },
  historySign: {
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: '700',
    color: COLOR.inkPrimary,
  },
  historyMedicalLabel: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.amber,
    marginTop: 1,
  },
  historyTime: {
    fontFamily: FONT.sans,
    fontSize: 11,
    color: COLOR.inkFaint,
    fontWeight: '500',
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.tealLight,
    borderRadius: RADIUS.md,
    height: 52,
    gap: 10,
    marginTop: 4,
  },
  primaryBtnText: {
    fontFamily: FONT.sans,
    fontSize: 15,
    fontWeight: '700',
    color: COLOR.tealDeep,
    letterSpacing: 0.2,
  },
  stopBtn: {
    backgroundColor: COLOR.redSurface,
    borderWidth: 1.5,
    borderColor: COLOR.redBorder,
  },
  stopBtnText: {
    color: COLOR.red,
  },
});