/**
 * 📐 AceTrack Design System — Unified Token System
 * Performance & Polish (Phase 3)
 */

export const colors = {
  // Brand HSL tokens (Hue, Saturation, Lightness)
  // Base HSL allows for programmatic derivations (hover, active, opacity)
  primary: {
    base: 'hsl(217, 91%, 60%)', // #3B82F6
    dark: 'hsl(221, 83%, 53%)',  // #2563EB
    light: 'hsl(213, 94%, 68%)', // #60A5FA
  },
  
  // Neutral HSL (Slate)
  navy: {
    900: 'hsl(222, 47%, 11%)', // #0F172A
    800: 'hsl(217, 33%, 17%)', // #1E293B
    700: 'hsl(215, 25%, 27%)', // #334155
    600: 'hsl(215, 19%, 35%)', // #475569
    500: 'hsl(215, 16%, 47%)', // #64748B
    400: 'hsl(215, 20%, 65%)', // #94A3B8
    100: 'hsl(210, 40%, 96%)', // #F1F5F9
    50: 'hsl(210, 40%, 98%)',  // #F8FAFC
  },

  // Status
  success: 'hsl(160, 84%, 39%)', // #10B981
  warning: 'hsl(38, 92%, 50%)',  // #F59E0B
  error: 'hsl(0, 84%, 60%)',     // #EF4444
  info: 'hsl(217, 91%, 60%)',

  // Glassmorphism helpers
  glass: 'rgba(255, 255, 255, 0.1)',
  glassDark: 'rgba(0, 0, 0, 0.2)',
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
  sm: 6, md: 12, lg: 16, xl: 24, full: 999
};

export const shadows = {
  sm: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  md: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  lg: { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 }
};

export default { colors, typography, spacing, borderRadius, shadows };
