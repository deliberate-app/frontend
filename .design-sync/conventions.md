# deliberate — how to build with these components

deliberate is an on-chain debate app: a thesis with a tree of pro/con arguments, each carrying a
constant-product *rating market* that participants stake on. The components below are the real
compiled app components — designs made from them map 1:1 onto shippable code.

## North star

**The arguments are the interface.** Quiet neutrals, one serif voice for claims, thin hairlines,
as little chrome as possible. Stance color is **contour, not fill** — a green or rust edge says
which side an argument takes without shouting over its text. Every addition must pay for the
attention it takes from the arguments; when in doubt, remove.

## Tokens and type

Never hard-code a color. The full set:

| Token | Meaning |
| --- | --- |
| `--canvas` | page background |
| `--card` | raised surface (cards, modals, the top bar) |
| `--ink` | text, and the thesis' own color |
| `--bark` | secondary text: meta lines, hints, counters |
| `--hairline` | every border and divider |
| `--pro` / `--pro-wash` | **pro stance only** |
| `--con` / `--con-wash` | **con stance only** |

`--font-display` (Fraunces) sets claims and modal titles, `--font-body` (Public Sans) everything
else, `--font-mono` (IBM Plex Mono) every figure. **Stance colors are reserved**: green and rust
mean pro and con, never success/error, never emphasis. Errors are the one exception — `.action-error`
is intentionally rust, because a blocked action is the only other thing allowed to shout.

## Composition classes

Components are unstyled glue away from a screen. Use the app's own classes rather than inventing
layout:

- `action-row` — a horizontal, wrapping row of controls; `char-budget`-style trailing items push
  right on their own (`margin-left: auto`). `action-panel` wraps a row with the hairline above it.
- `action-hint` (one-sentence explanation), `action-error` (blocking message).
- `focus-kicker-row` / `focus-kicker` / `focus-text` — the focused claim's header: stance kicker on
  the left, author chip on the right, the claim itself in display type.
- `focus-meta` — the dotted meta line beneath a claim (approval, weight, sway, upside, lock).
- `composer` / `composer-text` / `composer-approval` / `composer-hint` — the authoring surface.
- `duration-field` / `duration-label` / `duration-inputs` / `duration-unit-label` — a labelled
  field with a unit, used by every settings modal.
- `preset-row` + `preset-active` — named preset chips; the default preset is literally "Default".
- `btn`, plus `btn-solid` (primary), `btn-small`, `btn-pro` / `btn-con` (stance-tinted).
- `mono` on every number; `market-pro` / `market-con` tint good- and bad-argument figures.
- `modal-backdrop` / `modal` / `modal-head` / `modal-title` / `modal-close`.

## Data shapes

Most components take a `debate` and/or a `node`; each component's `.d.ts` carries the exact
contract. Two things to get right:

- **All times are unix seconds**, including the `now` prop — not milliseconds. `debate.timing`
  carries `chainTime`/`loadedAt` so the clock keeps running between loads; passing `now` equal to
  `chainTime` freezes it at a known moment, which is what previews do.
- **Phase follows the clock, not the field.** `PhaseClock` and `ArgumentCard` re-derive the live
  phase from `timing`; a `debate.phase` of `'editing'` with a passed `editingEndTime` renders as
  rating. Only `'finished'` is a latch.

Vote tokens render with the `⬡` glyph. Ratings and sways are **signed percentages around ±0** with
center-anchored gauges — a 50% market reads `±0%`, never "half full".

## Modals

Settings modals (`ScheduleSettings`, `FeeSettings`, `BountySettings`) **edit live**: changes apply
the moment they are made, so there is no OK/Apply/Reset footer — the cross and the backdrop are the
only exits, and invalid values gate the downstream action instead of trapping the modal. Transactional
modals (`BountyTopUpChip`'s top-up) do confirm explicitly, because the transfer is irreversible.

They render a `position: fixed` backdrop. To place one inside a bounded box (a card, a preview
cell), wrap it in a **transform-containing frame** — a positioned element with `transform:
translateZ(0)` — which becomes the containing block for the fixed child:

```jsx
<div style={{ transform: 'translateZ(0)', width: 540, height: 760, position: 'relative' }}>
  <FeeSettings feePercentage={1} onChange={noop} onClose={noop} />
</div>
```

## Components that render nothing

Several components deliberately return `null` rather than an empty state — pass the state that makes
them appear:

- `PhaseClock` — needs `timing`, and hides once finished.
- `PositionPanel` — hides while loading, and when the account holds no shares and no claimable fees.
- `BountyPanel` — needs `debate.bounty`, a non-null `tx`, and `phase: 'finished'`.
- `BountyTopUpChip` — needs `debate.bounty`; without `tx` it degrades to the read-only figure.
- `MiniTree` — needs at least two nodes.

`Composer`, `DraftControls` and `BountyTopUpChip` own their open/closed state internally: they start
collapsed and open on their own trigger. Drive them by clicking that trigger, never by faking state.

## Iconography

Icons are inline SVGs stroked with `currentColor` and sized in `em`, so they ride with their text —
no emoji, no icon fonts. Strokes end **round** and carry **weight**: a symbol's meaningful lines are
drawn heavier than the structural hairlines around them.

## Copy

Labels say what the mechanism does ("Underrated ↑ / Overrated ↓", "You profit if the rating corrects
your way"); tooltips explain the consequence. One sentence, no gamified wording, and never state an
unenforced number as if it were a rule.
