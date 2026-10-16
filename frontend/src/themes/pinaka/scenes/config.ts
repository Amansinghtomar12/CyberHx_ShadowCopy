/**
 * Ramayana Battle Scenes — the Free-challenge half of the Pinaka event.
 *
 * A Free challenge stays free: nothing here gates, orders, scores or hides
 * anything. A scene only dresses the dialog a player opens — background,
 * a line of story, and the wording on the submit button. A challenge with
 * no scene mapped keeps the platform's ordinary look, which is why every
 * lookup here returns `null` rather than a default scene.
 *
 * The organisers choose a scene per challenge in the admin panel; the
 * mapping lives in `pinaka_challenge_scene` (one row per challenge, no
 * change to the challenges table itself), so dropping that table removes
 * the whole feature.
 *
 * Intro lines and button labels are the organisers' own words, reproduced
 * exactly as supplied.
 */
import { type SceneId } from '../assets/scenes';

export type { SceneId };

export interface Scene {
  readonly id: SceneId;
  /** How the scene is named in the admin dropdown and on the card label. */
  readonly label: string;
  /** The story panel on the challenge dialog. One or two sentences. */
  readonly intro: string;
  /** Replaces the ordinary submit wording when this scene is mapped. */
  readonly buttonLabel: string;
  /**
   * The call to arms on the closed card — what a player clicks to enter
   * the arena. Shorter and more declarative than `buttonLabel`, which sits
   * on the flag field once they are already inside.
   */
  readonly enterLabel: string;
  /**
   * The scene's own signature colour, measured from its artwork (the most
   * saturated populated hue, lifted into a band that reads on dark glass)
   * rather than picked by eye. Drives the card's thin glowing border.
   */
  readonly accent: string;
}

/**
 * Declaration order is the order of the admin dropdown, which follows the
 * story rather than the alphabet.
 */
export const SCENES: Readonly<Record<SceneId, Scene>> = {
  'golden-deer': {
    id: 'golden-deer',
    label: 'Golden Deer',
    intro: 'A golden trail appears too perfect to be real. What shines may only be bait.',
    buttonLabel: 'Track the Golden Deer',
    enterLabel: 'Give Chase',
    accent: '#dfa049',
  },
  'jatayus-last-stand': {
    id: 'jatayus-last-stand',
    label: "Jatayu's Last Stand",
    intro: 'A broken witness leaves one final sign. Recover the truth from what remains.',
    buttonLabel: "Recover Jatayu's Message",
    enterLabel: 'Honour the Fallen',
    accent: '#d27837',
  },
  'shabaris-offering': {
    id: 'shabaris-offering',
    label: "Shabari's Offering",
    intro: 'Every piece is chosen with care. The answer is hidden among what seems ordinary.',
    buttonLabel: 'Accept the Offering',
    enterLabel: 'Receive the Gift',
    accent: '#ce793b',
  },
  'hanumans-leap': {
    id: 'hanumans-leap',
    label: "Hanuman's Leap",
    intro: 'The distance is impossible only until the right path is found.',
    buttonLabel: 'Begin the Leap',
    enterLabel: 'Take the Leap',
    accent: '#eda762',
  },
  'ashoka-vatika': {
    id: 'ashoka-vatika',
    label: 'Ashoka Vatika',
    intro: 'Inside the guarded garden, a message waits where only the patient will look.',
    buttonLabel: 'Search Ashoka Vatika',
    enterLabel: 'Enter the Garden',
    accent: '#407ac9',
  },
  'lanka-dahan': {
    id: 'lanka-dahan',
    label: 'Lanka Dahan',
    intro: 'One spark is enough when the city is built on weak defenses.',
    buttonLabel: 'Ignite the Breach',
    enterLabel: 'Set the Spark',
    accent: '#e96320',
  },
  'sanjeevani-hunt': {
    id: 'sanjeevani-hunt',
    label: 'Sanjeevani Hunt',
    intro: 'The system is wounded. Find what restores life before the window closes.',
    buttonLabel: 'Hunt Sanjeevani',
    enterLabel: 'Race the Dawn',
    accent: '#467cc3',
  },
  'setu-stones': {
    id: 'setu-stones',
    label: 'Setu Stones',
    intro: 'One stone means little. A chain of stones becomes a path.',
    buttonLabel: 'Build the Setu',
    enterLabel: 'Lay the First Stone',
    accent: '#e9a663',
  },
  'meghnads-trap': {
    id: 'meghnads-trap',
    label: "Meghnad's Trap",
    intro: 'The trap is not where it appears. Break the illusion before it binds you.',
    buttonLabel: "Break Meghnad's Trap",
    enterLabel: 'Break the Illusion',
    accent: '#d13844',
  },
  'kumbhakarna-awakens': {
    id: 'kumbhakarna-awakens',
    label: 'Kumbhakarna Awakens',
    intro: 'Something huge sleeps beneath the surface. Wake it carefully, or be crushed by it.',
    buttonLabel: 'Wake the Giant',
    enterLabel: 'Rouse the Giant',
    accent: '#d5784b',
  },
  'angadas-embassy': {
    id: 'angadas-embassy',
    label: "Angada's Embassy",
    intro: 'Stand firm in the court of pressure. Not every challenge is won by force.',
    buttonLabel: 'Enter the Court',
    enterLabel: 'Hold the Court',
    accent: '#d78332',
  },
  'ravanas-ten-heads': {
    id: 'ravanas-ten-heads',
    label: "Ravana's Ten Heads",
    intro: 'Every head hides a different defense. Defeat them one by one.',
    buttonLabel: 'Face the Ten Heads',
    enterLabel: 'Win the War',
    accent: '#e16529',
  },
};

/** Story order, for the admin dropdown and the preview screen. */
export const SCENE_ORDER: readonly SceneId[] = Object.keys(SCENES) as SceneId[];

/** True for a string that actually names a scene, so bad data falls back. */
export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCENES, v);
}

/**
 * The scene for a challenge, or `null` for "no scene" — an unmapped
 * challenge, an unknown id left behind by an edit, or the theme being off.
 * Callers render the ordinary platform UI on `null`.
 */
export function sceneOf(id: string | null | undefined): Scene | null {
  return isSceneId(id) ? SCENES[id] : null;
}
