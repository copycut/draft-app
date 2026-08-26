# Custom player count with byes — design

## Goal

Today the player-count screen (`index.html:10-30`, `script.js:606-614`,
`script.js:848-852`) only offers "4 Players" and "8 Players", and pairing
(`script.js:738-764`) assumes an even roster with no byes. This adds a third
"Custom" option supporting any pod size from 2 to 12 players — primarily to
support 6 and 7-player pods — including temporary byes for odd counts.

## Scope

In scope: player-count UI, pick-timer math generalization, `draftMode`
persistence, Swiss/random pairing with byes, match log rendering of byes,
standings (already works via existing `statsFor` once bye entries exist).

Out of scope: changing the pack/pick timer's second-count table
(`PICK_SECONDS`/`REVIEW_SECONDS`), changing draft mode after the draft has
started (unchanged: it's a one-way choice, "Clear data" is still the only way
back), decks/matches outside `matchLog`.

## 1. Player-count screen

Add a third button "Custom" alongside the existing two
(`index.html:10-30`). Tapping it opens a new modal (new markup, following
the existing `#confirm-modal` pattern at `index.html:196-206`) containing:

- A number input, `min="2" max="12"`, no default value.
- Cancel / Confirm buttons.
- Confirm is disabled unless the input holds an integer in `[2, 12]`.

Confirming calls `onSelectPlayerCountClick(mode)` (`script.js:606`) with the
entered integer — the exact same function the fixed buttons call today, so
draft/tournament reset behavior is untouched. Canceling closes the modal
without changing state.

The two fixed buttons keep their static "N pics/pack" hint
(`index.html:19,27`). The custom modal doesn't need an equivalent hint since
the number isn't known until entry; no hint span required there.

## 2. Pick-timer math generalization

`script.js:118-124`:

```js
function picksPerPack(mode) {
  return mode === 4 ? 7 : 14;
}
function cardsPerPick(mode) {
  return mode === 4 ? 2 : 1;
}
```

Generalize to a threshold rather than an exact match on 4/8, per the
established house rule (pods of 6 or fewer take 2 cards per synchronized
pick, larger pods take 1):

```js
function cardsPerPick(mode) {
  return mode <= 6 ? 2 : 1;
}
function picksPerPack(mode) {
  return Math.floor(14 / cardsPerPick(mode));
}
```

This reproduces today's values unchanged (4 → 2 cards/pick, 7 picks; 8 → 1
card/pick, 14 picks) and extends them: 5–6 players → 2 cards/pick, 7 picks;
7–12 players → 1 card/pick, 14 picks. The "pack's last card is never
drafted" invariant (`14 = cardsPerPick * picksPerPack`, out of 15) holds for
every mode by construction.

## 3. `draftMode` persistence

`script.js:106` currently coerces on load:

```js
draftMode: parsed.draftMode === 4 ? 4 : 8,
```

Change to accept any previously-valid custom mode, clamping into range and
falling back to the existing default of 8 for anything malformed:

```js
draftMode:
  Number.isInteger(parsed.draftMode) && parsed.draftMode >= 2 && parsed.draftMode <= 12
    ? parsed.draftMode
    : 8,
```

`emptyState()` (`script.js:59-63`, exact default) keeps `draftMode: 8` as
the pre-selection placeholder value — it's overwritten the moment a count is
chosen, same as today.

## 4. Byes — data model

No new top-level state field. A bye is a `matchLog` entry shaped like a
normal match but with no opponent, pre-resolved at creation:

```js
{
  id: "...",
  round: N,
  player1Id: "<bye recipient>",
  player2Id: null,
  result: "<bye recipient>", // same id as player1Id — an automatic win
}
```

This deliberately reuses the existing win/loss/draw machinery rather than
introducing a parallel concept:

- `statsFor` (`script.js:142-163`): `entry.result === playerId` already
  credits a win when `isP1` is true — no change needed, a bye is just a win
  with no real opponent.
- `compareByStanding`'s head-to-head check (`script.js:169-182`) never
  matches a bye entry (`player2Id` is `null`, never equals a real player's
  `a.id`/`b.id`), so it's inert there, as intended.
- `latestRoundComplete` (`script.js:184-190`): a bye's `result` is non-null
  from the moment it's created, so it never blocks round completion.
- `pairKey`-based rematch tracking (`script.js:747-764`): a bye's key
  (`"<id>::null"` after sorting) can never collide with a real pairing key,
  so it's harmless to leave in the `played` set built from all of
  `matchLog`.

## 5. Byes — assignment algorithm

Only triggered when `state.players.length` is odd. Both pairing functions
(`generateRandomPairs`, `generateStandingsPairs`, `script.js:738-764`) need
to pull one player out for the bye *before* pairing the rest, then the
caller (`onGenerateRoundClick`, `script.js:694-721`) pushes one extra
matchLog entry for the bye alongside the regular pairs.

Selection rule:

- **Round 1** (`generateRandomPairs`): pick uniformly at random from all
  players (consistent with round 1's fully-random pairing philosophy — no
  standings exist yet).
- **Round 2+** (`generateStandingsPairs`): among players who have never had
  a bye this tournament (checked via
  `matchLog.some(m => m.player1Id === id && m.player2Id === null)`), pick
  the current lowest-standing one (i.e., last after sorting by
  `compareByStanding`). If every player has already had a bye at least
  once, restart the cycle: pick the lowest-standing player overall,
  repeats allowed — mirroring the existing "fall back to allowing a
  repeat" behavior in rematch avoidance.

After removing the bye recipient, the remaining (now-even) pool goes through
the existing pairing logic unchanged (`chunkIntoPairs` after shuffle, or the
existing standings+rematch-avoidance loop).

Both pairing functions change return shape from a bare pairs array to
`{ pairs: [[p1, p2], ...], bye: player | null }` so the caller can build the
bye's matchLog entry distinctly from regular match entries.

## 6. Match log rendering

`renderMatchLog` (`script.js:234+`) needs a bye-specific branch: when
`entry.player2Id == null`, render a single locked row —
`"<Player name> — Bye"` — with no win/draw/opponent buttons, since there's
no pending state to correct (the result is set at creation and never
touched again). Styling reuses the existing "active/highlighted" look for a
resolved match rather than introducing a new visual state.

## 7. Roster gating — unchanged behavior, now includes odd counts

`onGenerateRoundClick`'s roster-size check (`script.js:696-697`,
`count !== state.draftMode`) and the add-player hint
(`script.js:351-358`) stay exactly as they are — they already require
*exactly* `state.draftMode` players, which now can legitimately be an odd
number. No new validation needed: "exactly N, N can be odd" falls out for
free once `draftMode` itself can hold an odd value.

## Edge cases considered

- **2-player pod**: no bye ever needed (even), works like today's 4/8 path
  with `cardsPerPick = 2`.
- **Every player has had exactly one bye, tournament continues**: cycle
  restarts per the fallback rule above; not a crash, not blocked.
- **Custom modal reopened after Cancel**: no state changes on cancel, modal
  simply closes; reopening starts fresh (no input to preserve).
- **Existing saved state with `draftMode: 4` or `8`**: loads unchanged,
  fully backward compatible with the persistence change in section 3.

## Testing plan

Manual verification (no test framework in this project — plain static
site, per `plan.md`):

- Custom modal: bounds validation (reject 1, 13, non-integer, empty),
  confirm flows into the draft screen exactly like the fixed buttons.
- 7-player draft: pick-timer shows 1 card/pick, 14 picks/pack.
- 6-player draft: pick-timer shows 2 cards/pick, 7 picks/pack.
- Generate round 1 with 7 players: exactly 3 pairs + 1 bye entry; bye
  player's row shows a win with no match played.
- Generate round 2+ with 7 players: bye goes to lowest-standing player
  without a prior bye; standings/podium reflect the bye's 3 points.
- Full bye cycle exhaustion (manually play several rounds) confirms the
  restart-the-cycle fallback doesn't error.
- Reload mid-tournament (localStorage rehydration) preserves custom
  `draftMode` and bye entries correctly.

## Documentation

`plan.md` documents this app's features as the source of truth; update its
"Player count selection", "Draft phase", and "Swiss pairing suggestions"
sections to describe the custom/bye behavior once implemented, matching its
existing level of detail.
