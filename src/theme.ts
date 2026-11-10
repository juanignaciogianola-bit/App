export const colors = {
  bg: '#0B0B0F',
  surface: '#16161D',
  surfaceHigh: '#1F1F28',
  border: '#2A2A35',
  text: '#F4F4F6',
  textMuted: '#8E8E9A',
  textFaint: '#5C5C68',
  accent: '#C6F432', // lime
  accentText: '#0B0B0F',
  danger: '#FF5C5C',
  protein: '#5CC8FF',
  carbs: '#FFB547',
  fat: '#FF7AB6',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const font = {
  h1: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  small: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
} as const;
