/**
 * Pinaka boot — everything the skin needs in place before React paints.
 *
 * Loaded on demand from themes/index.ts, so a default build never fetches
 * the Pinaka stylesheet, fonts or this file.
 */
import { PINAKA_FONTS_HREF, PINAKA_THEME_COLOR, WORLDS, type World } from './config';
import { overrideCategoryIcons } from '../index';
import { PLATES } from './assets/plates';
import { preloadPlate } from './assets/plates/sources';

/**
 * The world behind the first themed screen. When the skin is re-applied live
 * (an admin switches it on, a player picks it in Settings) the environment
 * may already have published one on <html>; otherwise it is Ayodhya: the
 * sign-in page, the profile, the team, Settings and the admin panel all live
 * there, and it is the only world a visitor who is not signed in can see.
 * The board's own world depends on the event status the app has yet to
 * fetch, so its plate is requested by the environment's eager <img> in the
 * first commit instead; only ever one plate is preloaded here, never six.
 */
function firstWorld(): World {
  const w = document.documentElement.dataset.world;
  return w && Object.prototype.hasOwnProperty.call(WORLDS, w) ? (w as World) : 'ayodhya';
}

export async function bootPinaka(): Promise<void> {
  // The photographic plate is asked for first, at the width this device will
  // use, so it is decoded by the time the environment mounts under the UI.
  preloadPlate(PLATES[firstWorld()]);

  // Vite turns the stylesheet into its own CSS chunk and resolves once the
  // <link> has loaded, so the first paint already wears the theme. The glyph
  // and motif chunks are fetched in the same round trip rather than after it.
  // The environment, the campaign map and the podium frame ride along too:
  // every themed screen mounts one of them first, and arriving with the CSS
  // means the scene fades in with the page instead of popping in a round
  // trip later. None is fatal if it fails to arrive.
  const [, glyphs] = await Promise.all([
    import('./pinaka.css'),
    import('./components/CategoryGlyph').catch(() => null),
    import('./components/BowMotifs').catch(() => null),
    import('./components/PinakaEnvironment').catch(() => null),
    import('./components/JourneyMap').catch(() => null),
    import('./components/PodiumFrame').catch(() => null),
  ]);

  // Display faces, swapped in when they arrive. Both hosts are already in the
  // CSP (style-src fonts.googleapis.com, font-src fonts.gstatic.com); Inter and
  // JetBrains Mono load the same way from index.css.
  if (!document.getElementById('pinaka-fonts')) {
    const link = document.createElement('link');
    link.id = 'pinaka-fonts';
    link.rel = 'stylesheet';
    link.href = PINAKA_FONTS_HREF;
    document.head.appendChild(link);
  }

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = PINAKA_THEME_COLOR;

  // The category glyphs replace the Lucide icons in the board's map before it
  // renders; the motif chunk (solve light, countdown) was warmed above so its
  // first use is not a frame late. Neither is fatal if it fails to arrive.
  if (glyphs) overrideCategoryIcons(glyphs.PINAKA_CATEGORY_ICON);
}
