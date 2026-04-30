/**
 * 📐 AceTrack Design System — Unified Token System
 * Performance & Polish (Phase 3)
 */

export const colors = {
  // 🛡️ Premium Brand Palette (v2.6.310)
  primary: {
    base: '#EF4444',    // Vibrant Red
    dark: '#DC2626',
    light: '#F87171',
    glow: 'rgba(239, 68, 68, 0.4)',
  },
  
  secondary: {
    base: '#3B82F6',    // Electric Blue
    dark: '#2563EB',
    light: '#60A5FA',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
  
  // 🌌 Deep Space Backgrounds (Slate)
  navy: {
    900: '#0F172A', // Main Background
    800: '#1E293B', // Card Background
    700: '#334155', // Sub-card / Elevated
    600: '#475569',
    500: '#64748B',
    400: '#94A3B8',
    100: '#F1F5F9',
    50: '#F8FAFC',
  },

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // ✨ Glassmorphism Architecture
  glass: {
    thin: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.1)',
    thick: 'rgba(255, 255, 255, 0.15)',
    border: 'rgba(255, 255, 255, 0.1)',
  }
};

export const typography = {
  display: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5, lineHeight: 40 },
  h1: { fontSize: 24, fontWeight: '900', letterSpacing: -0.3, lineHeight: 32 },
  h2: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2, lineHeight: 28 },
  h3: { fontSize: 16, fontWeight: '700', lineHeight: 24 },
  body: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodyBold: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 16, letterSpacing: 0.1 },
  micro: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32
};

export const borderRadius = {
  sm: 8, md: 12, lg: 20, xl: 32, full: 999
};

export const shadows = {
  red: { shadowColor: colors.primary.base, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  blue: { shadowColor: colors.secondary.base, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  glass: { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12 }
};

export default { colors, typography, spacing, borderRadius, shadows };
