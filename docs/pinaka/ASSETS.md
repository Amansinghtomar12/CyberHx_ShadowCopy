# Pinaka theme — asset inventory

Every visual in the theme is either generated code (inline SVG / Canvas 2D) or
a font from a host the Content-Security-Policy already allows. No raster
images, no video, no third-party scripts were added. The repository's
`vercel.json` CSP is unchanged.

## Fonts

| Asset | Origin | Licence | Loaded by | Fallback |
|---|---|---|---|---|
| Cinzel 500 / 600 / 700 | Google Fonts (`fonts.googleapis.com` → `fonts.gstatic.com`) | SIL Open Font License 1.1 | `src/themes/pinaka/boot.ts` injects one `<link rel="stylesheet">` only when the theme is active (`display=swap`) | "Trajan Pro", Georgia, "Times New Roman", serif |
| EB Garamond 400 / 500 / 600, 400 italic | Google Fonts | SIL OFL 1.1 | same link | Georgia, "Times New Roman", serif |
| Inter, JetBrains Mono | unchanged (index.css) | SIL OFL 1.1 | unchanged | unchanged |

Devanagari glyphs (पिनाक, ०–९) are rendered by the system's Devanagari fallback
font (Noto Sans Devanagari / Mangal / Kohinoor depending on OS); Cinzel has no
Devanagari range, so the lockup declares a generic serif fallback. Spelling of
पिनाक verified (पि-ना-क).

## Generated artwork (no files)

| Artwork | Where | Technique | Original? |
|---|---|---|---|
| Five world environments (Ayodhya skyline, Vanavasa canopy, Setu causeway, Lanka fortress, Vijaya) | `components/PinakaEnvironment.tsx` | seeded procedural silhouettes drawn to Canvas 2D (static SVG polygons on the low/still tiers), gradient sky, particle canvas | yes — procedural, no reference images used |
| Bow mark, bow loader, bowstring countdown, solve light trace | `components/BowMotifs.tsx` | inline SVG + CSS keyframes | yes |
| Ten category glyphs | `components/CategoryGlyph.tsx` | inline SVG, 24×24, stroke 1.5 | yes |
| Intro skyline and bow trace | `components/PinakaIntro.tsx` | inline SVG + motion | yes |
| Journey path, chapter nodes | `components/JourneyMap.tsx` | inline SVG | yes |
| Setu stones, threads, water | `components/SetuChain.tsx` + `styles/setu.css` | inline SVG + CSS gradients | yes |
| Pillars and arch on the sign-in page | `components/AuthGateway.tsx` | inline SVG | yes |
| Podium ornaments | `components/PodiumFrame.tsx` | inline SVG | yes |
| Gold reticle cursor | `styles/core.css` | SVG data URI (recolour of the platform's own cursor) | derived from platform asset |

Nothing from pinakactf.com (illustrations, the wheel emblem, the nav
flourishes, the logo) was copied or traced. The site was used only as a
reference for palette, typography and narrative structure.

## Partner recognition

Partner **names** come from `src/themes/pinaka/config.ts#PINAKA_PARTNERS`
(as published on pinakactf.com, October 2026). **No partner or organiser logos
are bundled**: usage rights for the NFSU emblem and sponsor marks were not
confirmed for this repository. To add them once approved, place the files
under `src/themes/pinaka/assets/partners/`, import them in `config.ts` and set
`logo` on the partner entry; `PartnerStrip` renders an `<img alt=name>` when a
logo is present and a name mark otherwise. Keep each logo ≤ 20 KB (SVG or
WebP) and under the existing `img-src 'self' https: data:` CSP.

## Existing assets left untouched

`src/assets/chain/chain-strip.png` (167 KB) and `fire.gif` (3.6 MB) are the
classic chained-board visuals. They are not loaded under the theme (the Setu
view replaces the renderer, not the data) and remain for the default theme.

## Size budget (measured after build — see TEST_RESULTS.md)

Target: the default theme's main chunk is unchanged within ±1 KB gzip; the
Pinaka CSS chunk ≤ 30 KB gzip; each lazy component chunk ≤ 25 KB gzip; no
new request on the default theme.
