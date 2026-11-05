# ADR-0002: Frontend screens and features

Proposed.

## Context

`apps/web` is the website every follower and caller uses: browse calls, copy one, publish one,
track positions. This ADR fixes what the frontend contains before any of it is written, so the
API (`apps/api`) and the frontend agree on the same screens and states.

The frontend is built first with dummy data, then switched to the API screen by screen.

## Decision

### Look

Dark only.

| Token | Value |
|---|---|
| Background | `#04090e` |
| Sidebar | `#060c12` |
| Surfaces | `#081018`, `#0f1720`, `#0e212f` |
| Lines | `#121c26`, `#1b2733` |
| Ink, muted, faint | `#eff1f4`, `#8799a8`, `#53626f` |
| Steel, silver | `#6e9fcb`, `#c0c9ce` |
| Entry | `#4baefb` |
| Good, bad, warn | `#3ecf8e`, `#ff4566`, `#fdb529` |
| Brand gradient | `#0c1c2a` → `#24496b` → `#4f7ea6` → `#c3cbd2` |

- Square corners. Inter for text, Geist Mono for addresses and hashes.
- Primary action is a silver button; one per view.
- Brand mark, wordmark, verified badge, nav icons, wallet logos and token logos live in
  `apps/web/public/`.
- Token prices are candles only: KLineChart for full charts, a small candle strip in tables.
- Explanations live behind ⓘ tooltips, not paragraphs under inputs.
- Every page passes `sloplint` (Hallmark) with 0 FAIL before merge.

### Shell

- Sidebar: Explore, Callers · Calls: Publish a call, My calls · Account: Portfolio, Profile ·
  Support, Settings · user and wallet at the bottom.
- Top bar: breadcrumb, USDC balance on Arc, notifications, Publish a call.

### Screens

| Route | Screen | What it does |
|---|---|---|
| `/` | Redirect | Sends to `/explore` |
| `/onboarding` | Get started | Welcome, connect (Privy: wallets or email), verify (World ID, skippable for followers), done |
| `/explore` | Explore | Boosted calls (SF 70+), all calls table with Live, Upcoming, Settled filters, search, sort, period, markets row |
| `/c/[id]` | Call | Price strip, candle chart with entry band, target and stop, copy panel, caller card, Copies and About tabs (thesis, timeline: Arkiv record, entry filled, ended, settled in Hisaab) |
| `/compose` | Publish a call | Market picker, candle chart with draggable levels, long or short, target, entry, stop, entry band, expiry, thesis, boost, what you keep if right or pay if wrong, review step |
| `/markets/[address]` | Market | Price, 24h, $1k price impact, liquidity, candle chart with volume, open calls on this market, make a call |
| `/callers` | Callers | Ranked table: SuperFactor, last 10, open calls, followers made, in profit, fund, follow |
| `/u/[handle]` | Caller profile | Identity and verified badge, SuperFactor, stats, all calls including deleted posts, how SuperFactor is computed |
| `/me` | Portfolio | Following tab: open positions with close now, history with fee back and credit. Calling tab: your calls, earnings, your fund |
| `/profile` | Profile settings | Username, display name, X link, email, World ID, publishing wallet, caller record |
| `/m/[id]` | Copy popup | Opened by the extension's Copy button: the call at a glance, copy panel, bought confirmation that closes itself |

Overlays: wallet connect, notifications, toast, share call.

### Components

- **Call card** (Explore, profile): header with token, pair, side and time left; price now and
  move vs entry; status bar from stop to target with entry tick and live dot; Stop, Entry,
  Target in three columns; caller, SF and amount copied in the footer.
- **Copy panel** (Call page, popup): header "Copy · Market"; amount with available balance;
  0 to 100% slider; take profit and stop loss locked as set by the caller; estimated result at
  each; refundable call fee with ⓘ; one green "Copy long ETH" button.
- **Price strip**: Price, Entry, Target, Stop, Ends in, spaced with dividers.

### Copy panel states

From `@supercall/core` call status, never recomputed in the browser:

| State | Shown |
|---|---|
| Posted, armed | Opens when the caller is in |
| Live, in entry band | Copy form |
| Live, out of band | Paused, notify me when it's back |
| Target too close | Scored only, can't copy |
| Short | Scored only until shorts are supported |
| Ended | Result and settlement |

### Dummy data

- `apps/web/lib/mock/` holds typed fixtures: calls in every status, callers, copies,
  positions, markets, candles.
- Types come from `@supercall/core` and `@supercall/api-schema`, so fixtures fail typecheck
  when the shapes change.
- One data module (`lib/data.ts`) reads from fixtures while `NEXT_PUBLIC_DATA=mock`, then from
  `apps/api`. Screens never import fixtures directly.
- Fees, cuts, SuperFactor and copyability come from `@supercall/core`, even on dummy data.

### Build order

1. Tokens, fonts, logos, shell (sidebar, top bar).
2. Explore and the call card.
3. Call page and the copy panel with all states.
4. Copy popup.
5. Publish a call.
6. Callers, caller profile.
7. Portfolio, profile settings, onboarding.
8. Market page.

## Not in this ADR

- The extension's card under a post on X (its own ADR).
- The landing site.
- Deposits: ADR-0001 says no deposits in v1. The top bar shows the USDC balance only.
- Light theme.

## Consequences

- The API can be built against the screens and states listed here.
- Screens ship with dummy data and switch to live data one at a time without UI changes.
