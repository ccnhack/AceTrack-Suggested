/**
 * 📐 AceTrack Design System — Typography Scale
 * UX Fix: Consistent typography hierarchy across all screens
 */

export const typography = {
  // Display — for hero sections, splash
  display: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  
  // H1 — Screen titles
  h1: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  
  // H2 — Section headers
  h2: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  
  // H3 — Card titles
  h3: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  
  // Body — Main content
  body: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  
  // Body Bold
  bodyBold: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  
  // Caption — Secondary text
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  
  // Micro — Badges, timestamps
  micro: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  
  // Button
  button: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  
  // Score display
  score: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 36,
  },
};

export const colors = {
  // Primary
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#60A5FA',
  
  // Background
  bgPrimary: '#0F172A',
  bgSecondary: '#1E293B',
  bgTertiary: '#334155',
  bgCard: '#1E293B',
  
  // Text
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  textPlaceholder: '#475569',
  
  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  
  // Sport colors
  badminton: '#8B5CF6',
  tabletennis: '#EC4899',
  cricket: '#F59E0B',
  
  // Border
  border: '#334155',
  borderLight: '#1E293B',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 999,
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  }
};

export default { typography, colors, spacing, borderRadius, shadows };
