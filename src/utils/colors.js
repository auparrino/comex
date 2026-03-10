// Fiery Ocean palette
export const PALETTE = {
  darkRed: '#780000',
  red: '#C1121F',
  cream: '#FDF0D5',
  darkBlue: '#003049',
  blue: '#669BBC',
};

// Semantic colors
export const COLORS = {
  bg: PALETTE.cream,
  bgCard: '#fff8eb',
  bgCardHover: '#f5e6c8',
  border: '#d4c4a0',
  text: PALETTE.darkBlue,
  textMuted: '#4a6a7a',
  textDim: '#7a9aaa',

  // Trade flows
  exports: '#669BBC',
  exportsLight: '#8ab4cc',
  imports: '#C1121F',
  importsLight: '#d44a54',

  // Balance
  surplus: '#669BBC',
  deficit: '#C1121F',

  // Accents
  accent: PALETTE.blue,
  accentDark: PALETTE.darkBlue,
  highlight: PALETTE.darkBlue,
  danger: PALETTE.red,
  dangerDark: PALETTE.darkRed,
};

// Chapter color scale (for product breakdown)
export const CHAPTER_COLORS = [
  '#669BBC', '#C1121F', '#FDF0D5', '#003049', '#780000',
  '#8ab4cc', '#d44a54', '#e8d8b0', '#1a4d6b', '#9a2020',
  '#4a8da8', '#a80e18', '#d4c49e', '#0d2536', '#5c0000',
  '#7cafc0', '#e63946', '#c4b48a', '#264f6d', '#b83030',
];

export function getChapterColor(index) {
  return CHAPTER_COLORS[index % CHAPTER_COLORS.length];
}

// Grandes Rubros colors
export const RUBRO_COLORS = {
  PP:  '#4a8da8',
  MOA: '#6abf69',
  MOI: '#e8a838',
  CyE: '#a05195',
  BK:  '#4a8da8',
  BI:  '#e8a838',
  CyL: '#a05195',
  PyA: '#d45087',
  BC:  '#6abf69',
  VA:  '#ff6361',
};
