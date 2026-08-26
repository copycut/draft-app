# Custom Player Count With Byes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer pick any pod size from 2–12 players (not just 4
or 8), including odd sizes like 7, with automatic bye handling in pairing
and standings.

**Architecture:** Plain HTML/CSS/JS static site, no build step, no test
framework — `index.html` (markup), `style.css` (styling), `script.js` (all
logic, single IIFE). All state lives in one `localStorage` JSON blob. This
feature extends the existing player-count screen, pick-timer math, and
Swiss-pairing functions in place; no new files.

**Tech Stack:** Vanilla JS (ES2017+), no framework, no bundler, no npm
dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-custom-player-count-design.md`

## Global Constraints

- No build step: changes must work as static files served directly (e.g.
  GitHub Pages) — no transpilation, no bundler.
- No test framework exists in this project; every task's verification step
  is manual, done by opening `index.html` in a browser (a local static
  server, e.g. `python3 -m http.server`, works too) and using devtools to
  inspect `localStorage["mtg-draft-night"]` where the spec calls for it.
- Custom player-count bounds are exactly 2–12 inclusive (integers only).
- `cardsPerPick(mode) = mode <= 6 ? 2 : 1` — pods of 6 or fewer take 2 cards
  per synchronized pick, pods of 7+ take 1.
- A bye is a `matchLog` entry `{ id, round, player1Id, player2Id: null,
  result: player1Id }` — pre-resolved, never pending, never editable via UI.
- Byes count as a full win (3 points) for standings purposes, via the
  existing `statsFor` win-counting logic — no special-casing needed there.

---

## File Structure

- `index.html` — add a third "Custom" button to `#player-count-screen`, and
  a new `#custom-count-modal` (number input + Cancel/Confirm), modeled on
  the existing `#confirm-modal`.
- `style.css` — style the new modal's number input; a small `.match-bye`
  accent rule for the match log.
- `script.js` — generalize `cardsPerPick`/`picksPerPack`; widen
  `draftMode` persistence to any 2–12 integer; add custom-count modal open
  /validate/cancel/confirm handlers; extract-a-bye logic in both pairing
  functions; build the bye `matchLog` entry in `onGenerateRoundClick`;
  render a locked bye row in the match log.

## Task 1: Custom player-count selection (data model, math, UI)

**Files:**
- Modify: `index.html:10-30` (player-count screen), add new modal markup
  before `index.html:208` (`<script src="script.js...">`)
- Modify: `style.css` (new rule near `style.css:706-736`, the Modal section)
- Modify: `script.js:106` (`loadState` draftMode normalization),
  `script.js:118-124` (`cardsPerPick`/`picksPerPack`), add new handlers
  near `script.js:606-614` (`onSelectPlayerCountClick`), wire new listeners
  near `script.js:847-852`

**Interfaces:**
- Produces: `state.draftMode` may now be any integer in `[2, 12]` (not just
  4 or 8). `cardsPerPick(mode)` / `picksPerPack(mode)` now defined for any
  mode in that range. `onSelectPlayerCountClick(mode)` is unchanged in
  signature/behavior — later tasks don't need to know about the modal, just
  that this function is still the single entry point into the draft screen.

- [ ] **Step 1: Add the "Custom" button to the player-count screen**

In `index.html`, replace the `.player-count-options` block
(`index.html:12-29`):

```html
      <div class="player-count-options">
        <button
          id="player-count-4-btn"
          class="btn btn-accent player-count-btn"
          type="button"
        >
          4 Players
          <span class="player-count-hint">2 pics/pack</span>
        </button>
        <button
          id="player-count-8-btn"
          class="btn btn-accent player-count-btn"
          type="button"
        >
          8 Players
          <span class="player-count-hint">1 pick/pack</span>
        </button>
        <button
          id="player-count-custom-btn"
          class="btn btn-accent player-count-btn"
          type="button"
        >
          Custom
          <span class="player-count-hint">2–12 players</span>
        </button>
      </div>
```

- [ ] **Step 2: Add the custom-count modal markup**

In `index.html`, immediately before the closing `</div>` that precedes
`<div id="confirm-modal" ...>` (i.e. right after `index.html:194`, before
`index.html:196`), add:

```html
    <div id="custom-count-modal" class="modal hidden">
      <div class="modal-box">
        <p>How many players?</p>
        <input
          id="custom-count-input"
          type="number"
          min="2"
          max="12"
          step="1"
          inputmode="numeric"
        />
        <div class="modal-actions">
          <button id="custom-count-cancel" class="btn">Cancel</button>
          <button id="custom-count-confirm" class="btn btn-accent" disabled>
            Confirm
          </button>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Style the modal's number input**

In `style.css`, after the `.modal-actions` rule (`style.css:730-735`), add:

```css
.modal-box input[type="number"] {
  width: 100%;
  margin-top: 0.75rem;
  font-size: 1.5rem;
  text-align: center;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius);
  border: 3px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
}
```

- [ ] **Step 4: Generalize `cardsPerPick`/`picksPerPack`**

In `script.js`, replace (`script.js:118-124`):

```js
  function picksPerPack(mode) {
    return mode === 4 ? 7 : 14;
  }

  function cardsPerPick(mode) {
    return mode === 4 ? 2 : 1;
  }
```

with:

```js
  function cardsPerPick(mode) {
    return mode <= 6 ? 2 : 1;
  }

  function picksPerPack(mode) {
    return Math.floor(14 / cardsPerPick(mode));
  }
```

- [ ] **Step 5: Widen `draftMode` persistence**

In `script.js`, replace the `draftMode` line inside `loadState`
(`script.js:106`):

```js
        draftMode: parsed.draftMode === 4 ? 4 : 8,
```

with:

```js
        draftMode:
          Number.isInteger(parsed.draftMode) &&
          parsed.draftMode >= 2 &&
          parsed.draftMode <= 12
            ? parsed.draftMode
            : 8,
```

- [ ] **Step 6: Add custom-count modal handlers**

In `script.js`, immediately after `onSelectPlayerCountClick`
(`script.js:606-614`), add:

```js
  function onOpenCustomCountModalClick() {
    const input = document.getElementById("custom-count-input");
    input.value = "";
    document.getElementById("custom-count-confirm").disabled = true;
    document.getElementById("custom-count-modal").classList.remove("hidden");
    input.focus();
  }

  function onCustomCountInputChange() {
    const value = Number(document.getElementById("custom-count-input").value);
    const valid = Number.isInteger(value) && value >= 2 && value <= 12;
    document.getElementById("custom-count-confirm").disabled = !valid;
  }

  function onCustomCountCancelClick() {
    document.getElementById("custom-count-modal").classList.add("hidden");
  }

  function onCustomCountConfirmClick() {
    const value = Number(document.getElementById("custom-count-input").value);
    if (!Number.isInteger(value) || value < 2 || value > 12) return;
    document.getElementById("custom-count-modal").classList.add("hidden");
    onSelectPlayerCountClick(value);
  }
```

- [ ] **Step 7: Wire the new event listeners**

In `script.js`, after the existing `player-count-8-btn` listener
(`script.js:850-852`), add:

```js
  document
    .getElementById("player-count-custom-btn")
    .addEventListener("click", onOpenCustomCountModalClick);
  document
    .getElementById("custom-count-input")
    .addEventListener("input", onCustomCountInputChange);
  document
    .getElementById("custom-count-cancel")
    .addEventListener("click", onCustomCountCancelClick);
  document
    .getElementById("custom-count-confirm")
    .addEventListener("click", onCustomCountConfirmClick);
```

- [ ] **Step 8: Manual verification**

Serve the app (`python3 -m http.server` from the repo root, then open
`http://localhost:8000`) and check:

1. "4 Players" still shows "Pack 1 · Pick 1 / 7" on the draft screen; "8
   Players" still shows "Pack 1 · Pick 1 / 14" — regression check, unchanged
   from before this task.
2. Click "Custom": modal opens, Confirm is disabled. Type `1` → still
   disabled. Type `13` → still disabled. Type `7` → Confirm enables. Click
   Cancel with `7` typed → modal closes, no screen change.
3. Click "Custom" again, type `7`, click Confirm → draft screen shows
   "Pack 1 · Pick 1 / 14" (7 > 6 → 1 card/pick).
4. Clear data, click "Custom", type `6`, Confirm → draft screen shows
   "Pack 1 · Pick 1 / 7" (6 ≤ 6 → 2 cards/pick).
5. With a custom count active, reload the page — the draft screen's pick
   count stays correct (confirms `draftMode` round-trips through
   `localStorage`).

- [ ] **Step 9: Commit**

```bash
git add index.html style.css script.js
git commit -m "Add custom player-count selection (2-12 players)"
```

## Task 2: Bye assignment in pairing generation

**Files:**
- Modify: `script.js:738-776` (`generateRandomPairs`,
  `generateStandingsPairs`, `pairKey`, `chunkIntoPairs`)
- Modify: `script.js:694-721` (`onGenerateRoundClick`)

**Interfaces:**
- Consumes: `state.players`, `state.matchLog`, `compareByStanding` (all
  pre-existing, unchanged).
- Produces: `generateRandomPairs(players)` and
  `generateStandingsPairs(players, matchLog)` now both return
  `{ pairs: [[p1, p2], ...], bye: player | null }` instead of a bare pairs
  array — Task 3 (match log rendering) relies on the bye `matchLog` entry
  shape this task creates (`player2Id: null`, `result` set to the bye
  player's own id), not on these two functions directly.

- [ ] **Step 1: Add a `hasHadBye` helper**

In `script.js`, immediately before `generateRandomPairs`
(`script.js:738`), add:

```js
  function hasHadBye(playerId, matchLog) {
    return matchLog.some(
      (m) => m.player1Id === playerId && m.player2Id == null,
    );
  }

```

- [ ] **Step 2: Extract a bye in `generateRandomPairs`**

Replace (`script.js:738-745`):

```js
  function generateRandomPairs(players) {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return chunkIntoPairs(shuffled);
  }
```

with:

```js
  function generateRandomPairs(players) {
    const pool = [...players];
    let bye = null;
    if (pool.length % 2 === 1) {
      const index = Math.floor(Math.random() * pool.length);
      bye = pool.splice(index, 1)[0];
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return { pairs: chunkIntoPairs(pool), bye };
  }
```

- [ ] **Step 3: Extract a bye in `generateStandingsPairs`**

Replace (`script.js:747-764`):

```js
  function generateStandingsPairs(players, matchLog) {
    const played = new Set(
      matchLog.map((m) => pairKey(m.player1Id, m.player2Id)),
    );
    const sorted = [...players].sort(compareByStanding);
    const unpaired = [...sorted];
    const pairs = [];

    while (unpaired.length > 0) {
      const p1 = unpaired.shift();
      let idx = unpaired.findIndex((p2) => !played.has(pairKey(p1.id, p2.id)));
      if (idx === -1) idx = 0;
      const p2 = unpaired.splice(idx, 1)[0];
      pairs.push([p1, p2]);
    }

    return pairs;
  }
```

with:

```js
  function generateStandingsPairs(players, matchLog) {
    const played = new Set(
      matchLog.map((m) => pairKey(m.player1Id, m.player2Id)),
    );
    const sorted = [...players].sort(compareByStanding);

    let bye = null;
    if (sorted.length % 2 === 1) {
      const withoutBye = sorted.filter((p) => !hasHadBye(p.id, matchLog));
      const byeCandidates = withoutBye.length > 0 ? withoutBye : sorted;
      bye = byeCandidates[byeCandidates.length - 1];
    }

    const unpaired = sorted.filter((p) => p !== bye);
    const pairs = [];

    while (unpaired.length > 0) {
      const p1 = unpaired.shift();
      let idx = unpaired.findIndex((p2) => !played.has(pairKey(p1.id, p2.id)));
      if (idx === -1) idx = 0;
      const p2 = unpaired.splice(idx, 1)[0];
      pairs.push([p1, p2]);
    }

    return { pairs, bye };
  }
```

(`sorted` is descending by standing — see `compareByStanding`,
`script.js:169-182` — so `byeCandidates[byeCandidates.length - 1]` is
always the lowest-standing eligible player.)

- [ ] **Step 4: Build the bye `matchLog` entry in `onGenerateRoundClick`**

Replace (`script.js:694-721`):

```js
  function onGenerateRoundClick() {
    if (state.ended) return;
    const count = state.players.length;
    if (count !== state.draftMode) return;
    if (!latestRoundComplete()) return;

    const pairs =
      state.currentRound === 1
        ? generateRandomPairs(state.players)
        : generateStandingsPairs(state.players, state.matchLog);

    const round = state.currentRound;
    pairs.forEach(([p1, p2]) => {
      state.matchLog.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        round,
        player1Id: p1.id,
        player2Id: p2.id,
        result: null,
      });
    });
    state.currentRound += 1;

    saveState();
    animatePodiumNextRender = true;
    resetRoundTimer();
    renderAll();
  }
```

with:

```js
  function onGenerateRoundClick() {
    if (state.ended) return;
    const count = state.players.length;
    if (count !== state.draftMode) return;
    if (!latestRoundComplete()) return;

    const { pairs, bye } =
      state.currentRound === 1
        ? generateRandomPairs(state.players)
        : generateStandingsPairs(state.players, state.matchLog);

    const round = state.currentRound;
    pairs.forEach(([p1, p2]) => {
      state.matchLog.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        round,
        player1Id: p1.id,
        player2Id: p2.id,
        result: null,
      });
    });
    if (bye) {
      state.matchLog.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        round,
        player1Id: bye.id,
        player2Id: null,
        result: bye.id,
      });
    }
    state.currentRound += 1;

    saveState();
    animatePodiumNextRender = true;
    resetRoundTimer();
    renderAll();
  }
```

- [ ] **Step 5: Manual verification**

Serve the app, clear data, click "Custom", enter `7`, confirm, skip to the
tournament screen (draft skip button), add exactly 7 players, click
"Generate next round pairings":

1. Open devtools → Application → Local Storage →
   `mtg-draft-night` → inspect the JSON. `matchLog` should have exactly 4
   entries for round 1: 3 with both `player1Id`/`player2Id` set and
   `result: null`, and exactly 1 with `player2Id: null` and
   `result` equal to its own `player1Id`.
2. Enter a result for each of the 3 real matches (win log rendering may
   look slightly off for the bye row until Task 3 — that's expected).
   Click "Generate next round pairings" again for round 2.
3. In `localStorage`, confirm round 2's bye went to a *different* player
   than round 1's bye (round-robin fairness), and that player is the
   lowest-standing among those who haven't had a bye yet.
4. Confirm the players table's points column already credits the bye
   player 3 points with 0 recorded matches for that round (this works via
   existing `statsFor` logic, unchanged).

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "Assign byes for odd-sized rosters in pairing generation"
```

## Task 3: Render byes in the match log

**Files:**
- Modify: `script.js:234-262` (`renderMatchLog`)
- Modify: `style.css` (new rule near `style.css:575-578`, `.match-result`)

**Interfaces:**
- Consumes: `matchLog` entries with `player2Id: null` produced by Task 2.
- Produces: no new exports — this is a leaf rendering change.

- [ ] **Step 1: Add a `byeResultHtml` helper and branch on it in `renderMatchLog`**

In `script.js`, replace `renderMatchLog` (`script.js:234-262`):

```js
  function renderMatchLog() {
    const section = document.getElementById("match-log-section");
    const hasLog = state.matchLog.length > 0 && !state.ended;
    section.classList.toggle("hidden", !hasLog);
    if (!hasLog) return;

    const log = document.getElementById("match-log");
    log.innerHTML = "";

    const activeRound = state.currentRound - 1;

    state.matchLog.forEach((entry) => {
      const p1 = playerById(entry.player1Id);
      const p2 = playerById(entry.player2Id);
      const li = document.createElement("li");
      li.className = "match-entry";
      li.innerHTML = `
        <span class="match-round">Round ${entry.round}</span>
        <span class="match-pairing">
          ${entry.round === activeRound ? matchPairingButtonsHtml(entry, p1, p2) : matchPairingResultHtml(entry, p1, p2)}
        </span>
      `;
      log.appendChild(li);
    });

    log.querySelectorAll("button[data-match]").forEach((btn) => {
      btn.addEventListener("click", onMatchResultClick);
    });
  }
```

with:

```js
  function renderMatchLog() {
    const section = document.getElementById("match-log-section");
    const hasLog = state.matchLog.length > 0 && !state.ended;
    section.classList.toggle("hidden", !hasLog);
    if (!hasLog) return;

    const log = document.getElementById("match-log");
    log.innerHTML = "";

    const activeRound = state.currentRound - 1;

    state.matchLog.forEach((entry) => {
      const p1 = playerById(entry.player1Id);
      const p2 = playerById(entry.player2Id);
      const li = document.createElement("li");
      li.className = "match-entry";
      const pairingHtml =
        entry.player2Id == null
          ? byeResultHtml(p1)
          : entry.round === activeRound
            ? matchPairingButtonsHtml(entry, p1, p2)
            : matchPairingResultHtml(entry, p1, p2);
      li.innerHTML = `
        <span class="match-round">Round ${entry.round}</span>
        <span class="match-pairing">${pairingHtml}</span>
      `;
      log.appendChild(li);
    });

    log.querySelectorAll("button[data-match]").forEach((btn) => {
      btn.addEventListener("click", onMatchResultClick);
    });
  }

  function byeResultHtml(player) {
    const name = player ? escapeHtml(player.name) : "?";
    return `<span class="match-result match-bye">${name} — Bye</span>`;
  }
```

- [ ] **Step 2: Style the bye row**

In `style.css`, immediately after the `.match-result` rule
(`style.css:575-578`), add:

```css
.match-bye {
  color: var(--color-accent);
  font-weight: 600;
}
```

- [ ] **Step 3: Manual verification**

Continuing from Task 2's 7-player test state (or starting fresh: Custom →
`7` → skip to tournament → add 7 players → generate round 1):

1. The match log shows 3 normal pairings (with win/draw buttons, since
   round 1 is the active round) and one row reading "`<PlayerName>` — Bye"
   with no buttons.
2. Enter results for the 3 real matches, generate round 2 — round 1's bye
   row now renders via `matchPairingResultHtml`'s sibling path... no,
   confirm it still renders via `byeResultHtml` (i.e. still just the
   locked "— Bye" text, not affected by the `activeRound` change) since the
   `player2Id == null` branch is checked before the active-round check.
3. Visually confirm the bye row's text is accent-colored, distinguishing it
   from a pending/decided real match.

- [ ] **Step 4: Commit**

```bash
git add script.js style.css
git commit -m "Render byes as a locked row in the match log"
```

## Task 4: Update `plan.md` documentation

**Files:**
- Modify: `plan.md:69-88` (Player count selection)
- Modify: `plan.md:99-104` (Draft phase pick-count/countdown description)
- Modify: `plan.md:202-230` (Swiss pairing suggestions)

**Interfaces:** None — documentation only, no code.

- [ ] **Step 1: Update the Player count selection section**

In `plan.md`, replace the section body (`plan.md:71-88`, keeping the
`### 1. Player count selection` heading):

```markdown
The very first screen, before the draft timer or any tournament UI: three
buttons — "4 Players", "8 Players", and "Custom". Nothing else on this
screen — no skip option, no back button (use "Clear data" to restart if the
wrong count gets picked, same as any other one-way choice in this app).

- The choice is stored as `state.draftMode` (any integer 2–12) and
  persisted. "4 Players" and "8 Players" set it directly; "Custom" opens a
  modal with a number input (bounds 2–12) and Confirm/Cancel — Confirm is
  disabled until the input holds a valid integer in that range.
- It sets how many cards each player takes per pick during the draft (see
  Draft phase below), which in turn determines how many picks a 15-card pack
  yields: pods of 6 players or fewer take 2 cards per pick → 7 picks per
  pack; pods of 7 or more take 1 card per pick → 14 picks per pack. Either
  way, 1 card is always left over, undrafted — the pack's very last card is
  never drafted, by design.
- It also becomes the required roster size for the tournament: "Generate
  next round pairings" (see Swiss pairing below) now requires exactly
  `draftMode` players — the draft and the tournament always agree on how
  many people are at the table. An odd `draftMode` (e.g. 7) is valid; one
  player sits out each round as a bye (see Swiss pairing below).
- Tapping "4 Players"/"8 Players", or confirming the Custom modal, sets
  `state.screen = "draft"` and resets `state.draft` to
  `{ pack: 1, pick: 1, phase: "pick" }`, moving straight into the draft
  phase.
```

- [ ] **Step 2: Update the Draft phase section's pick-count references**

In `plan.md`, within section `### 2. Draft phase (pick timer)`, replace the
intro paragraph and the first countdown bullet (`plan.md:92-105`):

```markdown
Once a player count is chosen, the app shows a full-screen pick timer
covering the physical card draft: 3 packs of 15 cards each, split into
picksPerPack(draftMode) picks per pack (7 for pods of 6 or fewer, 14 for
pods of 7 or more — see Player count selection above). The rest of the app
(standings, pairing controls, match log, players, footer) stays hidden
behind this screen until the organizer finishes or skips it.

- Per-pick countdown, keyed by how many cards are left in the pack before
  that pick (same table regardless of player count): 60s at 15 cards, 50s at
  14-13, 40s at 12-9, 35s at 8-7, 30s at 6, 25s at 5, 20s at 4, 15s at 3, 10s
  at 2-1. In pods of 7 or more (1 card per pick) this plays out over all 14
  picks in order; in pods of 6 or fewer (2 cards per pick) each pick jumps
  two cards down the same table, so the countdown drops faster
  pick-to-pick.
```

- [ ] **Step 3: Update the Swiss pairing suggestions section**

In `plan.md`, within section `### 7. Swiss pairing suggestions`, replace the
first bullet of the "Disabled unless" list (`plan.md:207-209`):

```markdown
- the roster has exactly `state.draftMode` players (see Player count
  selection and Player management above — may be odd, see Byes below),
  **and**
```

Then, after the existing "Pairing logic" bullets and before the section's
end (i.e. after `plan.md:229`'s "increment `currentRound`." line), add a new
paragraph:

```markdown

**Byes**: when the roster is an odd size, one player sits out each round.
A bye is recorded as a `matchLog` entry with no opponent
(`player2Id: null`) and a result pre-set to that player's own id — an
automatic win (3 points), never a pending/editable match. Round 1 picks the
bye recipient at random; round 2+ gives it to the current lowest-standing
player who hasn't had a bye yet this tournament (falling back to the
lowest-standing player overall, repeats allowed, once everyone has had
one) — matching the same "allow a repeat rather than block" philosophy as
rematch avoidance above. The match log shows a bye as a single locked
"<Player> — Bye" row instead of win/draw buttons.
```

- [ ] **Step 4: Commit**

```bash
git add plan.md
git commit -m "Document custom player count and bye handling in plan.md"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (player-count UI) → Task 1. Section 2
  (pick-timer math) → Task 1 Step 4. Section 3 (`draftMode` persistence) →
  Task 1 Step 5. Section 4 (bye data model) → Task 2 Steps 2–4 (no changes
  needed to `statsFor`/`compareByStanding`/`latestRoundComplete`/`pairKey`,
  as the spec establishes — verified by inspection, not by editing them).
  Section 5 (bye assignment) → Task 2. Section 6 (match log rendering) →
  Task 3. Section 7 (roster gating) → no code change needed, confirmed
  already correct; documented in Task 4. Documentation → Task 4.
- **Type consistency:** `generateRandomPairs`/`generateStandingsPairs`
  both return `{ pairs, bye }` (Task 2), and `onGenerateRoundClick`
  destructures exactly that shape (Task 2 Step 4). `hasHadBye(playerId,
  matchLog)` signature matches its one call site inside
  `generateStandingsPairs` (Task 2 Step 3). `byeResultHtml(player)` matches
  its call site in `renderMatchLog` (Task 3 Step 1).
