/**
 * Pinaka CTF — the six chapters of the journey.
 *
 * WHAT THIS IS
 *   One record per chapter: its art, its colour mood, the ambience that
 *   drifts over it, the line it shows while a team is inside it, and the
 *   sentence shown when the team completes it. Everything the skin needs to
 *   change character is here; nothing else in the theme hard-codes a chapter.
 *
 * WHAT IT IS NOT
 *   A source of truth about progress. Which chapter a team is in is derived
 *   from the solves the platform already holds (progress.ts) — this file
 *   never decides, stores or reports anything about a team.
 *
 * ART
 *   The art itself lives in assets/chapters and is registered in the plate
 *   manifest under `chapter-<id>`, so the environment paints it exactly as it
 *   paints a world. The backgrounds are the organisers' own artwork:
 *   places and objects only — a city on its river, the bow on its pedestal,
 *   a forest, a valley, the causeway, the fortress. No deity is depicted.
 *
 * COLOUR
 *   `accents` are consumed as custom properties by styles/chapters.css. They
 *   tint glows, hairlines, card rims and buttons. Body text keeps the
 *   theme's parchment and secondary colours so contrast never depends on
 *   which chapter a team happens to be in.
 */
export type ChapterId = 'ayodhya' | 'mithila' | 'vanvaas' | 'kishkindha' | 'setu' | 'lanka';

/** The order of the journey. Index 0 is where every team starts. */
export const CHAPTER_ORDER: readonly ChapterId[] = [
  'ayodhya', 'mithila', 'vanvaas', 'kishkindha', 'setu', 'lanka',
];

/** The ambience that drifts over a chapter. Drawn by the environment canvas. */
export type Ambience = 'dust' | 'sparks' | 'fireflies' | 'clouds' | 'mist' | 'embers';

export interface ChapterAccents {
  /** The chapter's light: glows, the lit rail, the current step of the bar. */
  glow: string;
  /** A paler cast of it, for small marks and hover text. */
  soft: string;
  /** A deep cast, for labels and resting rims. */
  deep: string;
  /** A hairline at low alpha. */
  line: string;
  /** A wash at very low alpha, for card tints. */
  wash: string;
  /** The sky behind the art, top and bottom, while its plate loads. */
  skyTop: string;
  skyBottom: string;
}

export interface Chapter {
  id: ChapterId;
  /** 1-based position in the journey. */
  index: number;
  /** The place. */
  title: string;
  /** What happens there. */
  subtitle: string;
  /** One line, shown while a team is inside this chapter. */
  line: string;
  /**
   * Shown when the team completes this chapter, as the next one opens. The
   * organisers' words; do not paraphrase them in the UI.
   */
  completedMessage: string;
  ambience: Ambience;
  accents: ChapterAccents;
  /**
   * How this chapter is recognised in the platform's own data (progress.ts).
   * `gate` is the challenge that closes the chapter: solving it completes
   * the chapter and opens the next. `aliases` match a chain series' title.
   * Both are matched loosely (case and punctuation are ignored), so the
   * organisers can name things naturally.
   */
  match: { gate: string; aliases: readonly string[] };
}

export const CHAPTERS: Record<ChapterId, Chapter> = {
  ayodhya: {
    id: 'ayodhya',
    index: 1,
    title: 'Ayodhya',
    subtitle: 'The Beginning',
    line: 'The hall is open. Take your place and learn the discipline.',
    completedMessage: 'You have proven your discipline. The journey now moves beyond the palace walls.',
    ambience: 'dust',
    accents: {
      glow: '#f2b24c', soft: '#ffd79a', deep: '#b07c28',
      line: 'rgba(242, 178, 76, 0.30)', wash: 'rgba(242, 178, 76, 0.07)',
      skyTop: '#0a0e17', skyBottom: '#241c17',
    },
    match: { gate: 'ayodhya_gate', aliases: ['ayodhya', 'chapter 1', 'chapter one'] },
  },
  mithila: {
    id: 'mithila',
    index: 2,
    title: 'Mithila',
    subtitle: 'The Trial of Pinaka',
    line: 'The bow rests on its pedestal. Only a steady hand lifts it.',
    completedMessage: 'Pinaka has fallen silent. A new destiny begins.',
    ambience: 'sparks',
    accents: {
      glow: '#d8a44f', soft: '#f3d492', deep: '#8d4a3c',
      line: 'rgba(216, 164, 79, 0.30)', wash: 'rgba(139, 107, 209, 0.07)',
      skyTop: '#0c0a16', skyBottom: '#2a1a2a',
    },
    match: { gate: 'mithila_gate', aliases: ['mithila', 'pinaka trial', 'chapter 2', 'chapter two'] },
  },
  vanvaas: {
    id: 'vanvaas',
    index: 3,
    title: 'Vanvaas',
    subtitle: 'Into the Forest',
    line: 'The path is hidden. What is buried here was buried on purpose.',
    completedMessage: 'The forest has tested your patience. The trail now points toward an alliance.',
    ambience: 'fireflies',
    accents: {
      glow: '#49b596', soft: '#c2e8d9', deep: '#1f6b50',
      line: 'rgba(73, 181, 150, 0.30)', wash: 'rgba(47, 161, 140, 0.07)',
      skyTop: '#070d12', skyBottom: '#10241f',
    },
    match: { gate: 'vanvaas_gate', aliases: ['vanvaas', 'vanavasa', 'forest', 'chapter 3', 'chapter three'] },
  },
  kishkindha: {
    id: 'kishkindha',
    index: 4,
    title: 'Kishkindha',
    subtitle: 'Alliance & Recon',
    line: 'Hold the high ground. Everything you need is already in the open.',
    completedMessage: 'The alliance is formed. The path now turns toward the sea.',
    ambience: 'clouds',
    accents: {
      glow: '#e0a85e', soft: '#f3dcb4', deep: '#6f8f5a',
      line: 'rgba(224, 168, 94, 0.30)', wash: 'rgba(127, 180, 217, 0.07)',
      skyTop: '#0a0f16', skyBottom: '#1f2a2a',
    },
    match: { gate: 'kishkindha_gate', aliases: ['kishkindha', 'recon', 'chapter 4', 'chapter four'] },
  },
  setu: {
    id: 'setu',
    index: 5,
    title: 'Setu Bandhan',
    subtitle: 'The Bridge to Lanka',
    line: 'One stone at a time. Every step has to hold the next.',
    completedMessage: 'The bridge is complete. Lanka stands ahead.',
    ambience: 'mist',
    accents: {
      glow: '#4fb6d6', soft: '#d2ecf5', deep: '#1f6184',
      line: 'rgba(79, 182, 214, 0.30)', wash: 'rgba(240, 194, 74, 0.07)',
      skyTop: '#080f1c', skyBottom: '#0f2a3e',
    },
    match: { gate: 'setu_gate', aliases: ['setu', 'setu bandhan', 'bridge', 'chapter 5', 'chapter five'] },
  },
  lanka: {
    id: 'lanka',
    index: 6,
    title: 'Lanka',
    subtitle: 'The Final War',
    line: 'The gate burns ahead. Nothing here yields on the first attempt.',
    completedMessage: 'Dharma is restored. The journey is complete.',
    ambience: 'embers',
    accents: {
      glow: '#e2552f', soft: '#ffb07a', deep: '#8e1e25',
      line: 'rgba(226, 85, 47, 0.32)', wash: 'rgba(232, 163, 60, 0.07)',
      skyTop: '#0b0709', skyBottom: '#2b0f10',
    },
    match: { gate: 'final_dharma', aliases: ['lanka', 'final war', 'chapter 6', 'chapter six'] },
  },
};

/** The chapters in journey order. */
export const CHAPTER_LIST: readonly Chapter[] = CHAPTER_ORDER.map(id => CHAPTERS[id]);

/** The first chapter: where a team stands before it has solved anything. */
export const FIRST_CHAPTER: ChapterId = CHAPTER_ORDER[0];

export function isChapterId(v: unknown): v is ChapterId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CHAPTERS, v);
}
