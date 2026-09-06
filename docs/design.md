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
5. **Settings live on the value they edit — once the value exists.** A configuration affordance is
   the summary of the current values itself, not a detached button; clicking it opens the editor.
   Corner-gear and "Advanced options" disclosures were considered and rejected: the first needs a
   card header we don't have, the second hides information worth glancing at. Creating a debate is
   the exception, and not really an exception: there is no value yet to hang a setting on, so the
   five questions are asked as a form (`CreateWizard`), in order, each arriving already answered.
6. **Config modals edit live.** Changes apply the moment they are made — the summary behind the
   modal visibly updates — so there is no Accept/Done/Reset footer; the cross and the backdrop are
   the only exits. Validity gates the downstream action (the create button, with an explanatory
   tooltip) instead of trapping the modal open. Transactional modals (draft + Accept/Cancel) are
   reserved for destructive or hard-to-undo edits, which pre-creation settings are not.
7. **Presets first, freedom behind them.** Common configurations are named presets, and the
   default preset is literally named "Default" — one concept, no separate reset affordance. Free
   fields sit in the same editor for full control; where the contract allows a value we advise
   against, the UI warns softly rather than forbidding.
8. **One element per kind of choice.** Four controls, four jobs, kept visually apart because the
   difference is what the reader is reading (`Choice.tsx`). **Tabs** are places: a hairline rail
   with ink under the one you are in. A panel answers its own question, except where a tab is
   itself the whole answer ("Everyone"), which opening it settles. **Segmented** is one value with
   a few named states, drawn as a single enclosed track whose filled cell is the state. **Presets**
   are verbs that write values you may then edit, drawn as separate chips with gaps between them;
   the filled chip is the one the fields still hold, and the first edit below puts the fill out. **PickRow** is one candidate in a list too long or too wordy for segments;
   the chosen one is marked by its border.
9. **Neutral looks neutral.** Ratings and impacts are signed percentages around ±0 with diverging,
   center-anchored gauges — a 50% market reads as ±0%, not as "half full".
10. **Hard rules block, guidance warns, hints stay short.** Constraints the contract enforces are
   mirrored as errors that disable the action (locking > 0, editing > locking, rating ≥ locking);
   sensible-configuration nudges are soft warnings with a one-line why (editing ≥ 5 locking windows
   so arguments can be nested and moved into place; rating ≥ a quarter of editing so there is time
   to read). Hover and helper copy is one sentence —
   never state unenforced numbers as if they were rules.
11. **Mechanism-honest copy.** Labels say what the mechanism does ("Underrated ↑ / Overrated ↓",
   "locking · editing · rating", "You profit if the rating corrects your way"); tooltips explain the
   consequence. No moralized or gamified wording that misstates the incentives.
12. **Order by cause, then by time.** Within a group, elements run in the order the things
   happened, left to right: the creator writes an argument and its lock runs down; stake lands on
   it and the rating follows from that stake. So a byline reads identicon, address, lock, and the
   figures read ring then gauge - a causal sentence rather than an arbitrary sweep, and any new
   element joins where its cause puts it. Between groups the roles decide: who made the claim, what
   came of it, and the figures at the trailing edge where a measure belongs. Reading order is a
   free channel; spending it on the mechanism costs nothing and teaches it.

## Decision log

- **2026-09-06 — one settle action, and it is in the top bar.** A finished debate offered two:
  "Redeem all shares" beside the Finished label, and "Redeem & claim bounty share" floating in the
  strip above the thesis card. The second does the first's job and claims fees besides, so the two
  were one transaction wearing two buttons - and the longer label existed only to say it was not
  the shorter one. The claim now takes that slot and stands in for redeeming wherever it is open,
  which leaves it free to be called what it is: **Claim bounty**. The strip keeps the facts it was
  for, the pool and the closing window. (Principle 5, extending the 2026-07-23 entry below.)

- **2026-09-06 — a pill never wraps.** The top bar is a flex row and its pills were the items
  that gave way, so "Tally the debate" shrank until its label broke over three lines - and three
  lines inside a 999px radius is a circle, not a button. The rule holds for every pill in the bar,
  the phase chip and the wallet control included; they broke the same way and were fixed with it.
  Pills keep their width now and the row overflows instead, where the crowding belongs. The label
  lost its object at the same time: the chip beside it already says TALLYING PHASE, so the button
  only has to say the verb. It stays where it is, outlined and next to that chip, for the reason
  `Redeem all shares` does - the action sits on the state it acts on, and a public chore the
  reader pays gas for should not be shouting. (Principles 5, 10.)

- **2026-09-06 — a wallet is asked for where the action is.** An action that needed a wallet asked
  for one by opening the picker in the header, which a modal covers, so "Connect a wallet to make
  one." meant leaving what you were doing and starting it again. The wallets are offered in place
  instead (`ConnectHere`), and the action they were holding up takes their place the moment one
  answers. The picker's openness went back to the header control, since nothing outside it opens it
  any more. (Principles 5, 6.)

- **2026-09-06 — the current preset is filled, not dotted.** The dot sat inside the chip, so every
  chip changed width as the mark moved between them and the row shuffled while the reader was
  reading it. The chip is filled instead: no width, no movement. That leaves fill doing duty in two
  elements, which is fine, because it was never the fill that told a preset from a segment — chips
  with gaps between them against one enclosed track is what does that, and it is visible before
  anything is chosen. (Principle 8.)

- **2026-09-05 — a debate is started in five steps, not five kinds of control.** The create panel
  was a textarea plus a row of chips, and each chip opened a modal built differently from the
  others: presets in one, a bare number in another, a list in a third. Five decisions that make one
  debate looked like five unrelated features, and the reader had to discover each control before
  they could judge it. It is one form now — Thesis, Schedule, Participants, Fee, Bounty — walked
  with Back and Next, where every step but the thesis arrives already answered, so clicking through
  is a complete answer. The steps stay clickable in any order, since none can be left unanswered,
  and the last one carries a one-line summary of what is about to be signed. The four settings
  modals became the step bodies, keeping the timing presets. (Principles 5, 8.)
- **2026-09-05 — one element per kind of choice.** The same chip was doing four jobs: a schedule
  preset (a verb that fills three fields, whose highlight was a coincidence check that silently
  lied after any edit), a bounty token (a real state), the join gate's mode (a real state) and the
  Circles trust rule (a binary toggle). They are now three elements — tabs for places, a segmented
  track for one value with named states, quiet outlined chips for presets — plus one shared mark, a
  dot meaning "your current state is here", which sits on the tab holding the choice and on the
  preset the fields still match, and goes out on the first edit. A preset is never filled, because
  filling is what a state looks like. `Choice.tsx` holds all four so they cannot drift apart.
  *Superseded 2026-09-06:* the current preset is filled after all — see below.
- **2026-09-05 — "Who may join" asks one question, and sends the others away.** The modal used to
  open with two preset chips above a list, so "Everyone" and "Circles humans" were choices while
  everything else was a list. It is now Everyone | Allowlists | Circles | Custom. Everyone needs
  nothing further, so opening that tab is the answer; the other three list what exists and are
  answered by picking a row or writing an address. Making a registry, keeping its members and
  searching Circles are a different question, so the lists link to **Manage registries** rather
  than carrying those controls — the modal that chooses is not the modal that keeps. The gate's
  draft lost its third mode with this: the deployment's Circles registry is a row like any other,
  marked "this network".
- **2026-09-05 — registries are kept in one manager, on two tabs.** They were managed in two
  places at once: the wallet menu kept allowlists, and "Who may join" made both kinds without
  knowing about the other place, so the same list had two homes with different vocabularies. One
  `RegistryManager` now serves both hosts - the wallet menu opens it to keep registries, and the
  join settings embed it to choose one, where selecting a row is the choice (principle 6). The two
  kinds sit on tabs rather than in one column, because a list you write yourself and a graph
  somebody else keeps have nothing in common but the question they answer, and stacked they read as
  one form where the Circles search field looks like part of the allowlist. Tabs are drawn as a
  hairline rail with ink under the current one, so they read as places rather than as more preset
  chips. The pattern follows what other web3 apps settled on: Uniswap separates token lists from
  tokens with tabs in one dialog, Safe's address book takes many entries at once and previews what
  it parsed, and both name the count on the button that applies it.
- **2026-09-05 — accounts go on and off an allowlist as a list, one address per row.** Adding
  thirty accounts through a single address field is thirty transactions where `setMembership` takes
  an array. It began as one paste box, which put thirty accounts and their mistakes in a single
  field; it is now a row per account, and finishing an address opens an empty row below it, so the
  list grows as it is written. Pasting a list into any row still spreads it over a row each — new
  lines, commas, semicolons and spaces all separate — because a list arrives from a spreadsheet
  column as readily as from a message. A lowercase address is accepted, since rejecting a valid
  account over its capitalisation is a puzzle rather than a safeguard, and what is not an address
  is marked on its own row rather than named in a line underneath. The empty row is dashed, like
  every other invitation to add something. The button says how many it will add, and removal is a
  checkbox per row with one "Remove n". (Principles 4, 10.)
- **2026-09-05 — the Circles anchor is found by name, in a field that fits a name.** The search box
  had been sitting in `.duration-inputs`, which sizes its boxes to two digits, so a name search was
  six characters wide. It is now a full-width field, the results say what kind of avatar each is,
  and the choice reads back as one sentence - "Admits Circles humans that Berlin Group trusts" -
  before anything is signed, with the two ways to read trust offered as presets rather than a
  checkbox (principle 7). Searching is a read, so it works without a wallet; only the button that
  makes the registry needs one. (Principle 11.)
- **2026-09-05 — an owner keeps their allowlists from the wallet menu.** A list is the owner's, not
  a debate's, so it is managed where the account is: the account menu gains "Your allowlists",
  which opens the lists the index knows this account owns, the accounts on each, an address to add
  and a Remove per row. Members are labelled with their Circles name where Circles knows one, from
  the same profile lookup the registry picker uses. Every debate that names a list admits from it
  at the moment of joining, so a change here reaches them all, and the hint says the one thing an
  owner must know about that: removing an account bars it from joining afterwards, and leaves the
  debates it already joined alone. (Principle 5: settings live on the value they edit.)
- **2026-09-05 — a creator picks a registry, or makes one, in "Who may join".** The modal used to
  offer three shapes and a bare address field; a creator with a group of their own had to deploy a
  contract elsewhere and paste it. It now lists what exists - the allowlists the connected account
  owns and every Circles registry the factory has cloned, read from the index - and makes new ones
  through the factory: an allowlist in one click, or a Circles registry anchored on an avatar found
  by name. Names come from the Circles profile service (`rpc.aboutcircles.com/profiles/search`, a
  CORS-enabled GET that answers by name or by address and says whether an avatar is a group, an
  organization or a human); `circles_query` on the same host sends no CORS header and would have
  needed a proxy, and indexing the Hub's registrations ourselves would only duplicate the service.
  A registry picked or made here carries the name it was picked by, so the chip says "Circles humans
  Berlin Group trusts" rather than an address. Where the network has no factory the modal still
  offers what exists and simply has no "new" section. (Principles 5, 11.)
- **2026-09-04 — facts are separated by the space between them, not by a mark.** The interpunct
  had spread everywhere two small facts sat on one line - reply counts, the schedule chip, browse
  rows, the bounty line, the stake and compose buttons, the fee note beside the stake hint - and a
  mark that appears that often stops being read and starts being texture. They are now laid out
  with a gap: one `.facts` class, `inline-flex` with a 0.75rem gap, wider than the word spaces
  inside a fact, wrapping between facts and never inside one. Where a gap cannot exist, the copy
  carries it instead: the phase clock's tooltip puts its two deadlines on two lines, since a title
  attribute collapses whitespace but honours a newline. (Principle 1: as little chrome as
  possible - punctuation between elements is chrome.)
- **2026-09-04 — one inset governs every claim box, and it is the page's own gutter.** The focused
  claim held its content 29px from its edge and a card held it 20px on the left and 17px on the
  right, so stacking them in one column - which is what a phone does - stepped the bylines and the
  figures sideways at every boundary. They now share `--claim-inset`, whose value *is* `.debate`'s
  side padding: the distance a reader meets at the edge of the screen is the distance they meet
  again inside a claim, and it narrows with the gutter rather than beside it. Each box subtracts
  the border it actually wears (`--claim-hairline`, `--claim-stripe`), because a card carries its
  stance as a 4px left edge and the arithmetic is what keeps the *content* aligned rather than the
  boxes. Measured after the change: 24px on both sides of the focused claim and of every card at
  full width, 16px at 375px. The narrow layout also forced the row's third track out - three of
  them do not fit a phone - so what came of the claim takes its own line underneath, leaving the
  byline and the figures to keep their columns with the cards below. (Principles 1, 3.)
- **2026-09-03 — the four figures share two nouns: argument/weighted rating, argument/accumulated
  stake.** *Market* was AMM jargon standing in for a figure, and its partner *rating* was an
  unrelated word, so the pair taught nothing and a reader had to be told which was which. Each pair
  now shares a noun and differs by what qualifies it: the **argument rating** is what an argument's
  own market says, the **weighted rating** is that corrected by its sub-debate — weighted twice
  over, by the stake behind each side of the blend (ADR-0011) and by the time each price stood
  (ADR-0013); the **argument stake** is what sits on its own market, the **accumulated stake** that
  plus every sub-argument's. The chart's key, the detail rows, the gauge and the ring arcs all read
  from the same four names, which is what makes the key legible as a 2x2. The rename reverses a
  documented decision - the glossary reserved *rating* for the tally's verdict and listed "rating
  value" under Avoid for approval - so `CONTEXT.md` was rewritten to match, ADR-0014's title with
  it, and the protocol keeps its own identifiers (`approval` is unsigned, the display figure is that
  price centred). Left alone for now: the composer still seeds an argument at an unsigned "Initial
  approval", which is the one place the two scales still meet.
- **2026-09-03 — the focused claim's row is three tracks by role.** Who made the claim and under
  what gate, then what came of it - the arguments beneath, or the finished thesis' outcome - then
  the figures at the trailing edge. The middle track is sized to its content between two equal
  sides, so the consequence holds the centre whether or not the sides are full, and the verdict
  left its own paragraph above the row to sit in it. Principle 12 was narrowed to match: cause
  orders elements *within* a group (creator then lock, stake then rating), roles order the groups.
- **2026-09-03 — the gauge answers as one object, and the rating always leads.** Its two runs each
  carried their own hover, so the saturated run - the bar's own body, and the obvious thing to
  point at - answered "Market +84%" while the grey correction beside it answered "Rating +46%,
  market +84%". Backwards: a reader is on the gauge to learn the rating, whichever half the pointer
  lands on. One label now covers the whole bar, track included, and it opens with the rating. Where
  the argument has a market of its own the label places the rating against it - `Rating +46%,
  market +84%` when they read apart, `Rating +20% (= market)` when they do not, which is also the
  answer to "why does this one show a single figure": nothing has been argued beneath it yet. The
  thesis owns no market, so its label stays the rating alone. This narrows today's rule that a
  drawing's hover is its figure: the *drawing's*, not each piece's - pieces that are two ends of
  one reading share one. (Principles 9, 11.)
- **2026-09-03 — the thesis gets the whole ring, and each arc names its own end.** The thesis used
  to read its stake as text ("Staked 148.60 ⬡") on the grounds that a share of itself is always the
  full circle. That was the argument for drawing it: the full circle is exactly what the debate's
  stake *is*, and it stands as the reference every argument's ring is measured against, so the pair
  of figures now reads the same on the thesis as on any claim - gauge, then ring - and the figure
  moved onto the drawing where every other figure lives. The two arcs also stopped naming the
  difference between them: the second says the branch total (`Staked 46.25 ⬡ with its
  sub-arguments`, not the 12 ⬡ that arc alone spans), because that is the figure a reader measures
  by following the ring from noon, and it is the same number the detail's *With sub-arguments* row
  and the chart's band carry. (Principles 1, 3.)
- **2026-09-03 — every claim is signed, and the byline is one element.** Cards showed a lock but
  no creator, while the focused claim showed its creator at the top and its lock at the bottom —
  so the two views taught different orders for the same two facts. Both now end their meta row
  with one `Byline`: the lock, then the identicon and address, on a card, on the focused argument
  and on the thesis alike (the kicker is left naming the claim's kind). Inside a card, which is
  itself a button, the address is the presentational badge rather than the copy chip — a control
  cannot nest in a control, and the focused claim one click away is where it copies. (Principle 3:
  a recurring element sits in the same place on each thing it recurs on.)
- **2026-09-03 — one `Modal`, and the heading names the dialog.** Eight dialogs each carried the
  same backdrop, heading and cross, and each named itself twice — once as the visible heading, once
  as an `aria-label` on the dialog — and one pair had drifted ("Debate bounty" over "Bounty"). They
  now render through one component whose heading labels the dialog by reference
  (`aria-labelledby`), so a dialog's name is written once. Behaviour is unchanged: the cross and the
  backdrop remain the exits. (Principle 6.)
- **2026-09-03 — hover copy: the drawing names the figure, the term defines it.** The figure hovers
  had grown into paragraphs — a gauge segment carried its figure, a correction, and a two-sentence
  definition; the same definition rode every card in a column; share settlement was spelled five
  ways and the fee's recipient two. The rule now: a drawing's hover is its figure and nothing else
  (`Market +84%`, `Rating +46%, market +84%`, `Staked 12 ⬡ on its own market`); what a figure
  *means* is one sentence on the term it hangs on — the detail's and the stake modal's `dt`s and,
  new, the chart's key — and each definition is a single constant (`lib/impact.ts`; the payout
  rule in `lib/market.ts`, as the formula `(1 + tallied rating) / 2 of a vote token`, which
  "paid by the rating" had misstated; the two ratings were renamed later the same day, see below).
  Vocabulary settled on the glossary: *tallied rating* for
  the settled value ("final" is the lock word), *market* for the argument's own figure, *creator*
  for whoever the fee goes to, *deposit* for what an argument is seeded with, *excess* for what a
  bounty claim is proportional to, *bounty* never "prize" or "pool", *sub-arguments* with a plain
  hyphen, phases lowercase in prose, a debate *finishes*. Hovers that restated their own label
  ("Anyone may join" on "open to everyone", "Debate details" on a button whose aria-label already
  ends in it, "Copied!" beside "copied ✓") were removed rather than shortened. (Principles 9, 11.)
- **2026-09-03 — the thesis opens the debate's detail, and the lock sits where it sits on every
  card.** The thesis' figures now open a view of their own. Its chart is the argument chart in
  thesis form — one line over one wash — because the thesis owns no market and no stake of its own:
  its rating and its stake are its sub-debate's, whole, so an "own" series would draw the same line
  twice. It has no reserves and no author to have earned from them; what it has instead is the
  people. Once the tally has run the view lists every participant by standing, in points — vote
  tokens beyond the 100 granted on joining, which is the contract's own measure (the `excess` a
  bounty claim is paid on) rather than one invented for the screen. Shares not yet redeemed do not
  count until they are, and the view says so. On the focused claim the lock briefly moved up beside
  the kicker; it moved back to the end of the meta row, where every card keeps it. A recurring
  element sits in the same place on each thing it recurs on, or it reads as two elements.

- **2026-09-03 — a correction is drawn only where a sub-debate caused one.** The gauge's pale
  segment means "this is what the sub-arguments did to the price", so it must not appear where
  there are none. It was appearing: once the tally has run, a settled rating is time-weighted and
  so parts from the closing price even for a leaf (ADR-0013), and the gauge was drawing that gap as
  though sub-arguments had made it — and handing them the bar's rounded end while it was at it, so
  an undebated argument ended square, as if something continued past it. The test is whether any
  stake sits beneath the argument; without it the bar is simply the rating, ending where it stops.
  One consequence worth stating: on a leaf the card now shows the rating rather than the market,
  and the two figures are only ever drawn together where the difference is something a reader can
  act on. (Principles 1, 9.)

- **2026-09-03 — the argument detail view became a history, and the figures moved to where they
  are read.** Three changes, one thread: each figure belongs where it is answered.

  *Parent impact left the cards.* It is the one figure that is not about the argument you are
  looking at — it says what this argument does to its parent's rating, which is a fact about the
  parent. On a card, beside a gauge and a ring that are both about the argument itself, it read as
  a third figure of the same kind. It now sits in the detail view, where the reader has already
  asked about this argument specifically.

  *"Rating market" became "Argument details", and the constant-product curve went with the name.*
  The curve drew the invariant the AMM is implemented with. Nobody staking needs it: what they need
  is what the stake would do, which the stake modal's slider already shows, and what the argument
  has done, which is the chart that replaced it. A visualisation of the mechanism is not a
  visualisation of the decision. (North star: remove noise.)

  *The chart is one plot with two axes, not two stacked plots.* Both were built; the pair with a
  shared x-axis separated the two questions cleanly but doubled the vertical cost of an answer, and
  the whole point is to read the verdict against the weight behind it. The left axis is the signed
  ±100% every other figure uses — always the full range, never fitted to the series, so two
  arguments' charts are read against one ruler. The right axis is stake from zero to the debate's
  whole, and the x-axis the rating phase opening to close, for the same reason: an axis fitted to
  its series rescales itself per argument, so a flurry inside an hour and a week of steady
  correction would draw the same picture. The empty stretch to the right of a live argument is the
  time still left to correct it, which is worth seeing; a thin mark stands where the chain's clock
  is, and once the window has closed there is nothing left to mark. Ratings are lines because a rating moves either way; stake is two
  stacked washes because it only accumulates and an argument's own is always part of its branch's,
  which makes the paler band exactly what its sub-arguments hold — the ring beside it, unrolled.
  The washes are laid down first and held faint: the stake is the weight behind the verdict, so it
  belongs behind it. That same device does the highlighting: reading one pair sends the other back
  rather than bringing the read one forward. Weight was the alternative — thicker lines, bolder
  ticks — and it was rejected twice over: it would be a second device where opacity already carries
  depth here, and in a plot read for values a thicker line widens the very thing being measured.
  Nothing changes size or hue; only attention moves. The one place a flat multiplier failed is the
  washes, which start too faint to survive it, so they step forward on their own scale when they
  are the pair being read. Every series steps rather than slopes, because nothing accrues between stakes
  and a filled ramp would draw an accumulation that never happened.

  *The figures are read off the plot, not listed beside it.* The key names the four series and
  nothing more; touching one reveals its pair's two figures at the instant under the pointer, on
  the curve, with a dot marking the value and a crosshair saying when. Two decisions inside that.
  The figures come in pairs because on this plot one is only meaningful against the other — a
  rating says little without the price it corrects, an argument's own stake little without its
  branch's — so picking up either member shows both. And they are read *at an instant* rather than
  pinned to the curve's end, which would have to be the closing projection: for a settled argument
  that parts from the settled rating (ADR-0013), so an end-label would contradict the card's gauge.
  A reading at a moment cannot. A source that keeps no stake history draws no chart, and there the
  fact list still states the figures.

  Nothing on the chart is stored. A stake is exactly invertible, so the series are rebuilt by
  walking the indexed stakes backwards from the state we can see — no new field, on-chain or in the
  schema. Every point is the tally's projection at that instant, never the settled figure spliced
  onto the end, which would put a step in the line that no stake caused. (Principles 1, 9.)

- **2026-09-03 — the card figures are drawn, not written; the drawing is the affordance.** Market
  and Rating became one centre-anchored gauge and the stake became a ring, both on the cards and on
  the focused claim. The gauge fills from neutral to the argument's own market price in its stance
  colour, then draws what the sub-debate did to that price over or beyond it. That correction is
  `stone` grey where it only pulled the argument back toward neutral — conviction was taken away and
  none of it landed on a side, so nothing borrows a stance colour. It takes `pro-pale` or `con-pale`
  where it *added* to the bar, carrying the argument further from neutral or across it, naming the
  side the conviction landed on. That is what keeps principle 2 intact with the correction drawn at
  all: the stance hues still mean a side, never a direction of travel. Zero is marked in `slate`,
  standing half a figure-gap clear of the bar top and bottom — the bar already carries two greys of
  its own, and the axis' one fixed point must not read as a third. The
  corners carry meaning rather than style: a round cap is where the bar stops, a square one is where
  it continues — into the centre line it grows out of, or into the segment beside it. So a bar cut
  short by its sub-debate is distinguishable from one that simply ends there, without a number. The ring
  runs clockwise from noon: the argument's own stake in `bark`, its sub-debate's continuing it in a
  lighter grey, the two together its share of every stake the tally counts. The figures themselves
  now open the rating market, so the info chip beside them is gone (reversing the 2026-08-18
  affordance): the thing you want explained is the thing you click.

  This re-opens what the 2026-08-18 entry closed. That entry retired a diverging bar because "a
  labelled signed percentage says what the bar said, and the bar could not show two figures" — the
  bar can show two now, which is the whole point of it, and the third figure (Parent impact) stays a
  labelled percentage because it is about the *parent*, not about this argument's own standing. The
  numbers did not go away; they moved to hover, and to the aria-label of whatever wraps them.

  The thesis takes neither treatment whole: it owns no market, so its gauge is one saturated bar,
  and a ring would be the debate's stake as a share of itself. Its figure stays the number, read as
  engagement — how much the question drew, rather than which way it went.

  Two accountings had to be kept apart. The rings divide by the stake **the tally counts** (the
  thesis' subtree weight), because that is where their arcs come from and a denominator including
  drafts would give arcs that cannot fill their own circle. The thesis' figure counts every stake,
  drafts included, because engagement is not the tally's question. (Principles 1, 2, 9.)

- **2026-08-18 — three figures, defined once: Market, Rating, Parent impact.** The headline number
  had three different names for two different quantities — the thesis said "net impact", an argument
  said "Market approval", and a card said nothing at all (a diverging gauge bar). They are now one
  family of subcomponents (`components/Figures.tsx`) used by the cards, the focused claim, the
  ancestry rail and the stake preview, so the same quantity looks the same everywhere:
  **Market** (what an argument's own market says), **Rating** (the debate's verdict on it — that
  market corrected by its sub-arguments, and what its shares settle against), **Parent impact**
  (what its rating moves its parent by). Market and Rating are shown as a **pair, market first**:
  where they agree the argument stands as priced, and where they part the sub-debate is the
  difference — debate 1's objection reads `Market +40% · Rating −30% · Parent impact ±0%`, the
  whole mechanism in one line. The thesis owns no market, so it shows Rating alone, on the left
  where "Rated through its arguments" used to sit. Michael proposed "Own"/"Adjusted" for the pair;
  countered with Market/Rating because *Rating* has to stay the word the thesis, the on-chain
  field and the settlement all use, and *Market* names the source rather than the relationship —
  and it points at the info chip beside it, which opens the Rating market. Each figure carries the
  stake behind it **after a comma, not as a separate bulleted item** — `Market +40%, 33⬡`, the
  argument's own market; `Rating −30%, 93⬡`, its whole sub-debate's, which is what the tally weighs
  the blend by. The comma binds the stake to the figure it backs instead of leaving it floating
  between two of them (parentheses were tried first and read as an aside rather than as part of the
  figure), and the ⬡ sits tight against its amount — it is a unit, not a following word; and the rating's is drawn only once a sub-debate has actually added
  to the market's, since until then it would just repeat the number before it. The approval gauge was
  retired with its CSS: a labelled signed percentage says what the bar said, and the bar could not
  show two figures. (Principles 8, 11; the north star's "every addition must pay for itself" —
  this one replaced a bar and a label with two facts.)
- **2026-08-18 — every hover is one sentence, and copy says a thing once.** Principle 10 asks for
  one-sentence hover copy and the market vocabulary had drifted past it: `IMPACT_HINT` ran four
  clauses, the info chip's tooltip listed the modal's whole contents (a tooltip is a label, not a
  table of contents - the dialog it opens says the rest), and the market detail's closing
  paragraph re-printed the two reserve figures already listed a row above. All trimmed to one
  sentence each; the detail's paragraph now states the rule ("correcting can gain at most the
  reserve on that side") and lets the Reserves row carry the numbers. (Principles 9, 11.)
- **2026-08-18 — staking is a modal with one signed slider that shows what the stake would do
  before it is sent.** The inline panel (amount + two firing buttons) asked for a number blind:
  nothing said what 5 ⬡ or 40 ⬡ would move. One `Stake ⬡` button on the focus meta opens a
  dialog whose one control is a slider on a signed axis - the same diverging, centre-anchored
  scale as the approval gauge (principle 9): left of centre calls the argument overrated (bad-
  argument shares), right underrated (good-argument shares), the distance is the amount, and the
  track fills from the centre to the thumb in that direction's stance colour, a signed number
  field beside it for precision. Under it, three rows read as before → after - market approval,
  impact on parent, fee to the author - recomputed with the contract's own integer quote
  (`previewStake`, fee rounded down, bought reserve rounded up) and the tally mirror on the tree
  with that one market moved. The confirm button takes the direction's colour and names the
  trade with a stroke arrow (`Stake 40 ⬡ · Overrated ↓`); at the neutral rest it only says to
  move the slider. The impact row is a projection and the hint says so: the tally weighs prices
  by how long they stood, so a late stake moves the final rating less than shown. Tried and
  dropped the same day: two stance-coloured direction radios above a one-sided slider (two
  controls for one decision, and the radios pre-selected a direction). Rejected: two direction
  buttons that each open the modal pre-committed (no comparing the directions inside), and
  keeping the panel inline with the preview under it (the debate view grows for everyone, staker
  or not). (Principles 1, 6, 8, 11; north star: detail on demand.)
- **2026-08-18 — the stake modal's figures stay live: the markets are refetched every 5 s while
  it is open.** A stake decided on a five-minute-old price is a stake against a market that may
  no longer exist. The app-wide poll stays at 30 s (it resolves every text and reads the bounty
  and clock); the modal adds a light read of only the market columns (`DebateSource.markets`: one
  indexer query, or `getArgument` per argument on the chain fallback), merged into the tree by id
  (`withMarkets`) - so the before → after rows and the balance move under the reader's hands when
  someone else stakes, and stop the moment the modal closes. A full refresh that starts meanwhile
  wins over a market read still in flight. Rejected: 2 s (2.5× the reads for a difference nobody
  acts on) and no extra polling (the modal could sit on a stale price for half a minute).
  (Principle 6; north star: the figures are the interface, so they must be true.)
- **2026-08-18 — the market detail lists its facts one under the other, the author's fees among
  them.** The one-line readout (`rated +40% · reserves 6 good / 14 bad · pool 33 ⬡ · fee 5%`) had
  become a sentence of figures; it is now a label/figure list - market approval, staked,
  reserves, fee - plus a row the detail never had: what the fee has earned the author so far.
  That figure is the lifetime sum over the argument's stake history (the index keeps every stake
  with its fee), not the standing `fees` balance the author's claim zeroes; the chain-only
  fallback can offer no more than the balance and says so in the code. The upside is no longer a
  row: it *is* the reserve on that side (the most a correction can free), so listing both showed
  the same two numbers twice, and Michael found "reserves" - the shares sitting in the market -
  the more intuitive name; the hint gives the upside reading in words. "Pool" became "staked" to
  match the meta line. (Principles 5, 11.)
- **2026-08-18 — the upside moved into the market detail, which opens from a round info chip on
  the approval figure.** The per-direction upside (`upside ↑6 ↓14 ⬡`) is mechanism-exact but asks
  the reader to already know what a reserve is - too much for the card and the meta line, where
  it competed with the three figures that carry the argument's story (approval, staked, impact on
  parent). Cards drop it; the focus meta stays one line and the detail opens from a small round
  `i` right after `Market approval +40%` - the same chip the bounty's top-up plus is (`.round-chip`:
  hairline circle, stroke glyph in `currentColor`, centered on the figure's cap height), sitting on
  the value it explains. Tried and dropped the same day: a second meta row carrying a `Rating
  market →` text link - a whole row for one affordance, and a text link reads as navigation, not
  as "more about this number". Rejected earlier: keeping a smaller upside on the cards as the
  rater-attention beacon (2026-07-22) - the beacon was not read as one, and the detail is one click
  away from every focused argument. (Principles 1, 5, 11; north star: detail on demand.)
- **2026-08-18 — the metric labels say what a newcomer would say: staked, impact on parent, net
  impact.** "Weight" named the tally's own concept (a subtree's share of its siblings' stake), which
  a reader meets nowhere else on the screen; the figure it labels is the vote tokens staked on the
  argument, so it now says `staked 33 ⬡`, and the bare `33 ⬡` on cards and in the rail names itself
  on hover. "Sways parent" was the protocol's verb (ADR-0012's rating/sway) and read as jargon;
  the same figure is now `impact on parent`, the thesis figure `net impact`, and the tooltips
  explain in the same words. The protocol vocabulary stays in the code and the ADRs — the label
  is a translation, not a rename. (Principle 11.)
- **2026-07-30 — the ancestry rail expands to the full parent claims.** Kialo's "show the parents up
  to the thesis" affordance, spoken in the rail's own vocabulary: a quiet `Expand path` chevron sits
  on the connector that meets the focused claim, and opening it unclips every ancestor — the whole
  claim, wrapped, followed by the rating it carries (`+48% · 86 ⬡`). The thesis shows no figures; it
  is rated through its arguments. Collapsed stays the default (the one-line ladder is the
  breadcrumb), and the choice is held by the view, so it survives navigating the tree. Expanded
  claims drop the link underline for a hover one — a wrapped claim is a block of text, not a link —
  and the measure is capped at 62ch so a deep path still reads as a column. Rejected: repeating the
  parents as full argument cards with gauges (kialo's form), which would out-shout the focused claim
  the page exists for. (Principle 5 — the affordance sits on the path it opens; north star: context
  on demand.)
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
  (Principle 11.)
- **2026-07-23 — "pot" became "upside".** "Pot" said poker — a posted prize someone must win.
  The figure is the mechanism-exact *bound on the gain* available per correction direction (the
  reserve the bought side can free), which "upside" states honestly; it also reads naturally with
  the directional split (`upside ↑1 ↓104 ⬡`). (Principle 11.)
- **2026-07-22 — the winnable pot is the rater-attention beacon; the curve lives in a detail
  modal.** Every argument card carries a quiet `pot n ⬡` (the larger correction prize; both
  directions on hover), and the focus meta shows the split (`pot ↑1 ↓104 ⬡`) as a chip opening the
  market detail: the constant-product curve as a parametric plot (con shares right — "bad
  argument", pro shares up — "good argument", the market as a point on `pro·con = k`), reserves,
  pool, fee, and the per-direction pot. The pot is the reserves — mechanism-exact bounds on what
  correcting the market can free — surfacing the attention signal the design already pays
  (deposit + mispricing) instead of adding a purchasable one (per-argument bounties were analyzed
  and rejected: contracts incentives.md §9). Stance colors mark the two directions; the plot stays
  ink. (Principles 1, 2, 5, 11; north star: detail on demand, cards stay scannable.)

- **2026-07-21 — the market fee is a third settings chip, defaulting to 1%.** The contract made the
  fee a per-debate creator parameter (contracts ADR-0010); the create form exposes it as `fee 1% ⚙`
  beside the schedule and bounty chips — same live modal pattern, one field, hard-blocked only at
  the contract's own bound (integer 0–99). The default is 1%, not the old flat 5%: the debate-4
  forensics showed 5% eating the whole thin-market upside, and 1% is where the replayed trade turns
  profitable. The stake panel's fee hint now quotes the debate's actual fee ("no market fee" at
  zero) instead of a hardcoded 5%. (Principles 5, 6, 9, 11.)

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
  (Principles 5, 6, 11.)
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
  faked with hardcoded prices. (Principle 11.)
- **2026-07-15 — the bounty is a second chip with the same live modal.** The create form's bounty
  affordance mirrors the schedule chip exactly: the chip is the value ("no bounty" / "bounty 50
  USDC"), the modal edits live (preset token chips WETH · USDC · EURC, any ERC-20 by address, the
  amount in human units). Elsewhere the bounty stays in the meta lines - browse rows and the thesis
  meta show the pool in quiet mono; the only bold affordance is the finished-debate
  "Redeem & claim bounty share" button, one transaction for settle-and-claim, mirroring the
  contract's one-shot claim. (Principles 5-7, 11.)
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
  glyph, same characters, same stance colors (tooltip spells it out). (Principles 2, 11.)
- **2026-07-15 — unresolved content links to its `ipfs://` URI.** The digest fallback used to copy
  the CID; it now opens `ipfs://<cid>` in a new tab so an IPFS-enabled browser or extension can try
  providers beyond the app's gateway. The full digest stays on the tooltip. (Principle 11.)
  *Superseded 2026-09-02:* the chain carries the text itself, so there is no digest to fall back to
  and the fallback is gone. What replaced it is the byte budget beside each composer — the same
  concern (say what the chain will accept) moved to where the text is written.
- **2026-07-15 — the focused argument shows its lock state.** The focus meta ends with the same
  countdown padlock the cards carry — a focused draft was indistinguishable from a final argument.
  One shared `LockChip`; the thesis (born final, no draft lifecycle) shows none. (Principles 1, 3.)
- **2026-07-15 — a draft's reply slot stays empty.** "Undebated" is reserved for *final* childless
  arguments: a draft cannot be replied to yet (nesting needs a locked-in parent), so claiming it
  is undebated misled — its countdown padlock owns that story until it locks in. (Principle 11.)
- **2026-07-15 — pro/con cards are row-paired.** The two columns are subgrids of one shared grid:
  the i-th pro and con cards sit in the same row and get the same height, the meta row is pinned
  to the card's bottom edge, and the composers meet on the last row — so gauges, locks, and reply
  counts line up across the columns at any text length (font sizes untouched). On the stacked
  mobile layout the spans flow sequentially and every row sizes to its single card. (North star:
  the overview stays legible at a glance.)
- **2026-07-15 — a card without children reads "Undebated".** "No replies yet" was forum language;
  the tree speaks of arguments beneath a claim. One quiet, domain-true word that doubles as an
  invitation to argue; cards with children keep "n pro · n con →". (Principle 11, north star.)
- **2026-07-15 — authored texts are capped at 250 characters, budget always visible.** Theses and
  arguments share one hard cap (`MAX_CONTENT_CHARS`): one sharp claim per box — depth belongs in
  the tree, not in paragraphs, and short cards keep the overview scannable (north star). The input
  simply stops at the limit, and the mono `n/250` counter at the end of the action row is always
  shown, so the medium's size is clear from the first character. (Started as 140 with a counter
  appearing only near the limit; 250 gives claims room to breathe and the permanent budget is more
  predictable than one that pops in.) (Principles 3, 10.)
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
  soft guidance ratios of principle 10. The rating ≥ editing/4 nudge is a heuristic — what really
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
  approval reads as −100%..+100% around ±0, matching the impact figures; the gauge diverges from the
  center. Display-only — the contract keeps its 0..1 price. (Principle 9.)
- **2026-07-11 — rating controls relabeled "Stake n ⬡ · Underrated ↑ / Overrated ↓".**
  "Invest pro/con" implied agreement; staking on a correction is stance-free. (Principle 10.)
