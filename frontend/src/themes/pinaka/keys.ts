/**
 * The theme's storage keys, on their own so the one file the main bundle
 * needs before the skin loads (intro-gate.ts) does not drag config.ts — event
 * copy, partners, worlds — into the default build.
 */
export const PINAKA_STORAGE_KEYS = {
  introSeen: 'cyberhx.pinaka.intro.v1',
  journeyCollapsed: 'cyberhx.pinaka.journey.collapsed',
} as const;
