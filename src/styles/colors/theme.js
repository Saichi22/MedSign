// src/theme/designTokens.js
import { Platform, Dimensions } from 'react-native';

const { width: W } = Dimensions.get('window');

export const COLOR = {
  tealDeep: '#0D3D40',
  tealMid: '#0A5C62',
  tealBright: '#0A9BAA',
  tealLight: '#7EDDE3',
  tealGlow: 'rgba(10,155,170,0.10)',
  inkPrimary: '#1A2E35',
  inkMuted: '#4A6E72',
  inkFaint: '#8AACAF',
  bgPage: '#F0F5F5',
  bgCard: '#FFFFFF',
  borderCard: '#E2EDED',
  borderIdle: '#D0E2E3',
  white: '#FFFFFF',
  red: '#ff0000',
  amber: '#ffbf00',
};

export const FONT = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
};

export const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28, pill: 100 };
export const WINDOW_WIDTH = W;