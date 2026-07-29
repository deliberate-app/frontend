# design-sync notes — deliberate-frontend

Machine notes for future syncs. Config lives in `config.json`; the conventions header that ships as
the project README is `conventions.md`; authored previews are in `previews/`.

Target project: `e1ba9784-fc54-4561-a8c6-a6535960f2c0` ("deliberate design system").
First full sync: 2026-07-29 — 22 components, **all 22 with authored previews** (65 cells), every cell
graded `good`. No floor cards remain.

## Repo shape (why the config looks like this)

- **No `dist/`.** This app is a Vite SPA, not a published package, so the converter runs in
  synth-entry mode. `entry: "./dist/index.js"` is deliberately a *non-existent* path: it exists only
  to anchor `PKG_DIR` at the frontend root. Without it the run fails with
  `ENOENT: node_modules/deliberate-frontend/package.json`. Do not "fix" it by pointing it at a real
  file, and do not delete it.
- **`srcDir: "src/components"`.** Without it the discovery walks all of `src/` and 22 of 22 exports
  come back `[BUNDLE_EXPORT] not a component` (hooks, types, data adapters).
- **`componentSrcMap: {"App": null}`** excludes the app shell — it mounts routing and wallet state,
  nothing a design agent should compose with.
- **CSS is reached through `extraEntries`, not `cssEntry`.** `cssEntry` points at
  `ds-styles.css`, which carries only the remote Google-Fonts `@import`. The real 20 KB of component
  CSS comes from `ds-entry-styles.ts`, a side-effect module that does `import '../src/styles.css'`,
  so esbuild folds it into `_ds_bundle.css`. An import-only `cssEntry` stub produces
  `_ds_bundle.css: 0 KB` — that reads as success but ships designs with no styles.
  (`tokensGlob` is not usable here: it requires `tokensPkg` and only resolves inside `node_modules`.)
- **`dtsPropsFor` is hand-written and load-bearing.** With no `dist`, the type extractor has no
  `.d.ts` to read and every component would ship `[key: string]: unknown` — the design agent then has
  no API to code against. The 19 entries mirror `src/types.ts`; when `Debate`/`ArgumentNode` change,
  update them here too.

## Gotchas worth not rediscovering

- **Modals need a transform-containing frame.** `ScheduleSettings`, `FeeSettings`, `BountySettings`,
  `MarketDetail` and `BountyTopUpChip`'s top-up render a `position: fixed` backdrop that escapes the
  preview card and crops. Raising the viewport does *not* help. Wrap the cell in
  `<div style={{ transform: 'translateZ(0)', width: W, height: H, position: 'relative' }}>` and pair
  it with `overrides.<Name> = {cardMode: "single", viewport: "WxH"}`.
- **`[CONFIG_STALE]` after editing `overrides`.** A scoped `package-capture.mjs` run refuses to use a
  config newer than the build. Run the full `package-build.mjs` once to re-stamp, then capture.
- **`[GRID_OVERFLOW]` → `cardMode: "column"`.** Hit by `CharBudget` and `DraftControls` (their widest
  cell is a full form row). Fixed in `overrides`; re-fix the same way if new wide cells appear.
- **Capture wipes `ds-bundle/_screenshots/review/`.** Only the last capture's sheets survive, so
  *grade immediately after capturing a batch* — capture another batch first and the sheets are gone.
- **Components with internal open state** (`Composer`, `DraftControls`, `BountyTopUpChip`) start
  collapsed. Previews reach the open surface by clicking the component's own trigger from a
  `useEffect` (see `previews/Composer.tsx`), never by faking state. `import { useEffect } from 'react'`
  works in previews — react is externalized to the window global.
- **Components that render `null`** unless given the right state: `PhaseClock` (needs `timing`, hides
  when finished), `PositionPanel` (hides with no shares and no fees), `BountyPanel` (needs
  `debate.bounty` + `tx` + `phase: 'finished'`), `BountyTopUpChip` (needs `debate.bounty`),
  `MiniTree` (needs ≥ 2 nodes). A preview that forgets one grades as a floor card.
- **`PositionPanel`'s `load` prop must be hoisted** out of the cell — it is an effect dependency, so
  an inline arrow re-runs the load every render.
- **Class names: check before inventing.** `composer-actions` does not exist; the real row class is
  `action-row` (which gives the trailing `char-budget` its `margin-left: auto`).
- **The three app-shell views need live time and a full `tx`.** `DebateView` runs its own clock
  (`useNow`), so its preview anchors the schedule to `Math.floor(Date.now() / 1000)` at module scope
  — a frozen constant puts every cell in the tallying phase. Its `tx` fixture must carry the whole
  surface (`joined`, `tokens`, `bountyClaimed`, and every handler), because separate branches read
  different fields. Focus is internal state, so the "argument focused" cell dispatches a real click
  on `button.card`.
- **`WalletMenu` icons must be data URIs.** The preview page has no network; the real EIP-6963 icons
  are data URIs too, so an inline SVG data URI is faithful, not a cheat.

## Known validate warnings (expected, non-blocking)

- `[FONT_REMOTE]` — Fraunces / Public Sans / IBM Plex Mono load from a remote font host, exactly as
  `index.html` does. Nothing to fix; a warn that is *not* in this list is new.

## Re-sync risks

- Adding a component to `src/components/` ships it automatically, but **without a preview** it
  appears as a floor card and **without a `dtsPropsFor` entry** it ships an untyped prop bag. Both
  are silent. Add the pair when adding a component.
- `_ds_sync.json` in the uploaded project is the verification anchor — carry-forward comes from
  there, not from git. `.design-sync/.cache/` (grades) is gitignored on purpose.
- Envio/Vercel are unrelated to this sync; nothing here touches a deploy.
