# Pinaka theme — asset inventory

Every visual in the theme is generated code (inline SVG / Canvas 2D), a font
from a host the Content-Security-Policy already allows, official event
artwork supplied by the organisers from pinakactf.com (`assets/images`,
`assets/sponsors`, `assets/institutional`, and the two art plates), or one of
the licensed photographs listed under *World plates* below. All of them are
same-origin WebP/SVG files bundled by Vite and loaded only under the theme.
No video, no third-party scripts were added. The repository's `vercel.json`
CSP is unchanged.

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
| World environment light and fallback (god rays, sun bloom, motes and embers; the procedural Ayodhya skyline, Vanavasa canopy, Setu causeway and Lanka fortress shown only when a plate fails to load) | `components/PinakaEnvironment.tsx` + `styles/environment.css` | CSS conic/radial gradients (rays, bloom), particle canvas, seeded procedural silhouettes drawn to Canvas 2D (static SVG polygons on the low/still tiers) | yes — procedural, no reference images used |
| Bow mark, bow loader, bowstring countdown, solve light trace | `components/BowMotifs.tsx` | inline SVG + CSS keyframes | yes |
| Ten category glyphs | `components/CategoryGlyph.tsx` | inline SVG, 24×24, stroke 1.5 | yes |
| Intro skyline and bow trace | `components/PinakaIntro.tsx` | inline SVG + motion | yes |
| Journey path, chapter nodes | `components/JourneyMap.tsx` | inline SVG | yes |
| Setu stones, threads, water | `components/SetuChain.tsx` + `styles/setu.css` | inline SVG + CSS gradients | yes |
| Pillars and arch on the sign-in page | `components/AuthGateway.tsx` | inline SVG | yes |
| Podium ornaments | `components/PodiumFrame.tsx` | inline SVG | yes |
| Gold reticle cursor | `styles/core.css` | SVG data URI (recolour of the platform's own cursor) | derived from platform asset |

The official artwork (the duel and archer illustrations, the dharma wheel
emblem, the scroll poster, the register button, the burning-Lanka and
temple-city paintings, the nav compass, stone tile, torch-lit corner pieces
and the footer shield) was supplied by the organisers from pinakactf.com and
is bundled as supplied: `assets/images/index.ts` (`PINAKA_IMAGES`) and, for
the two paintings used as world plates, `assets/plates`. It is shown in full
colour; nothing in the theme recolours it. The environment uses the wheel
emblem as the celestial relic in the sky and the nav pieces in the header
bar; the generated artwork above is the theme's own.

## Partner recognition

Partner **names** and any role come only from
`src/themes/pinaka/config.ts#PINAKA_PARTNERS` (as published on pinakactf.com,
October 2026). The organisers supplied the partner and sponsor logos and the
institutional marks from pinakactf.com; they are bundled as supplied under
`src/themes/pinaka/assets/sponsors/` (`SPONSOR_LOGOS`, `FEATURED_LOGOS`) and
`src/themes/pinaka/assets/institutional/` (`INSTITUTIONAL_LOGOS`), each
rendered in full colour beside its name by `PartnerStrip`, under the
existing `img-src 'self' https: data:` CSP. Pinaka CTF 2026 is organised by
NFSU Chennai; CyberHX is the scoring platform only.

## Existing assets left untouched

`src/assets/chain/chain-strip.png` (167 KB) and `fire.gif` (3.6 MB) are the
classic chained-board visuals. They are not loaded under the theme (the Setu
view replaces the renderer, not the data) and remain for the default theme.

## Size budget (measured after build — see TEST_RESULTS.md)

Target: the default theme's main chunk is unchanged within ±1 KB gzip; the
Pinaka CSS chunk ≤ 30 KB gzip; each lazy component chunk ≤ 25 KB gzip; no
new request on the default theme.

## World plates

One picture per world under `src/themes/pinaka/assets/plates/`, each in two
widths (1920 and 960 px), described by `assets/plates/index.ts` (`PLATES`,
`PLATE_CREDITS`) and put on the page by `assets/plates/sources.ts`. The hero
(sign-in page, intro) shares the Ayodhya plate. They are same-origin assets
imported through Vite (`img-src 'self'` in the CSP; no new host), loaded only
under the theme. Two kinds:

* **Official event artwork** (`temple-*`, `lanka-art-*`): the temple city at
  sunset (the pinakactf.com site painting) and Lanka ablaze (the burning
  fortress painting), supplied by the organisers. Shown in full colour,
  resized and re-encoded only. Credited in `PLATES` to "Pinaka CTF · NFSU
  Chennai", "Official event artwork", https://pinakactf.com/, with
  `credit.photo: false`, so they are not part of the CC credit line.
* **Licensed photographs** (`vanavasa-*`, `setu-*`, `vijaya-*`): CC0, public
  domain and CC BY-SA sources; the licence was read from the Wikimedia Commons
  `extmetadata` API (or the NASA Image Library metadata) at selection time and
  the raw API response is kept next to the untouched original outside the
  repository. Cover-cropped to 16:9 around the focal point (Pillow, Lanczos),
  then graded: they were first graded dark (14–22 % mean luminance) for the
  earlier veiled environment and have since been re-graded brighter for the
  full-colour one. Credited on screen from `PLATE_CREDITS`
  ("Photographs, colour-graded · author (licence) · …") wherever a plate is
  shown. Lord Rama is not depicted in any photograph; no people are the
  subject of any.

`focal` is the point kept by `object-position` on any aspect; `sun` is where
the light source is painted (it may lie just outside the frame, for light
falling from above). The environment measures where `sun` lands on screen
and anchors its bloom and god rays there.

| Plate key | Files | Where | Source | Author | Licence | Focal | Sun | Notes | Mean lum. | 1920 | 960 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ayodhya`, `hero` | `temple-1920.webp` (1920×926), `temple-960.webp` (960×463) | Chapter I — profile, team, settings, admin, the board before the event; the sign-in page and the intro | [pinakactf.com](https://pinakactf.com/) site painting | Pinaka CTF · NFSU Chennai | Official event artwork | 0.59, 0.66 | 0.602, 0.68 | The sun behind the tallest spire is the focal point, so a portrait phone keeps the temple. The padlock and circuit motifs in the sky are part of the art. | 0.22 | 163 KB | 66 KB |
| `vanavasa` | `vanavasa-1920.webp`, `vanavasa-960.webp` (16:9) | Chapter II — the challenge board | [Mystic Layers of Agumbe](https://commons.wikimedia.org/wiki/File:Mystic_Layers_of_Agumbe.jpg) | Pradyumnakp | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | 0.55, 0.45 | 0.50, −0.22 | Cropped to the middle band of the 4:3 source (source x 0.50, y 0.47): the stacked misty ridges, the canopy below. The light falls from the haze above the frame. | 0.32 | 239 KB | 56 KB |
| `setu` | `setu-1920.webp`, `setu-960.webp` (16:9) | Chapter III — the chained board | [Limestone shoals between mainland India and Sri Lanka](https://images.nasa.gov/details/iss071e700080) | NASA / ISS Expedition 71 | [Public domain (NASA)](https://www.nasa.gov/nasa-brand-center/images-and-media/) | 0.46, 0.42 | 0.62, −0.26 | Cropped 1.5x into the source around the shoal chain (source x 0.47, y 0.34) so Dhanushkodi, the shoals and Mannar island span the middle of the plate. Seen from orbit there is no horizon: the light comes down from above. | 0.28 | 69 KB | 22 KB |
| `lanka` | `lanka-art-1920.webp`, `lanka-art-960.webp` (1920×1080, 960×540) | Chapter IV — scoreboard, teams, users | pinakactf.com Lanka painting | Pinaka CTF · NFSU Chennai | Official event artwork | 0.42, 0.40 | 0.80, 0.48 | The fortress burns at the upper left, the fire glows at the right. The focal keeps both on a wide screen and the burning gate and near wall on a portrait one; the fire is the scene's sun. | 0.12 | 137 KB | 47 KB |
| `vijaya` | `vijaya-1920.webp`, `vijaya-960.webp` (16:9) | Chapter V — every screen once the event has ended | [Ram ki Paidi](https://commons.wikimedia.org/wiki/File:Ram_ki_Paidi.jpg) | AyodhyaDiary | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 0.63, 0.35 | 0.627, 0.289 | Cropped to the lower 86 % of the 3:2 source (source x 0.50, y 0.62): the sun and the domes at the centre, the photographer's corner mark outside the plate. A dusk silhouette, so its mean stays low. | 0.21 | 27 KB | 10 KB |

Total for the ten files: 817 KB. A screen loads at most one plate (two
during a world crossfade); `sizes` states the width the plate is actually
drawn at under `object-fit: cover`, so a 2× phone takes the 1920 file
(the 960 would be enlarged four times) and the low tier takes the 960 only.

**Removed in this round:** the Sarayu night photograph (Ruhi, CC BY-SA 4.0),
the Sigiriya photograph (C.J.Hatton, CC BY-SA 4.0) and the Hampi sunset
(Albert Paul, CC BY-SA 4.0), replaced by the official art. Their files are
deleted and their credits are no longer rendered, because they are no
longer shown anywhere.

## Environment use of the official art

* **Plates** in full colour behind every themed screen, no grading filter.
* **Celestial relic** — `PINAKA_IMAGES.wheelEmblem` (700 px file, the 1000 px
  file via `srcset` on large or dense screens), unfiltered, high in the sky
  at the upper right, turning once in 240 s on the high and medium tiers.
  Opacity per world: Ayodhya 0.9, Vijaya 1 (smaller, above the domes),
  Setu 0.6, Vanavasa 0.5, Lanka 0 (the fire is the light there); not shown on
  the sign-in page, whose hero carries its own wheel.
* **Nav bar** — `navbar-corner-left/right.webp` at the full bar height (the
  torch flame visible), `navbar-texture.webp` as the rail's stone (opacity
  0.34, screen), and `navbar-compass.webp` as the icon in the "Pinaka CTF"
  badge. Referenced from `styles/core.css`, so they ride with the theme's CSS
  chunk.
* `site-bg-1280/2560.webp` (`PINAKA_IMAGES.siteBg`) is the same painting as
  the temple plate; it is no longer used as a body background (the
  environment covers the body entirely, so it was a wasted download).
