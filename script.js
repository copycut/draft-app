(function () {
  "use strict";

  const STORAGE_KEY = "mtg-draft-night";
  const PICK_SECONDS = [
    60, 50, 50, 40, 40, 40, 40, 35, 35, 30, 25, 20, 15, 10, 10,
  ]; // index = (15 - cardsRemainingBeforePick)
  const REVIEW_SECONDS = { 1: 30, 2: 45, 3: 60 };
  const ROUND_SECONDS = 50 * 60;
  const PASS_DIRECTION = {
    1: "Pass to your left ←",
    2: "Pass to your right →",
    3: "Pass to your left ←",
  };

  let state = loadState();
  let animatePodiumNextRender = false;
  let draftIntervalId = null;
  let draftSecondsRemaining = 0;
  let draftPaused = false;
  let draftPhaseStarted = false;
  let draftPhaseChanged = true;
  let roundIntervalId = null;
  let roundSecondsRemaining = ROUND_SECONDS;
  let roundStarted = false;
  let audioCtx = null;
  let pendingDeckColors = [];
  const DECK_COLORS = ["W", "U", "B", "R", "G"];
  const DECK_COLOR_ICON = {
    W: "assets/white.svg",
    U: "assets/blue.svg",
    B: "assets/black.svg",
    R: "assets/red.svg",
    G: "assets/green.svg",
  };
  const DECK_COLORLESS_ICON = "assets/gray.svg";

  function playBellSound() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();

    const now = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    oscillator.connect(gain).connect(audioCtx.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.2);
  }

  function emptyState() {
    return {
      players: [],
      matchLog: [],
      currentRound: 1,
      ended: false,
      screen: "select",
      draftMode: 8,
      draft: { pack: 1, pick: 1, phase: "pick" },
      tournamentDate: null,
    };
  }

  function formatDateEU(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  }

  function normalizeDraft(draft) {
    const pack = [1, 2, 3].includes(draft?.pack) ? draft.pack : 1;
    const pick =
      draft &&
      Number.isInteger(draft.pick) &&
      draft.pick >= 1 &&
      draft.pick <= 15
        ? draft.pick
        : 1;
    const phase =
      draft && (draft.phase === "pick" || draft.phase === "review")
        ? draft.phase
        : "pick";
    return { pack, pick, phase };
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        players: parsed.players || [],
        matchLog: parsed.matchLog || [],
        currentRound: parsed.currentRound || 1,
        ended: parsed.ended || false,
        screen: ["select", "draft", "tournament"].includes(parsed.screen)
          ? parsed.screen
          : "select",
        draftMode: parsed.draftMode === 4 ? 4 : 8,
        draft: normalizeDraft(parsed.draft),
        tournamentDate:
          typeof parsed.tournamentDate === "string"
            ? parsed.tournamentDate
            : null,
      };
    } catch (e) {
      return emptyState();
    }
  }

  function picksPerPack(mode) {
    return mode === 4 ? 7 : 14;
  }

  function cardsPerPick(mode) {
    return mode === 4 ? 2 : 1;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function playerById(id) {
    return state.players.find((p) => p.id === id);
  }

  function matchById(id) {
    return state.matchLog.find((m) => m.id === id);
  }

  function draftStarted() {
    return state.matchLog.length > 0;
  }

  function statsFor(playerId) {
    let wins = 0;
    let draws = 0;
    let losses = 0;

    state.matchLog.forEach((entry) => {
      if (entry.result == null) return;
      const isP1 = entry.player1Id === playerId;
      const isP2 = entry.player2Id === playerId;
      if (!isP1 && !isP2) return;

      if (entry.result === "draw") {
        draws += 1;
      } else if (entry.result === playerId) {
        wins += 1;
      } else {
        losses += 1;
      }
    });

    return { wins, draws, losses, points: wins * 3 + draws };
  }

  function hasAnyResult() {
    return state.matchLog.some((entry) => entry.result != null);
  }

  function compareByStanding(a, b) {
    const pointsDiff = statsFor(b.id).points - statsFor(a.id).points;
    if (pointsDiff !== 0) return pointsDiff;

    const headToHead = state.matchLog.find(
      (m) =>
        (m.player1Id === a.id && m.player2Id === b.id) ||
        (m.player1Id === b.id && m.player2Id === a.id),
    );
    if (headToHead && headToHead.result === a.id) return -1;
    if (headToHead && headToHead.result === b.id) return 1;

    return 0;
  }

  function latestRoundComplete() {
    const latestRound = state.currentRound - 1;
    if (latestRound < 1) return true;
    return state.matchLog
      .filter((entry) => entry.round === latestRound)
      .every((entry) => entry.result != null);
  }

  // ---- Rendering ----

  function renderAll() {
    renderScreens();
    renderDraftScreen();
    renderPodium();
    renderMatchLog();
    renderPlayersTable();
    renderPairingControls();
    renderAddPlayerForm();
  }

  function renderPodium() {
    const section = document.getElementById("standings-section");
    const podium = document.getElementById("podium");
    const shouldAnimate = animatePodiumNextRender;
    animatePodiumNextRender = false;
    podium.innerHTML = "";
    document.getElementById("tournament-date").textContent =
      state.tournamentDate || "";

    const hasStandings = state.players.length > 0 && hasAnyResult();
    section.classList.toggle("hidden", !hasStandings);
    if (!hasStandings) return;

    const top3 = [...state.players].sort(compareByStanding).slice(0, 3);

    const medals = ["🥇", "🥈", "🥉"];

    top3.forEach((player, index) => {
      const card = document.createElement("div");
      card.className = `podium-card rank-${index + 1}${shouldAnimate ? " podium-animate" : ""}`;
      card.innerHTML = `
        <div class="medal">${medals[index]}</div>
        <div class="name">${escapeHtml(player.name)}</div>
        <div class="deck">${escapeHtml(player.deck)}</div>
        <div class="points">${statsFor(player.id).points} pts</div>
      `;
      podium.appendChild(card);
    });
  }

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

  function matchPairingButtonsHtml(entry, p1, p2) {
    return `
      ${matchPlayerButtonHtml(entry, p1)}
      <span class="vs">vs</span>
      ${matchPlayerButtonHtml(entry, p2)}
      <button type="button" class="btn match-btn draw-btn ${entry.result === "draw" ? "active" : ""}" data-match="${entry.id}" data-result="draw">Draw</button>
    `;
  }

  function matchPlayerButtonHtml(entry, player) {
    if (!player) return "?";
    const isWinner = entry.result === player.id;
    return `<button type="button" class="btn match-btn win-btn ${isWinner ? "active" : ""}" data-match="${entry.id}" data-result="${player.id}">${escapeHtml(player.name)}</button>`;
  }

  function matchPairingResultHtml(entry, p1, p2) {
    const p1Name = p1 ? escapeHtml(p1.name) : "?";
    const p2Name = p2 ? escapeHtml(p2.name) : "?";
    if (entry.result === "draw") {
      return `<span class="match-result">${p1Name} vs ${p2Name} — Draw</span>`;
    }
    if (entry.result == null) {
      return `<span class="match-result">${p1Name} vs ${p2Name} — Pending</span>`;
    }
    const winner = [p1, p2].find((p) => p && p.id === entry.result) || null;
    const winnerName = winner ? escapeHtml(winner.name) : "?";
    return `<span class="match-result">${p1Name} vs ${p2Name} — <strong>${winnerName}</strong> won</span>`;
  }

  function deleteButtonHtml(player) {
    return `<button type="button" class="btn btn-outline btn-danger btn-delete" data-action="delete" data-player="${player.id}" aria-label="Remove ${escapeHtml(player.name)}">Delete</button>`;
  }

  function deckCellHtml(player) {
    const colors = player.colors || [];
    const icons = colors.length
      ? DECK_COLORS.filter((c) => colors.includes(c)).map(
          (c) =>
            `<img class="deck-color-icon" src="${DECK_COLOR_ICON[c]}" width="16" height="16" alt="" />`,
        )
      : [
          `<img class="deck-color-icon" src="${DECK_COLORLESS_ICON}" width="16" height="16" alt="" />`,
        ];
    return `<div class="deck-cell">${icons.join("")}<span>${escapeHtml(player.deck)}</span></div>`;
  }

  function renderPlayersTable() {
    const tbody = document.getElementById("players-tbody");
    tbody.innerHTML = "";

    const started = draftStarted();
    const sortedPlayers = [...state.players].sort(compareByStanding);

    sortedPlayers.forEach((player, index) => {
      const stats = statsFor(player.id);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${index + 1}</td>
        <td>${escapeHtml(player.name)}</td>
        <td>${deckCellHtml(player)}</td>
        <td>${stats.wins}</td>
        <td>${stats.draws}</td>
        <td>${stats.losses}</td>
        <td>${stats.points}</td>
        <td>${started ? "" : deleteButtonHtml(player)}</td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", onDeletePlayerClick);
    });
  }

  function renderPairingControls() {
    const section = document.getElementById("pairing-controls-section");
    section.classList.toggle("hidden", state.ended);
    if (state.ended) return;

    const btn = document.getElementById("generate-round-btn");
    const endBtn = document.getElementById("end-tournament-btn");
    const hint = document.getElementById("pairing-hint");
    const count = state.players.length;
    const validCount = count === state.draftMode;
    const roundComplete = latestRoundComplete();

    endBtn.disabled = !draftStarted();

    if (!validCount) {
      btn.disabled = true;
      hint.textContent = `Add exactly ${state.draftMode} players to start (currently ${count}).`;
    } else if (!roundComplete) {
      btn.disabled = true;
      hint.textContent = `Enter results for round ${state.currentRound - 1} before generating the next round.`;
    } else {
      btn.disabled = false;
      hint.textContent = `Ready — generate round ${state.currentRound}.`;
    }

    renderRoundTimerDigits();
    renderRoundTimerButton();
  }

  // ---- Round timer ----

  function stopRoundTimer() {
    if (roundIntervalId !== null) {
      clearInterval(roundIntervalId);
      roundIntervalId = null;
    }
  }

  function resetRoundTimer() {
    stopRoundTimer();
    roundSecondsRemaining = ROUND_SECONDS;
    roundStarted = false;
    renderRoundTimerDigits();
    renderRoundTimerButton();
  }

  function renderRoundTimerDigits() {
    const expired = roundSecondsRemaining <= 0;
    const minutes = Math.floor(roundSecondsRemaining / 60);
    const seconds = roundSecondsRemaining % 60;
    document.getElementById("round-timer-seconds").textContent =
      `${minutes}:${String(seconds).padStart(2, "0")}`;
    document
      .getElementById("round-timer-seconds")
      .classList.toggle("expired", expired);
    document
      .getElementById("pairing-controls-section")
      .classList.toggle("expired", expired);
  }

  function renderRoundTimerButton() {
    const btn = document.getElementById("round-timer-btn");
    if (!roundStarted) {
      btn.textContent = "Start";
    } else if (roundIntervalId !== null) {
      btn.textContent = "Pause";
    } else {
      btn.textContent = "Resume";
    }
    btn.disabled = roundSecondsRemaining <= 0;
  }

  function tickRoundTimer() {
    roundSecondsRemaining -= 1;
    if (roundSecondsRemaining <= 0) {
      roundSecondsRemaining = 0;
      renderRoundTimerDigits();
      stopRoundTimer();
      renderRoundTimerButton();
      playBellSound();
      return;
    }
    renderRoundTimerDigits();
  }

  function onRoundTimerBtnClick() {
    if (!roundStarted) {
      roundStarted = true;
      roundIntervalId = setInterval(tickRoundTimer, 1000);
    } else if (roundIntervalId !== null) {
      stopRoundTimer();
    } else if (roundSecondsRemaining > 0) {
      roundIntervalId = setInterval(tickRoundTimer, 1000);
    }
    renderRoundTimerButton();
  }

  function renderAddPlayerForm() {
    const form = document.getElementById("add-player-form");
    form.classList.toggle("hidden", draftStarted());
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderScreens() {
    document
      .getElementById("player-count-screen")
      .classList.toggle("hidden", state.screen !== "select");
    document
      .getElementById("draft-screen")
      .classList.toggle("hidden", state.screen !== "draft");
    document
      .getElementById("tournament-screen")
      .classList.toggle("hidden", state.screen !== "tournament");

    if (state.screen !== "draft") {
      stopDraftTimer();
    }
  }

  function renderDraftScreen() {
    if (state.screen !== "draft") return;

    const { pack, pick, phase } = state.draft;
    const totalPicks = picksPerPack(state.draftMode);
    document.getElementById("draft-pack-pick").textContent =
      phase === "pick"
        ? `Pack ${pack} · Pick ${pick} / ${totalPicks}`
        : `Pack ${pack} · Review`;
    document.getElementById("draft-phase-label").textContent =
      phase === "pick" ? PASS_DIRECTION[pack] : "Review your pack";
    document
      .getElementById("draft-timer-seconds")
      .classList.toggle("review", phase === "review");

    const advanceBtn = document.getElementById("draft-advance-btn");
    if (phase === "pick" && pick < totalPicks) {
      advanceBtn.textContent = "Next Pick";
    } else if (phase === "pick") {
      advanceBtn.textContent = "Start Review";
    } else if (pack < 3) {
      advanceBtn.textContent = `Start Pack ${pack + 1}`;
    } else {
      advanceBtn.textContent = "Start Tournament";
    }

    if (draftPhaseChanged) {
      draftPhaseChanged = false;
      resetDraftPhaseTimer();
    }

    renderDraftTimerButton();
  }

  // ---- Draft phase timer ----

  function currentPhaseDuration() {
    const { pack, pick, phase } = state.draft;
    if (phase === "review") return REVIEW_SECONDS[pack];

    const cardsRemaining = 15 - cardsPerPick(state.draftMode) * (pick - 1);
    return PICK_SECONDS[15 - cardsRemaining];
  }

  function stopDraftTimer() {
    if (draftIntervalId !== null) {
      clearInterval(draftIntervalId);
      draftIntervalId = null;
    }
  }

  function resetDraftPhaseTimer() {
    stopDraftTimer();
    draftSecondsRemaining = currentPhaseDuration();
    draftPaused = false;
    draftPhaseStarted = false;
    renderDraftTimerDigits();
  }

  function renderDraftTimerDigits() {
    const expired = draftSecondsRemaining <= 0;
    document.getElementById("draft-timer-seconds").textContent =
      draftSecondsRemaining;
    document
      .getElementById("draft-timer-seconds")
      .classList.toggle("expired", expired);
    document
      .getElementById("draft-screen")
      .classList.toggle("expired", expired);
  }

  function renderDraftTimerButton() {
    const btn = document.getElementById("draft-timer-btn");
    if (!draftPhaseStarted) {
      btn.textContent = "Start";
    } else if (draftIntervalId !== null) {
      btn.textContent = "Pause";
    } else {
      btn.textContent = "Resume";
    }
    btn.disabled = draftSecondsRemaining <= 0;
  }

  function tickDraftTimer() {
    draftSecondsRemaining -= 1;
    if (draftSecondsRemaining <= 0) {
      draftSecondsRemaining = 0;
      renderDraftTimerDigits();
      stopDraftTimer();
      renderDraftTimerButton();
      playBellSound();
      return;
    }
    renderDraftTimerDigits();
  }

  function onDraftTimerBtnClick() {
    if (!draftPhaseStarted) {
      draftPhaseStarted = true;
      draftPaused = false;
      draftIntervalId = setInterval(tickDraftTimer, 1000);
    } else if (draftIntervalId !== null) {
      stopDraftTimer();
      draftPaused = true;
    } else if (draftSecondsRemaining > 0) {
      draftPaused = false;
      draftIntervalId = setInterval(tickDraftTimer, 1000);
    }
    renderDraftTimerButton();
  }

  function onDraftAdvanceClick() {
    const d = state.draft;
    if (d.phase === "pick" && d.pick < picksPerPack(state.draftMode)) {
      d.pick += 1;
    } else if (d.phase === "pick") {
      d.phase = "review";
    } else if (d.pack < 3) {
      d.pack += 1;
      d.pick = 1;
      d.phase = "pick";
    } else {
      state.screen = "tournament";
    }
    draftPhaseChanged = true;
    saveState();
    renderAll();
  }

  function onSkipDraftClick() {
    showConfirmModal(
      "Skip the pick timer and jump straight to the tournament screen?",
      () => {
        state.screen = "tournament";
        saveState();
        renderAll();
      },
    );
  }

  function onSelectPlayerCountClick(mode) {
    state.draftMode = mode;
    state.screen = "draft";
    state.draft = { pack: 1, pick: 1, phase: "pick" };
    state.tournamentDate = formatDateEU(new Date());
    draftPhaseChanged = true;
    saveState();
    renderAll();
  }

  // ---- Event handlers ----

  function onMatchResultClick(e) {
    const btn = e.currentTarget;
    const matchId = btn.dataset.match;
    const result = btn.dataset.result;
    const entry = matchById(matchId);
    if (!entry) return;

    entry.result = entry.result === result ? null : result;

    saveState();
    renderAll();
  }

  function onDeletePlayerClick(e) {
    if (draftStarted()) return;

    const playerId = e.currentTarget.dataset.player;
    const player = playerById(playerId);
    if (!player) return;

    showConfirmModal(`Remove ${player.name} (${player.deck})?`, () => {
      state.players = state.players.filter((p) => p.id !== playerId);
      saveState();
      renderAll();
    });
  }

  function onAddPlayerSubmit(e) {
    e.preventDefault();
    if (draftStarted()) return;

    const nameInput = document.getElementById("player-name-input");
    const deckInput = document.getElementById("deck-name-input");
    const name = nameInput.value.trim();
    const deck = deckInput.value.trim();
    if (!name || !deck) return;

    state.players.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      deck,
      colors: [...pendingDeckColors],
    });

    nameInput.value = "";
    deckInput.value = "";
    resetDeckColorToggles();

    saveState();
    renderAll();
  }

  function resetDeckColorToggles() {
    pendingDeckColors = [];
    document
      .querySelectorAll("#deck-color-toggles .color-toggle-btn")
      .forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-pressed", "false");
      });
  }

  function onDeckColorToggleClick(e) {
    const btn = e.currentTarget;
    const color = btn.dataset.color;
    const index = pendingDeckColors.indexOf(color);
    if (index === -1) {
      pendingDeckColors.push(color);
    } else {
      pendingDeckColors.splice(index, 1);
    }
    const active = pendingDeckColors.includes(color);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }

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

  function onEndTournamentClick() {
    if (!draftStarted() || state.ended) return;

    showConfirmModal(
      "End the tournament now? Standings will be final and no more rounds can be generated.",
      () => {
        state.ended = true;
        stopRoundTimer();
        saveState();
        animatePodiumNextRender = true;
        renderAll();
      },
    );
  }

  function generateRandomPairs(players) {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return chunkIntoPairs(shuffled);
  }

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

  function pairKey(id1, id2) {
    return [id1, id2].sort().join("::");
  }

  function chunkIntoPairs(list) {
    const pairs = [];
    for (let i = 0; i < list.length; i += 2) {
      pairs.push([list[i], list[i + 1]]);
    }
    return pairs;
  }

  // ---- Clear data / confirmation modal ----

  function showConfirmModal(text, onConfirm) {
    const modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-modal-text").textContent = text;
    modal.classList.remove("hidden");

    const confirmBtn = document.getElementById("confirm-modal-confirm");
    const cancelBtn = document.getElementById("confirm-modal-cancel");

    function cleanup() {
      modal.classList.add("hidden");
      confirmBtn.removeEventListener("click", onConfirmClick);
      cancelBtn.removeEventListener("click", onCancelClick);
    }
    function onConfirmClick() {
      cleanup();
      onConfirm();
    }
    function onCancelClick() {
      cleanup();
    }

    confirmBtn.addEventListener("click", onConfirmClick);
    cancelBtn.addEventListener("click", onCancelClick);
  }

  function onClearDataClick() {
    showConfirmModal(
      "Clear all draft night data? This cannot be undone.",
      () => {
        localStorage.removeItem(STORAGE_KEY);
        state = emptyState();
        draftPhaseChanged = true;
        resetRoundTimer();
        renderAll();
      },
    );
  }

  // ---- Init ----

  document
    .getElementById("add-player-form")
    .addEventListener("submit", onAddPlayerSubmit);
  document
    .querySelectorAll("#deck-color-toggles .color-toggle-btn")
    .forEach((btn) => btn.addEventListener("click", onDeckColorToggleClick));
  document
    .getElementById("generate-round-btn")
    .addEventListener("click", onGenerateRoundClick);
  document
    .getElementById("end-tournament-btn")
    .addEventListener("click", onEndTournamentClick);
  document
    .getElementById("clear-data-btn")
    .addEventListener("click", onClearDataClick);
  document
    .getElementById("draft-advance-btn")
    .addEventListener("click", onDraftAdvanceClick);
  document
    .getElementById("draft-timer-btn")
    .addEventListener("click", onDraftTimerBtnClick);
  document
    .getElementById("round-timer-btn")
    .addEventListener("click", onRoundTimerBtnClick);
  document
    .getElementById("draft-skip-btn")
    .addEventListener("click", onSkipDraftClick);
  document
    .getElementById("player-count-4-btn")
    .addEventListener("click", () => onSelectPlayerCountClick(4));
  document
    .getElementById("player-count-8-btn")
    .addEventListener("click", () => onSelectPlayerCountClick(8));

  renderAll();
})();
