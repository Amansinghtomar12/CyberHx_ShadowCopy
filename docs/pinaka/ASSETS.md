# Pinaka theme — asset inventory

Every visual in the theme is generated code (inline SVG / Canvas 2D), a font
from a host the Content-Security-Policy already allows, or one of the six
photographic plates listed in the last section (same-origin WebP files
bundled by Vite, loaded only under the theme). No video, no third-party
scripts were added. The repository's `vercel.json` CSP is unchanged.

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

## Photographic plates

Six colour-graded photographs under `src/themes/pinaka/assets/plates/`, one per
world plus the hero behind the sign-in page and the intro. They are same-origin
assets imported through Vite (`img-src 'self'` in the CSP; no new host), loaded
only under the theme, and described by `assets/plates/index.ts` (`PLATES`,
`PLATE_CREDITS`). Every source is a public-domain, CC0, CC BY or CC BY-SA
photograph; the licence was read from the Wikimedia Commons `extmetadata` API
(or the NASA Image Library metadata) at selection time and the raw API response
is kept next to the untouched original outside the repository. Lord Rama is not
depicted in any plate; no people are the subject of any plate.

**Treatment** (Pillow, `scripts` kept outside the repo): cover-crop to 16:9 around
the focal point, resize to 1920×1080 (Lanczos), desaturate to ~78 %, a tone curve
that brings the mean luminance to ~40–50 % of the original (clamped to an
absolute 14–22 % so an already dark photograph is not crushed), shadows blended
toward indigo `#121d38`→`#17284a`, highlights toward gold `#e3bb66`, a radial
vignette to the ground `#0a0e17`, the top 45 % darkened further (full strength
at the top edge, where the nav sits), and a 6 % indigo wash. WebP quality 78,
method 6; the 960×540 file is resized from the graded 1920 plate. Caps: 1920 file
≤ 260 KB, 960 file ≤ 90 KB.

| Plate | Where | Source | Author | Licence | Focal point (plate) | Crop / grade notes | 1920 | 960 |
|---|---|---|---|---|---|---|---|---|
| `ayodhya` | Chapter I — profile, team, settings, admin, the board before the event | [Sarayu River night view, Ayodhya 001](https://commons.wikimedia.org/wiki/File:Sarayu_River_night_view,_Ayodhya_001.jpg) | रूही (Ruhi) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 0.45, 0.50 | Already 16:9; the whole frame is used. Point of interest: the lit ghat line and its reflection at plate (0.45, 0.50); the sky above is dark for the nav. Mean luminance 0.32 → 0.14 (0.44×). | 60 KB (q78) | 22 KB (q78) |
| `vanavasa` | Chapter II — the challenge board | [Mystic Layers of Agumbe](https://commons.wikimedia.org/wiki/File:Mystic_Layers_of_Agumbe.jpg) | Pradyumnakp | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | 0.55, 0.45 | Cropped to the middle band of the 4:3 source (source x 0.50, y 0.47). Point of interest: the stacked misty ridges at plate (0.55, 0.45); the canopy fills the lower half, the haze at the top takes the nav. Mean luminance 0.49 → 0.21 (0.43×). | 181 KB (q78) | 42 KB (q78) |
| `setu` | Chapter III — the chained board | [Limestone shoals between mainland India and Sri Lanka](https://images.nasa.gov/details/iss071e700080) | NASA / ISS Expedition 71 | [Public domain (NASA)](https://www.nasa.gov/nasa-brand-center/images-and-media/) | 0.46, 0.42 | Cropped 1.5x into the source around the shoal chain (source x 0.47, y 0.34) so Dhanushkodi, the shoals and Mannar island span the middle of the plate with the Palk Strait below. Point of interest: the shoals at plate (0.46, 0.42). Contrast 1.3 and a stronger gold highlight so the shoals read as a thread of light on the water. Mean luminance 0.38 → 0.19 (0.50×). | 49 KB (q78) | 15 KB (q78) |
| `lanka` | Chapter IV — scoreboard, teams, users | [Sigiriya, taken from Pidurangala Rock](https://commons.wikimedia.org/wiki/File:Sigiriya,_taken_from_Pidurangala_Rock.jpg) | C.J.Hatton | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 0.50, 0.50 | Cropped 1.15x into the 3:2 source around the rock (source x 0.50, y 0.48) so the fortress sits dead centre (plate 0.50, 0.50) with the hills behind it and the storm sky above. Highlights pushed a little further toward gold so the lit face of the rock carries the Lanka ember. Mean luminance 0.50 → 0.22 (0.43×). | 46 KB (q78) | 12 KB (q78) |
| `vijaya` | Chapter V — every screen once the event has ended | [Ram ki Paidi](https://commons.wikimedia.org/wiki/File:Ram_ki_Paidi.jpg) | AyodhyaDiary | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 0.63, 0.35 | Cropped to the lower 86 % of the 3:2 source (source x 0.50, y 0.62): the sun and the domes sit at the centre and the photographer's corner mark at the top edge is outside the plate. Point of interest: the sun at plate (0.63, 0.35). The source is already dark (mean 0.21), so the ratio is relaxed to 0.7× (final 0.15) with warmer highlights, keeping the sun as the light of homecoming. Mean luminance 0.21 → 0.15 (0.69×). | 18 KB (q78) | 7 KB (q78) |
| `hero` | Sign-in page and the intro | [A beautiful sunset in Hampi](https://commons.wikimedia.org/wiki/File:A_beautiful_sunset_in_Hampi.jpg) | Albert Paul | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 0.32, 0.60 | Cropped around the centre of the 1.87:1 frame (source x 0.50, y 0.55; only the side margins are lost). Point of interest for object-position: the Virupaksha gopuram and the hill line at plate (0.32, 0.60), so a narrow viewport keeps the temple. Mean luminance 0.44 → 0.20 (0.45×). | 80 KB (q78) | 21 KB (q78) |

Total for all twelve files: 552 KB. A screen loads at most one plate
(two during a world crossfade). Attribution for the CC BY / CC BY-SA photographs
is rendered from `PLATE_CREDITS` in the theme footer; the NASA photograph needs
no attribution but is credited anyway.
