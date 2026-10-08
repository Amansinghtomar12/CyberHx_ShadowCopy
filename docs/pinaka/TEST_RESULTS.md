# Pinaka theme — test results

Evidence for the branch `feature/pinaka-ramayana-experience`. Every number
below was measured in this repository; "not run" means exactly that.

## 1. Baseline (before any change) — `main @ ce23b64`, 2026-10-08

| Check | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | exit 0, 0 errors (19.0 s) |
| `npm run build` (`vite build`) | exit 0, 3015 modules, 10.8 s |
| `dist/assets/index-*.js` | 1,543,058 B (434.27 KB gzip) |
| `dist/assets/index-*.css` | 110,020 B (19.98 KB gzip) |
| lazy chunks | ChainedBoard 4.3 KB, ChainExperience 13.1 KB, B2RBoard 10.1 KB |
| static assets | chain-strip.png 167 KB, fire.gif 3.6 MB |
| existing automated tests | **none in the repository** (no test runner in `package.json`); the typecheck and the build are the only automated gates |
| baseline screenshots | `qa/visual` harness, theme `cyberhx`, desktop + mobile, every scene — see §4 |

## 2. Static checks on the themed branch

_To be filled in after integration: tsc, build, bundle delta (default theme must be within ±1 KB gzip of the baseline main chunk), new chunk sizes._

## 3. Functional preservation

_To be filled in: the consolidated preservation checklist from AUDIT.md executed against the mock backend in both themes, with per-item result._

## 4. Visual regression

_To be filled in: per-scene results of `node harness.cjs --theme cyberhx` and `--theme pinaka` at desktop/mobile and reduced motion, with console/page error counts and the screenshots reviewed._

## 5. Performance

_To be filled in: Lighthouse / Chrome tracing on the built preview for both themes (LCP, CLS, INP, long tasks), environment canvas frame cost by tier, memory after 10 world changes._

## 6. Accessibility

_To be filled in: contrast table of every new text/background pair, keyboard walk-through of every new control, reduced-motion walk-through, screen-reader pass of the intro and the Setu chain._

## 7. Security

_To be filled in: CSP review of every new resource, storage keys written, URL parameters read, markdown rendering parity, dependency diff (`package.json` unchanged)._

## 8. Known limitations and what was not verified

_To be filled in honestly at hand-off._
