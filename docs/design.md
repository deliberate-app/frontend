# Design language & decisions

A living record of the UI's design principles and the notable decisions behind them — the design
counterpart to the contracts repo's ADRs. Principles state what every new piece of UI should follow;
the decision log records when and why a call was made, so it is not accidentally "fixed" later.
Domain vocabulary itself lives in the contracts repo's `CONTEXT.md`; hard-to-reverse choices graduate
to ADRs.

## North star

**The arguments are the interface.** The design is reduced on purpose: quiet neutrals, one serif
voice for claims, thin hairlines, and as little chrome as possible, so that attention lands on the
debate content and the overview stays legible at a glance. Stance color appears as *contour, not
fill* — the green/red edge on an argument box says which side it argues without shouting over its
text. Every addition must pay for the attention it takes from the arguments; when in doubt, remove.
(Affirmed by Michael, 2026-07-14: the reduction, the focus on content, and the stance-colored
contouring are exactly right — treat them as the baseline to protect.)

## Principles

1. **Monochrome stroke iconography.** Icons are inline SVGs drawn with `currentColor` strokes (the
   card padlock, the schedule cogwheel), sized in `em` so they scale with their text. No emoji and no
   symbol-font glyphs — font fallback renders them inconsistently and off-center. Strokes end **round**
   by default (`stroke-linecap`/`stroke-linejoin: round`) and carry **weight**: a symbol's meaningful
   lines — the verdict check and cross, the docs' market plus/minus and tree glyphs — are drawn heavier
   than the thin structural hairlines (card outlines, connectors), so a glyph reads as a glyph, at the
   weight the logo bars and arrows set. The lone exception is the brand mark's contour, whose two halves
   meet flush at butt caps by design (`brandkit/README.md`).
2. **Stance colors are reserved.** Green (`--pro`) and rust (`--con`) mean pro/con stance,
   nothing else; all other UI stays in the ink/bark neutrals. Color must always carry meaning.
3. **Live figures never jitter.** Numbers that tick (countdowns, balances) use the mono font with
   tabular figures and fixed-width formats (`formatCountdown` is always seven characters), so a
   running timer cannot change an element's width.
4. **Dashed means "compose".** A dashed border marks the affordance for adding something (reply
   composers, "+ Start a debate"). The landing page's primary action is the assertive variant — ink
   dashes on card white that solidify on hover — and an enabled control must never look disabled.
5. **Settings live on the value they edit.** A configuration affordance is the summary of the
   current values itself (the schedule chip with the trailing cog), not a detached button; clicking
   it opens the editor. Corner-gear and "Advanced options" disclosures were considered and rejected:
   the first needs a card header we don't have, the second hides information worth glancing at.
6. **Config modals edit live.** Changes apply the moment they are made — the summary behind the
   modal visibly updates — so there is no Accept/Done/Reset footer; the cross and the backdrop are
   the only exits. Validity gates the downstream action (the create button, with an explanatory
   tooltip) instead of trapping the modal open. Transactional modals (draft + Accept/Cancel) are
   reserved for destructive or hard-to-undo edits, which pre-creation settings are not.
7. **Presets first, freedom behind them.** Common configurations are named preset chips, and the
   default preset is literally named "Default" — one concept, no separate reset affordance. Free
   fields sit in the same editor for full control; where the contract allows a value we advise
   against, the UI warns softly rather than forbidding.
8. **Neutral looks neutral.** Ratings and sways are signed percentages around ±0 with diverging,
   center-anchored gauges — a 50% market reads as ±0%, not as "half full".
9. **Hard rules block, guidance warns, hints stay short.** Constraints the contract enforces are
   mirrored as errors that disable the action (locking > 0, editing > locking, rating ≥ locking);
   sensible-configuration nudges are soft warnings with a one-line why (editing ≥ 5 locking windows
   so arguments can be nested and moved into place; rating ≥ a quarter of editing so there is time
   to read). Hover and helper copy is one sentence —
   never state unenforced numbers as if they were rules.
10. **Mechanism-honest copy.** Labels say what the mechanism does ("Underrated ↑ / Overrated ↓",
   "locking · editing · rating", "You profit if the rating corrects your way"); tooltips explain the
   consequence. No moralized or gamified wording that misstates the incentives.

## Decision log

- **2026-07-23 — "Redeem all shares" lives in the top bar, next to the Finished label.** The
  finished-debate settle action moved out of the thesis focus screen (where it read as thesis
  chrome) up to the phase chip it belongs to: the label announces Finished, the button acts on it,
  and it retires itself once nothing is left to redeem. It now shows from one held position up —
  as the global affordance it no longer defers to the per-argument panel. Errors surface in the
  standard load-error slot like the tally poke's. (Principle 5: the action on the state it acts
  on.)
- **2026-07-23 — shares are named by their claim: good-argument / bad-argument.** "Pro/con shares"
  collided with the pro/con *stance* of arguments — a con argument's *pro* shares were a
  vocabulary accident. A good-argument share pays the argument's final rating, a bad-argument
  share its complement; the staking buttons keep their stance-free underrated/overrated verbs and
  teach the share names in their tooltips. Glossary entry in the contracts repo's CONTEXT.md.
  (Principle 10.)
- **2026-07-23 — "pot" became "upside".** "Pot" said poker — a posted prize someone must win.
  The figure is the mechanism-exact *bound on the gain* available per correction direction (the
  reserve the bought side can free), which "upside" states honestly; it also reads naturally with
  the directional split (`upside ↑1 ↓104 ⬡`). (Principle 10.)
- **2026-07-22 — the winnable pot is the rater-attention beacon; the curve lives in a detail
  modal.** Every argument card carries a quiet `pot n ⬡` (the larger correction prize; both
  directions on hover), and the focus meta shows the split (`pot ↑1 ↓104 ⬡`) as a chip opening the
  market detail: the constant-product curve as a parametric plot (con shares right — "bad
  argument", pro shares up — "good argument", the market as a point on `pro·con = k`), reserves,
  pool, fee, and the per-direction pot. The pot is the reserves — mechanism-exact bounds on what
  correcting the market can free — surfacing the attention signal the design already pays
  (deposit + mispricing) instead of adding a purchasable one (per-argument bounties were analyzed
  and rejected: contracts incentives.md §9). Stance colors mark the two directions; the plot stays
  ink. (Principles 1, 2, 5, 10; north star: detail on demand, cards stay scannable.)

- **2026-07-21 — the market fee is a third settings chip, defaulting to 1%.** The contract made the
  fee a per-debate creator parameter (contracts ADR-0010); the create form exposes it as `fee 1% ⚙`
  beside the schedule and bounty chips — same live modal pattern, one field, hard-blocked only at
  the contract's own bound (integer 0–99). The default is 1%, not the old flat 5%: the debate-4
  forensics showed 5% eating the whole thin-market upside, and 1% is where the replayed trade turns
  profitable. The stake panel's fee hint now quotes the debate's actual fee ("no market fee" at
  zero) instead of a hardcoded 5%. (Principles 5, 6, 9, 10.)

- **2026-07-15 — the author signs the card header, not the meta line.** The focus card's kicker row
  is now `THESIS / PRO ARGUMENT … ← → author badge`: identity sits with the claim's label (as posts
  carry their author up top elsewhere), and the meta line goes back to being a quiet row of figures.
  Inline in the meta text, the 1.4em identicon rode above the baseline and inflated the line — a
  badge is a block-ish thing and earns a block-ish seat. `.address-badge` also gained
  `vertical-align: middle` for the places it still sits in text (browse rows). (North star,
  principle 3's spirit: rows keep their rhythm.)
- **2026-07-15 — the bounty top-up lives on the bounty figure.** The floating input+button strip
  above the thesis card is gone; the thesis meta's `bounty 1 EURC` closes the line, followed by a
  small round `+` button that opens the top-up modal (amount + `Top up EURC`). Principle 5 — the
  affordance on the value it edits; the round box wraps only the plus (boxing the whole figure
  read as a tag, not a value in the meta series). Unlike the settings modals this one is
  transactional (explicit confirm button): a top-up is an irreversible donation, which is
  principle 6's stated bar for Accept-style modals. Without a wallet, and once finished, the
  figure renders as plain meta text (the claim panel owns the bounty from there).
  (Principles 5, 6, 10.)
- **2026-07-15 — one address badge everywhere: identicon + `0x1234…abcd`.** Accounts render through
  a single `AddressBadge` (blockies-style deterministic identicon plus the canonical truncation),
  composed by the copy chip and the wallet button — two competing truncations collapsed into the
  ecosystem-standard form (four hex either side, as Etherscan and the wallets themselves print it).
  The identicon is the exception to monochrome iconography: its colors ARE the identity, which is
  exactly principle 2's bar; it also replaces the wallet button's green dot (an address showing is
  the connected signal). The icon is rounded (radius just under the boxes' own) and sized ~1.4em so
  the 8×8 pattern is legible — a sharp small square sat foreign among the rounded cards.
  (Principles 1, 2.)
- **2026-07-15 — "Highest bounty" ranks in whole tokens, not value.** The sort normalizes each pool
  by its token's decimals and orders bounty-less debates last. Without a price oracle this is
  unit-honest, not value-honest — 50 USDC ranks above 0.5 WETH — which is stated here rather than
  faked with hardcoded prices. (Principle 10.)
- **2026-07-15 — the bounty is a second chip with the same live modal.** The create form's bounty
  affordance mirrors the schedule chip exactly: the chip is the value ("no bounty" / "bounty 50
  USDC"), the modal edits live (preset token chips WETH · USDC · EURC, any ERC-20 by address, the
  amount in human units). Elsewhere the bounty stays in the meta lines - browse rows and the thesis
  meta show the pool in quiet mono; the only bold affordance is the finished-debate
  "Redeem & claim bounty share" button, one transaction for settle-and-claim, mirroring the
  contract's one-shot claim. (Principles 5-7, 10.)
- **2026-07-15 — the mine shortcut is an in-field adornment.** First a separate "Mine" button
  (displaced), then a native `datalist` suggestion (too hidden — only visible on focus); now a
  small uppercase "mine" sits inside the Author field's right edge, filling it with the connected
  address and clearing it when active (underlined). One affordance, always visible, on the value
  it edits. (Principle 5.)
- **2026-07-15 — the rating chip lost its green.** `.phase-rating` was the one phase styled in a
  stance color, reading as "pro" next to the verdict marks; every phase chip is neutral now — the
  word carries the state, green stays reserved for the pro stance. (Principle 2.)
- **2026-07-15 — browse phase chips share one width, verdict slot always reserved.** The chips are
  a column (equal min-width, centered label), and the ✓/✗ slot exists on every row whether or not
  there is a verdict — a mark must never shift a chip out of line. (North star: the overview reads
  at a glance; kin to the row-paired cards.)
- **2026-07-15 — finished debates carry their verdict into the browse list.** A green ✓ / red ✗
  next to the Finished chip — the focus view's "Thesis confirmed ✓ / objected ✗" reduced to one
  glyph, same characters, same stance colors (tooltip spells it out). (Principles 2, 10.)
- **2026-07-15 — unresolved content links to its `ipfs://` URI.** The digest fallback used to copy
  the CID; it now opens `ipfs://<cid>` in a new tab so an IPFS-enabled browser or extension can try
  providers beyond the app's gateway. The full digest stays on the tooltip. (Principle 10.)
- **2026-07-15 — the focused argument shows its lock state.** The focus meta ends with the same
  countdown padlock the cards carry — a focused draft was indistinguishable from a final argument.
  One shared `LockChip`; the thesis (born final, no draft lifecycle) shows none. (Principles 1, 3.)
- **2026-07-15 — a draft's reply slot stays empty.** "Undebated" is reserved for *final* childless
  arguments: a draft cannot be replied to yet (nesting needs a locked-in parent), so claiming it
  is undebated misled — its countdown padlock owns that story until it locks in. (Principle 10.)
- **2026-07-15 — pro/con cards are row-paired.** The two columns are subgrids of one shared grid:
  the i-th pro and con cards sit in the same row and get the same height, the meta row is pinned
  to the card's bottom edge, and the composers meet on the last row — so gauges, locks, and reply
  counts line up across the columns at any text length (font sizes untouched). On the stacked
  mobile layout the spans flow sequentially and every row sizes to its single card. (North star:
  the overview stays legible at a glance.)
- **2026-07-15 — a card without children reads "Undebated".** "No replies yet" was forum language;
  the tree speaks of arguments beneath a claim. One quiet, domain-true word that doubles as an
  invitation to argue; cards with children keep "n pro · n con →". (Principle 10, north star.)
- **2026-07-15 — authored texts are capped at 250 characters, budget always visible.** Theses and
  arguments share one hard cap (`MAX_CONTENT_CHARS`): one sharp claim per box — depth belongs in
  the tree, not in paragraphs, and short cards keep the overview scannable (north star). The input
  simply stops at the limit, and the mono `n/250` counter at the end of the action row is always
  shown, so the medium's size is clear from the first character. (Started as 140 with a counter
  appearing only near the limit; 250 gives claims room to breathe and the permanent budget is more
  predictable than one that pops in.) (Principles 3, 9.)
- **2026-07-14 — the 30-minute locking rule was dropped.** First flat, then scaled to
  max(30 min, editing/48) when Long's 1 h locking tripped it — and then removed: every variant
  either warned on a stock preset or restated proportionality the nesting rule (editing ≥ 5
  locking windows) already expresses. One rule per concern.
- **2026-07-14 — Long locks in an hour; the locking guidance scales.** Long's locking rose to 1 h,
  which would have tripped the flat 30-minute warning on a stock preset — the ceiling became
  proportionate, max(30 min, editing/48), preserving the 30-minute rule for day-scale debates.
- **2026-07-14 — `timeUnit` became `lockingDuration`, with a constraint ladder.** The contract
  renamed the parameter (nothing is a multiple of it anymore), made the editing bound strict
  (editing must exceed locking), and the frontend mirrors those as blocking errors while adding the
  soft guidance ratios of principle 9. The rating ≥ editing/4 nudge is a heuristic — what really
  bounds a sensible rating duration is an open question (tracked in the project TODO). Hints were
  cut to one sentence; the old locking hint was verbose and presented the unenforced 30-minute
  figure as if it were a rule.
- **2026-07-14 — presets are one duration axis: Short · Default · Long.** "Demo" was removed (a
  developer concern, not a user setting — devs type custom timings), and "Sprint" broke the axis by
  naming a pace next to "Long" naming a duration. The trio now reads as a scale in the same
  vocabulary as the values it sets. (Principles 7 and the north star.)
- **2026-07-14 — durations drop zero units.** "locking 30m 0s · editing 1d 0h" became
  "locking 30m · editing 1d" (`formatDuration` omits a zero second unit) — affirmed as exactly the
  right kind of decluttering; also quiets the phase clock. (North star: remove noise.)
- **2026-07-14 — schedule modal is live-editing; footer removed.** "Done" was redundant with the
  cross/backdrop and "Accept" would misrepresent already-applied edits; "Reset to default"
  duplicated the Default preset chip. (Principles 6, 7.)
- **2026-07-14 — cogwheel became a stroke SVG.** The ⚙︎ text glyph fell back to a symbol font and
  sat off-center next to 0.8 rem text at any size. (Principle 1.)
- **2026-07-14 — the schedule summary chip is the settings button.** A separate "Customize" button
  next to the summary read as displaced; the chip puts the affordance on the value. (Principle 5.)
- **2026-07-14 — landing CTA got the assertive dashed variant.** "+ Start a debate" in bark grey
  read as disabled and vanished on the page; ink dashes that solidify on hover keep the compose
  language while making the primary action primary. (Principle 4.)
- **2026-07-14 — presets renamed Day→Default, Week→Long.** Preset names should describe their role
  relative to the default, not restate their durations (the chip already shows those).
- **2026-07-14 — schedule durations read "locking · editing · rating".** Parallel gerunds; "drafts
  lock in" broke the series. Matches the glossary term *Locking window* (contracts `CONTEXT.md`).
- **2026-07-14 — draft lock-in shown as padlock + fixed-width countdown.** Replaced the dashed
  "DRAFT · LOCKS IN" text chip: shackle-ajar padlock with a seven-character countdown while a draft
  can change, a muted closed padlock once final. (Principles 1, 3.)
- **2026-07-13 — approval displayed as a signed rating centered on neutral.** 0..100% market
  approval reads as −100%..+100% around ±0, matching the sway figures; the gauge diverges from the
  center. Display-only — the contract keeps its 0..1 price. (Principle 8.)
- **2026-07-11 — rating controls relabeled "Stake n ⬡ · Underrated ↑ / Overrated ↓".**
  "Invest pro/con" implied agreement; staking on a correction is stance-free. (Principle 9.)
