// themes.js — 6 built-in themes + factory
// Each theme: 11 CSS properties applied as inline styles

export const themes = {
  light: {
    name: 'Light', isDark: false,
    cardBg: '#ffffff',
    cardBorder: 'rgba(0,0,0,0.08)',
    text: '#1d1d1f',
    secondary: '#666666',
    accent: '#007aff',
    accentText: '#ffffff',
    chipBg: 'rgba(0,122,255,0.08)',
    chipText: '#007aff',
    brand: '#999999',
    contentBg: '#ffffff',
    codeBg: 'rgba(0,0,0,0.04)',
  },
  dark: {
    name: 'Dark', isDark: true,
    cardBg: '#1c1c1e',
    cardBorder: 'rgba(255,255,255,0.1)',
    text: 'rgba(255,255,255,0.9)',
    secondary: 'rgba(255,255,255,0.55)',
    accent: '#5ac8fa',
    accentText: '#1c1c1e',
    chipBg: 'rgba(90,200,250,0.12)',
    chipText: '#5ac8fa',
    brand: 'rgba(255,255,255,0.25)',
    contentBg: 'rgba(255,255,255,0.05)',
    codeBg: 'rgba(255,255,255,0.08)',
  },
  ocean: {
    name: 'Ocean', isDark: true,
    cardBg: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
    cardBorder: 'rgba(255,255,255,0.15)',
    text: '#ffffff',
    secondary: 'rgba(255,255,255,0.7)',
    accent: '#a0d4ff',
    accentText: '#0d47a1',
    chipBg: 'rgba(255,255,255,0.15)',
    chipText: 'rgba(255,255,255,0.9)',
    brand: 'rgba(255,255,255,0.4)',
    contentBg: 'rgba(0,0,0,0.1)',
    codeBg: 'rgba(255,255,255,0.1)',
  },
  aurora: {
    name: 'Aurora', isDark: false,
    cardBg: 'radial-gradient(138% 32% at 70% 33%, #fff 2%, rgba(255,160,247,0.3) 50%, rgba(212,245,255,0.5)), #fff',
    cardBorder: 'rgba(0,0,0,0.06)',
    text: '#1d1d1f',
    secondary: '#666666',
    accent: '#007aff',
    accentText: '#ffffff',
    chipBg: 'rgba(0,122,255,0.08)',
    chipText: '#007aff',
    brand: '#999999',
    contentBg: 'transparent',
    codeBg: 'rgba(0,0,0,0.04)',
  },
  neon: {
    name: 'Neon', isDark: true,
    cardBg: 'linear-gradient(145deg, #0a0a0a 0%, #1a0a2e 100%)',
    cardBorder: 'rgba(0,255,136,0.5)',
    cardShadow: '0 0 20px rgba(0,255,136,0.3), inset 0 0 20px rgba(0,255,136,0.05)',
    text: '#ffffff',
    secondary: 'rgba(255,255,255,0.7)',
    accent: '#00ff88',
    accentText: '#0d0d0d',
    chipBg: 'rgba(0,255,136,0.15)',
    chipText: '#00ff88',
    brand: 'rgba(0,255,136,0.6)',
    contentBg: 'rgba(0,255,136,0.05)',
    codeBg: 'rgba(0,255,136,0.1)',
  },
  academic: {
    name: 'Academic', isDark: false,
    cardBg: '#f5f0e8',
    cardBorder: 'rgba(139,90,43,0.25)',
    text: '#2c1810',
    secondary: '#6b5744',
    accent: '#8b5a2b',
    accentText: '#ffffff',
    chipBg: 'rgba(139,90,43,0.08)',
    chipText: '#8b5a2b',
    brand: '#a08060',
    contentBg: 'rgba(255,255,255,0.8)',
    codeBg: 'rgba(139,90,43,0.04)',
  },
};

export function createTheme(overrides) {
  return { ...themes.light, ...overrides };
}

export function resolveTheme(input) {
  if (typeof input === 'string') return themes[input] || themes.light;
  if (typeof input === 'object' && input !== null) return { ...themes.light, ...input };
  return themes.light;
}
