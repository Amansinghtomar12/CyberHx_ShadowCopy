/**
 * Pinaka boot — everything the skin needs in place before React paints.
 *
 * Loaded on demand from themes/index.ts, so a default build never fetches
 * the Pinaka stylesheet, fonts or this file.
 */
import { PINAKA_FONTS_HREF, PINAKA_THEME_COLOR } from './config';
import { overrideCategoryIcons } from '../index';

export async function bootPinaka(): Promise<void> {
  // Vite turns this into its own CSS chunk and resolves once the <link> has
  // loaded, so the first paint already wears the theme.
  await import('./pinaka.css');

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
  // renders; the motif chunk (solve light, countdown) is warmed so its first
  // use is not a frame late. Neither is fatal if it fails.
  const [glyphs] = await Promise.all([
    import('./components/CategoryGlyph').catch(() => null),
    import('./components/BowMotifs').catch(() => null),
  ]);
  if (glyphs) overrideCategoryIcons(glyphs.PINAKA_CATEGORY_ICON);
}
