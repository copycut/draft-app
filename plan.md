# MTG Draft Night — Score Tracker

MTG stands for Magic: The Gathering.

## Goal

A single-night score tracker for an in-person MTG draft, used on an iPad
(landscape) and hosted on GitHub Pages. No backend — all state lives in
`localStorage` so the page can be reloaded mid-event without losing data.

## Tech stack / file structure

Plain HTML/CSS/JS, no framework, no build step.

- `index.html` — markup only
- `style.css` — styling
- `script.js` — app logic

Must run as static files directly from GitHub Pages (no bundler, no npm
install step required to deploy).

## Data model (localStorage)

Persist a single JSON object under one localStorage key, e.g. `mtg-draft-night`:

```js
{
  players: [
    {
      id: "uuid-or-timestamp",
      name: "Player name",
      deck: "Deck name"
    },
    ...
  ],
  matchLog: [
    {
      id: "uuid-or-timestamp",
      round: 1,
      player1Id: "...",
      player2Id: "...",
      result: null // null (pending) | a player's id (that player won) | "draw"
    },
    ...
  ],
  currentRound: 1,
  ended: false,
  screen: "select", // "select" | "draft" | "tournament"
  draftMode: 8,      // 4 | 8 — chosen on the player-count screen
  draft: {
    pack: 1,      // 1-3
    pick: 1,      // 1-picksPerPack(draftMode)
    phase: "pick" // "pick" | "review"
  }
}
```

Wins/draws/losses/points are never stored directly — they're always derived
by scanning `matchLog` for entries involving a given player (see Score entry
below). This keeps a player's record consistent with what's actually been
recorded in the log instead of two copies that can drift apart.

Every mutation (add player, delete player, set a match result, generate
pairings) must immediately persist to localStorage. On page load, rehydrate
the UI from localStorage if present; otherwise start empty.

## Features

### 1. Player count selection

The very first screen, before the draft timer or any tournament UI: exactly
two buttons, "4 Players" and "8 Players". Nothing else on this screen — no
skip option, no back button (use "Clear data" to restart if the wrong count
gets picked, same as any other one-way choice in this app).

- The choice is stored as `state.draftMode` (4 or 8) and persisted.
- It sets how many cards each player takes per pick during the draft (see
  Draft phase below), which in turn determines how many picks a 15-card pack
  yields: 4 players take 2 cards per pick → 7 picks per pack (1 card left
  over, undrafted); 8 players take 1 card per pick → 14 picks per pack (also
  1 card left over — the pack's very last card is never drafted, by design).
- It also becomes the required roster size for the tournament: "Generate
  next round pairings" (see Swiss pairing below) now requires exactly
  `draftMode` players, not a generic "4 or 8" — the draft and the tournament
  always agree on how many people are at the table.
- Tapping either button sets `state.screen = "draft"` and resets
  `state.draft` to `{ pack: 1, pick: 1, phase: "pick" }`, moving straight
  into the draft phase.

### 2. Draft phase (pick timer)

Once a player count is chosen, the app shows a full-screen pick timer
covering the physical card draft: 3 packs of 15 cards each, split into
picksPerPack(draftMode) picks per pack (7 for 4 players, 14 for 8 — see
Player count selection above). The rest of the app (standings, pairing
controls, match log, players, footer) stays hidden behind this screen until
the organizer finishes or skips it.

- Per-pick countdown, keyed by how many cards are left in the pack before
  that pick (same table regardless of player count): 60s at 15 cards, 50s at
  14-13, 40s at 12-9, 35s at 8-7, 30s at 6, 25s at 5, 20s at 4, 15s at 3, 10s
  at 2-1. In 8-player mode (1 card per pick) this plays out over all 14
  picks in order; in 4-player mode (2 cards per pick) each pick jumps two
  cards down the same table, so the countdown drops faster pick-to-pick.
- Between packs, a review period with its own countdown: 30s after Pack 1,
  45s after Pack 2, 60s after Pack 3 — unaffected by player count.
- The countdown does **not** start automatically for a new pick or review
  phase — it sits at the full duration until the organizer taps "Start,"
  which then becomes "Pause"/"Resume" for the rest of that phase. Advancing
  to the next phase is likewise always manual — a countdown reaching 0 just
  freezes there and waits for an explicit tap, rather than auto-advancing or
  going negative. Every new phase resets back to a fresh, unstarted "Start"
  state.
- A single contextual button drives advancement, its label reflecting what
  happens next: "Next Pick" mid-pack, "Start Review" on the pack's last pick,
  "Start Pack N" from a review period before the last pack, and "Start
  Tournament" from Pack 3's review — the only way into the tournament screen
  besides the skip button below, and always an explicit tap, never automatic.
- A pass-direction reminder shows during the pick phase (standard MTG
  convention): Pack 1 and Pack 3 "Pass to your left", Pack 2 "Pass to your
  right".
- A "Skip to tournament" control, available at any point on this screen,
  jumps straight to the tournament screen behind the same confirmation modal
  used elsewhere (End tournament, Clear data, Delete player).
- `state.screen` (`"select"` | `"draft"` | `"tournament"`, default
  `"select"`) tracks which screen is showing and is persisted, so a reload
  doesn't lose the transition. `state.draft` (`{ pack, pick, phase }`)
  tracks progress through the pick sequence and is also persisted — but the
  live countdown value itself is not; a reload simply restarts the current
  pick/review phase at its full duration, an accepted simplification.
- "Clear data" resets `screen` back to `"select"` and `draft` back to
  `{ pack: 1, pick: 1, phase: "pick" }`, so the next tournament night starts
  on the player-count screen again.

### 3. Player management

- A form/control to add a player: player name + deck name. Adds a new row to
  the table.
- Each player row is a **read-only** summary derived from `matchLog`: rank,
  name, deck name, wins, draws, losses, points. There is no direct score
  entry on this table (see Score entry below) — just a Delete action per row.
- Rows are sorted by current standing (same comparator as Top 3, including
  the head-to-head tiebreak — see Standings below) and numbered #1, #2, ...
  on the left. Re-sorts live whenever a result changes.
- Players can be added freely before the draft starts. The "Generate next
  round pairings" button (see Swiss pairing section) is disabled until the
  roster has exactly `state.draftMode` players (see Player count selection
  above) — no other count is valid.
- The "add player" form itself hides entirely once the draft starts (round 1
  pairings generated) instead of just disabling — the roster is locked in at
  that point. Reappears once "Clear data" resets the app for the next
  tournament.
- Each player row can be deleted (e.g. to correct a typo'd entry), behind a
  confirmation modal. The Delete button itself hides (not just disables)
  once the draft starts, same as the add-player form — removing a player
  after match results reference them would corrupt the log. Since the
  tournament can only be ended after starting, this same hide also covers
  the ended state; no separate check is needed.

### 4. Score entry

Scores are **not** entered on the player table — they're assigned directly
on each pairing in the match log (see Match log below), since that's where
the actual result belongs. For a given match:

- A button with the player's name, next to each of the two players — tapping
  it marks that player as the winner of the match.
- A single "Draw" button for the match — tapping it marks the match a draw
  for both players.
- Only one of these three states can be active per match at a time; tapping
  the currently-active one again clears it back to pending (undo/correction).
- Losses are never entered directly — they're implied: in a match with a
  declared winner, the other player is automatically credited a loss.
- Every change writes through to localStorage immediately, and the players
  table's wins/draws/losses/points (see below) recompute live.

### 5. Reset

- A "Clear data" button (separate from score entry, e.g. in a header/footer
  toolbar) that wipes the localStorage key and resets the app to its empty
  state. Must be behind a confirmation modal since it's destructive and
  irreversible.

### 6. Standings / Top 3

Displayed prominently above the table.

- Ranking metric: standard match points — **3 points per win, 1 point per
  draw, 0 points per loss**. Sort players descending by total points.
- Show the top 3 players (name + deck + points). Update live as scores change.
- Tie-break: if points are equal, check whether the two tied players played
  each other (`matchLog`) and it was decisive (not a draw) — the winner of
  that match ranks higher. If they never played, or it was a draw, fall back
  to original add order (stable sort). This is a lightweight stand-in for a
  full tiebreak system (e.g. opponents' match win %) — good enough for a
  small pod, but doesn't resolve 3-way cycles (A beat B, B beat C, C beat A)
  cleanly; that's an accepted limitation, not handled specially.
- This same comparator is also used to sort players before Swiss pairing
  (see below), so the pairing order and the displayed standings always
  agree.

### 7. Swiss pairing suggestions

A "Generate next round pairings" button that proposes matchups for the next
round. Disabled unless:

- the roster has exactly `state.draftMode` players (see Player count
  selection and Player management above — always even, so the app never has
  to handle an odd player count or byes), **and**
- every match in the most recently generated round has a recorded result
  (win or draw) — pairing round N+1 by standing requires round N's points to
  actually be final, so the button (and its hint text) blocks until then.
- the tournament hasn't been manually ended (see End tournament below).

Pairing logic:

- **Round 1 is fully random**: shuffle all players randomly into pairs
  (1v2, 3v4, ...). Standings-based pairing doesn't make sense yet since
  everyone is tied at 0 points.
- **Round 2+ uses standings + rematch avoidance**:
  - **Pair by standing**: sort players by current match points (same metric
    as standings), then pair adjacent players in that order (1v2, 3v4, 5v6,
    ...).
  - **Avoid rematches**: prefer opponents who haven't already played each
    other this night (check `matchLog`). If a straight standings-order
    pairing would repeat a match, swap with the next closest eligible
    opponent. If no rematch-free pairing is possible for someone, fall back
    to allowing a repeat rather than blocking pairing generation.
- On generation, append the new round's pairings to `matchLog` and increment
  `currentRound`.

### 8. End tournament

- An "End tournament" button, next to "Generate next round pairings", that
  manually closes out the night — the organizer decides when to stop rather
  than the app inferring it (e.g. from a full round-robin), since the Swiss
  pairing here doesn't guarantee a clean/predictable stopping point.
- Enabled once the draft has started (at least one round generated) and the
  tournament hasn't already been ended. Behind a confirmation modal, since
  it's a one-way action (no "reopen" control).
- Once ended (`state.ended = true`, persisted): the whole pairing-controls
  section (the "Generate next round pairings" button, the hint text, and
  "End tournament" itself) hides, along with the Match log section (see
  below) — the night is over, final standings are what matter. Both
  reappear automatically once "Clear data" resets the app for the next
  tournament.

### 9. Match log

Displayed above the table (below standings), a chronological list of every
pairing, sourced directly from `matchLog`. This is also where results are
entered (see Score entry above) — each entry shows:

- The round number.
- The two player names, each as a tappable button (marks that player the
  winner when tapped).
- A "Draw" button (marks the match a draw when tapped).
- Whichever of the three is currently active is visually highlighted;
  pending matches show no highlight.

## Styling

- Simple, clear, high-contrast — must be readable at a glance on an iPad in
  landscape from across a table.
- Large tap targets for the win/draw buttons in the match log
  (touch-friendly, iPad-sized).
- Base theme: Use a dark deep color for backgrounds and a bright accent color for button and highlight. Keep theme values (colors, fonts, any
  header/logo text) isolated (e.g. CSS custom properties at the top of
  `style.css`, or a small config block) so the app can be reskinned for a
  different set later without touching layout/logic.

## Deployment

Static site, pushed to GitHub Pages. No environment variables, no server.
