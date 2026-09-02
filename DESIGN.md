# Design notes

Design system for the Deliberate debate viewer (first pass, 2026-07-10). Layout skeleton is
brief-pinned to kialo.com (focused claim, pro/con columns, drill-down); distinctiveness is
spent on the rail, the type, and the market-as-ledger presentation.

## Tokens

| Token | Value | Role |
|---|---|---|
| canvas | `#F6F7F4` | page background (leaf-underside paper) |
| ink | `#22301F` | text (fir) |
| pro | `#31703F` | supporting polarity (leaf) |
| con | `#A5432C` | attacking polarity (redwood oxide) |
| bark | `#7A7568` | metadata |
| hairline | `#E3E6DE` | borders |
| stone | `#B4B1A7` | a sub-debate correcting a rating without changing its side |
| pro-pale | `#8CBF95` | a correction carrying a rating up across neutral |
| con-pale | `#E3CABE` | one carrying it down across neutral |

Type: **Fraunces** (display: wordmark, focused claim, column headers) · **Public Sans**
(body — civic typeface) · **IBM Plex Mono** (market figures, addresses).

## Signature

The **ancestry rail**: the path from thesis to focused claim drawn as a branch, each `└─`
connector colored by that step's polarity. It is the breadcrumb, but it encodes the tree.
It also opens: a chevron on the connector meeting the focused claim expands every parent up to
the thesis into its full text and rating (kialo's context stack, in the rail's own vocabulary).

## Tried / decided

- Gauge remainder was `--con-wash` (#F7EEE9) — invisible on white cards; hardened to `#E3CABE`,
  which is now the `con-pale` token the rating gauge's correction uses.
- One motion moment only: columns settle (160 ms) on focus change; reduced-motion disables it.
- Rejected: dark theme, sunburst tree visual (kialo's), numbered markers, cream+terracotta default.
- Not yet tried: screenshot-based critique (no Playwright in this environment yet).
