// CBRE 2026 palette, applied lightly: the lab itself stays bright and neutral,
// brand colour appears only on boards, panel trim and interactive highlights.
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interMedium from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import interSemibold from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import spaceMono from '@fontsource/space-mono/files/space-mono-latin-400-normal.woff?url';
import kalam from '@fontsource/kalam/files/kalam-latin-400-normal.woff?url';
import kalamBold from '@fontsource/kalam/files/kalam-latin-700-normal.woff?url';

export const BRAND = {
  cbreGreen: 0x003f2d,
  accentGreen: 0x17e88f, // sparingly: hover, active, success
  darkGreen: 0x012a2d,
  darkGrey: 0x435254, // body copy
  lightGrey: 0xcad1d3,
  midnight: 0x032842,
  sage: 0x538184,
  celadon: 0x80bbad,
  celadonTint: 0xc0d4cb,
  wheat: 0xdbd99a,
  cement: 0x7f8480,
  cementTint: 0xcbcdcb,
  white: 0xffffff,
} as const;

// Industrial signalling colours (not brand colours): beacon, faults, E-stop.
export const SIGNAL = {
  run: 0x2fbf5b,
  manual: 0xf2a516,
  fault: 0xd8342c,
  estop: 0xc8201a,
  safetyYellow: 0xf2c200,
} as const;

// Calibre / Financier Display are licensed desktop fonts; Inter stands in for
// Calibre and Space Mono is a native CBRE face. Swap URLs here if web-licensed
// brand font files become available.
export const FONTS = {
  body: interRegular,
  medium: interMedium,
  semibold: interSemibold,
  mono: spaceMono,
  marker: kalam,
  markerBold: kalamBold,
} as const;

export const TEAM_NAME = 'Scientific Solutions';
