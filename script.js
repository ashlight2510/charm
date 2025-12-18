/* 참참참! Neon Arcade (no deps) */
(() => {
  "use strict";

  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });

  const $score = document.getElementById("score");
  const $life = document.getElementById("life");
  const $round = document.getElementById("round");
  const $overlay = document.getElementById("overlay");
  const $btnStart = document.getElementById("btnStart");
  const $btnMute = document.getElementById("btnMute");

  const laneBtns = [...document.querySelectorAll(".laneBtn")];

  // ---------- Ranking (Supabase)
  // NOTE: 브라우저 클라이언트에서 쓰는 "anon key"만 사용하세요.
  // 설정 방법:
  // - DevTools 콘솔에서 아래 두 줄 실행 후 새로고침:
  //   localStorage.setItem("SB_URL", "https://xxxx.supabase.co");
  //   localStorage.setItem("SB_ANON_KEY", "YOUR_ANON_KEY");
  // 기본값: 유저가 제공한 프로젝트(필요시 localStorage로 override 가능)
  const DEFAULT_SB_URL = "https://mawljjaittsnoyotxqhm.supabase.co";
  const DEFAULT_SB_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hd2xqamFpdHRzbm95b3R4cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjIwNTgsImV4cCI6MjA4MTU5ODA1OH0.jzF9IqDtx6hcHwaWfjaT6GvG2jE7lotSaQMUdnRhaAM";

  const SB_URL = localStorage.getItem("SB_URL") || DEFAULT_SB_URL;
  const SB_ANON_KEY =
    localStorage.getItem("SB_ANON_KEY") || DEFAULT_SB_ANON_KEY;
  const RANKING_TABLE = "rankings";
  const FN_LEADERBOARD = "leaderboard";
  // 같은 Supabase 프로젝트에서 여러 게임이 돌면 game_id로 분리
  // 예) run 게임에서는 localStorage.setItem("SB_GAME_ID", "run")
  const SB_GAME_ID = localStorage.getItem("SB_GAME_ID") || "charm";

  /** @returns {import("@supabase/supabase-js").SupabaseClient | null} */
  function getSupabase() {
    const g = /** @type {any} */ (window);
    const lib = g.supabase;
    if (!lib?.createClient) return null;
    if (!SB_URL || !SB_ANON_KEY) return null;
    if (!getSupabase._client) {
      getSupabase._client = lib.createClient(SB_URL, SB_ANON_KEY, {
        auth: { persistSession: false },
      });
    }
    return getSupabase._client;
  }
  getSupabase._client = null;

  function getFunctionsBase() {
    if (!SB_URL) return "";
    return `${SB_URL.replace(/\/+$/, "")}/functions/v1`;
  }

  async function callFn(path, { method = "GET", body = null } = {}) {
    const base = getFunctionsBase();
    if (!base) return { ok: false, error: "SUPABASE_NOT_CONFIGURED" };
    // CORS preflight(OPTIONS) 회피:
    // - GET: 커스텀 헤더 없이 호출
    // - POST: Content-Type을 text/plain으로 보내면 "simple request"로 preflight 없이 동작
    const isPost = method.toUpperCase() === "POST";
    const res = await fetch(`${base}/${FN_LEADERBOARD}${path}`, {
      method,
      headers: isPost ? { "content-type": "text/plain;charset=UTF-8" } : {},
      body: body ? JSON.stringify(body) : null,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }
    if (!res.ok)
      return { ok: false, error: json?.error || `HTTP_${res.status}` };
    return json || { ok: true };
  }

  // ---------- utils
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // ---------- SFX (tiny WebAudio)
  let audioCtx = null;
  let sfxEnabled = true;
  function ensureAudio() {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function beep({
    f = 440,
    t = 0.08,
    type = "sine",
    g = 0.06,
    detune = 0,
    sweep = 0,
  } = {}) {
    if (!sfxEnabled) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (sweep !== 0)
      o.frequency.exponentialRampToValueAtTime(
        Math.max(40, f + sweep),
        now + t
      );
    o.detune.setValueAtTime(detune, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(g, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t);
    o.connect(gain).connect(audioCtx.destination);
    o.start(now);
    o.stop(now + t + 0.02);
  }
  function sfxHit() {
    beep({ f: 160, t: 0.12, type: "sawtooth", g: 0.09, sweep: -80 });
    setTimeout(
      () => beep({ f: 90, t: 0.1, type: "square", g: 0.06, sweep: -30 }),
      20
    );
  }
  function sfxWin() {
    beep({ f: 420, t: 0.06, type: "triangle", g: 0.06, sweep: 320 });
    setTimeout(
      () => beep({ f: 720, t: 0.07, type: "triangle", g: 0.05, sweep: 520 }),
      45
    );
  }
  function sfxTick() {
    beep({ f: 660, t: 0.03, type: "sine", g: 0.03, detune: rand(-6, 6) });
  }

  // ---------- game state
  const W = canvas.width;
  const H = canvas.height;

  const state = {
    running: false,
    gameOver: false,
    score: 0,
    life: 3,
    round: 1,
    speed: 1.0,
    combo: 0,
    bestCombo: 0,
    shake: 0,
    flash: 0,
    lastTick: 0,
    // new: player/missile loop
    player: {
      lane: 1,
      // hit animation
      status: "alive", // alive | hit | dead
      hitT: 0,
      hitDur: 0.9,
    },
    missile: null,
    nextSpawnIn: 0.6,
    // "살아서 통과" 연출: 카메라가 아래로 내려가는 느낌
    descend: {
      t: 0,
      dur: 0.75,
      from: 0,
      to: 0,
      active: false,
    },
    cameraY: 0,
  };

  const palette = [
    { a: "#7c4dff", b: "#00e5ff" },
    { a: "#00e5ff", b: "#ff2bd6" },
    { a: "#ff2bd6", b: "#7c4dff" },
  ];

  const lanes = [
    { x: W * 0.24, label: "LEFT" },
    { x: W * 0.5, label: "MID" },
    { x: W * 0.76, label: "RIGHT" },
  ];

  // UI layout constants (canvas space)
  const UI_PAD_Y = H * 0.79;
  const UI_PAD_W = 176;
  const UI_PAD_H = 66;
  const PLAYER_R = 26;
  const PLAYER_PAD_GAP = 5; // 패드 위로 5px 띄움
  const HIT_Y_OFFSET = 12; // "맞는 위치"를 공보다 살짝 아래로
  function getPlayerBaseY() {
    // 공이 패드 상단과 5px 간격을 유지하도록 배치
    const padTop = UI_PAD_Y - UI_PAD_H / 2;
    return padTop - PLAYER_PAD_GAP - PLAYER_R;
  }
  function getHitY() {
    return getPlayerBaseY() + HIT_Y_OFFSET;
  }

  const qPorts = [
    { x: W * 0.24, label: "???" },
    { x: W * 0.5, label: "???" },
    { x: W * 0.76, label: "???" },
  ];

  const fx = {
    particles: [],
    streaks: [],
    bursts: [],
  };

  function reset() {
    state.running = true;
    state.gameOver = false;
    state.score = 0;
    state.life = 3;
    state.round = 1;
    state.speed = 1.0;
    state.combo = 0;
    state.bestCombo = 0;
    state.shake = 0;
    state.flash = 0;
    state.player.lane = 1;
    state.player.status = "alive";
    state.player.hitT = 0;
    state.missile = null;
    state.nextSpawnIn = rand(0.35, 0.95);
    state.descend.active = false;
    state.descend.t = 0;
    state.descend.from = 0;
    state.descend.to = 0;
    state.cameraY = 0;
    fx.particles.length = 0;
    fx.streaks.length = 0;
    fx.bursts.length = 0;
    updateHud();
  }

  function updateHud() {
    $score.textContent = String(state.score);
    $life.textContent = String(state.life);
    $round.textContent = String(state.round);
  }

  function setOverlayVisible(visible, title = null) {
    if (visible) {
      $overlay.classList.remove("hidden");
      if (title) {
        const t = $overlay.querySelector(".cardTitle");
        if (t) t.textContent = title;
      }
    } else {
      $overlay.classList.add("hidden");
    }
  }

  function nextRound() {
    state.round += 1;
    // 라운드가 올라가면 미사일 속도/스폰 템포가 조금 빨라짐
    state.speed = clamp(1 + (state.round - 1) * 0.045, 1, 2.4);
    state.nextSpawnIn = rand(0.28, 0.82) / state.speed;
    updateHud();
  }

  function fail(reason = "OUT") {
    state.life -= 1;
    state.combo = 0;
    state.shake = Math.max(state.shake, 18);
    state.flash = Math.max(state.flash, 0.85);
    sfxHit();
    burstAtLane(state.player.lane, "bad");
    updateHud();
    if (state.life <= 0) {
      // 즉시 오버레이 띄우지 말고 "죽는 모션" 먼저 재생
      state.player.status = "hit";
      state.player.hitT = 0;
      state.missile = null;
      state.nextSpawnIn = 999;
      // hitDur 끝나면 게임오버 처리
      setTimeout(() => {
        if (!state.gameOver) {
          state.running = false;
          state.gameOver = true;
          state.player.status = "dead";
          showGameOver(reason);
        }
      }, Math.floor(state.player.hitDur * 1000));
    } else {
      // 맞고도 산 경우: 잠깐 스턴/플래시 후 다음 미사일
      state.player.status = "hit";
      state.player.hitT = 0;
      state.missile = null;
      state.nextSpawnIn = 999;
      setTimeout(() => {
        if (state.gameOver) return;
        state.player.status = "alive";
        state.nextSpawnIn = rand(0.45, 0.95) / state.speed;
      }, 520);
    }
  }

  function win() {
    // 회피 성공: 점수 + 진행 연출(아래로 내려가는 느낌)
    state.score += 120 + Math.floor(state.round * 7) + state.combo * 10;
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    // 3콤보마다 라이프 +1
    if (state.combo % 3 === 0) state.life = clamp(state.life + 1, 0, 9);
    state.flash = Math.max(state.flash, 0.3);
    sfxWin();
    burstAtLane(state.player.lane, "good");
    updateHud();

    // "통과해서 산 거처럼 밑으로 점점 내려가는 느낌"
    startDescend(140 + state.round * 6);
    nextRound();
  }

  function startDescend(amount) {
    const d = state.descend;
    d.active = true;
    d.t = 0;
    d.from = state.cameraY;
    d.to = state.cameraY + amount;
  }

  function chooseLane(lane) {
    if (!state.running || state.gameOver) return;
    if (state.player.status !== "alive") return;
    state.player.lane = clamp(lane, 0, 2);

    // UI pulse
    laneBtns.forEach((b) => b.classList.remove("active"));
    laneBtns[state.player.lane]?.classList.add("active");
    setTimeout(
      () => laneBtns[state.player.lane]?.classList.remove("active"),
      120
    );
  }

  function moveLane(dir) {
    // dir: -1 (left), +1 (right)
    if (!state.running || state.gameOver) return;
    if (state.player.status !== "alive") return;
    chooseLane(state.player.lane + (dir < 0 ? -1 : 1));
  }

  function showGameOver(reason) {
    const body = $overlay.querySelector(".cardBody");
    const actions = $overlay.querySelector(".cardActions");
    if (body) {
      body.innerHTML = `
        <p><b>GAME OVER</b> · ${escapeHtml(reason)}</p>
        <p class="muted">SCORE: <b>${state.score}</b> · BEST COMBO: <b>${
        state.bestCombo
      }</b></p>
        <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          <input id="playerName" maxlength="16" placeholder="이름 (최대 16)" 
            style="flex:1; min-width:170px; padding:12px 12px; border-radius:14px; border:1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: rgba(233,236,255,.92); font-weight:800; letter-spacing:.02em; outline:none" />
          <button id="btnSubmitScore" class="btn primary" style="flex:0 0 auto; min-width:160px">랭킹 등록</button>
        </div>
        <p id="rankStatus" class="muted" style="margin-top:8px"></p>
        <div id="leaderboard" style="margin-top:10px"></div>
        <p class="muted" style="margin-top:10px">다시 한 판? START를 눌러!</p>
      `;
    }
    if (actions) {
      const start = actions.querySelector("#btnStart");
      if (start) start.textContent = "RESTART";
    }
    setOverlayVisible(true, "결과");
    wireGameOverRankingUI();
  }

  function safeName(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "PLAYER";
    return s.replace(/\s+/g, " ").slice(0, 16);
  }

  async function fetchLeaderboard(limit = 10) {
    // legacy kept (all-time). Prefer fetchLeaderboardScoped().
    return fetchLeaderboardScoped("all", limit);
  }

  async function fetchLeaderboardScoped(scope = "all", limit = 10) {
    // 1) Edge Function (권장): 일간/주간/전체 + 서버 검증 기반
    const fn = await callFn(
      `?scope=${encodeURIComponent(scope)}&limit=${encodeURIComponent(
        limit
      )}&game_id=${encodeURIComponent(SB_GAME_ID)}`
    );
    if (fn?.ok)
      return {
        ok: true,
        reason: null,
        rows: fn.rows || [],
        scope: fn.scope || scope,
      };

    // 2) Fallback: direct select (all-time only; 치팅 방지/기간 필터 없음)
    const sb = getSupabase();
    if (!sb) return { ok: false, reason: "SUPABASE_NOT_CONFIGURED", rows: [] };
    const { data, error } = await sb
      .from(RANKING_TABLE)
      .select("name, score, best_combo, round, updated_at")
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, reason: error.message, rows: [] };
    return { ok: true, reason: null, rows: data || [], scope: "all" };
  }

  async function submitScore(name) {
    const payload = {
      game_id: SB_GAME_ID,
      name: safeName(name),
      score: state.score,
      best_combo: state.bestCombo,
      round: state.round,
    };

    // 1) Edge Function upsert + server-side validation
    const fn = await callFn("/submit", { method: "POST", body: payload });
    if (fn?.ok) return { ok: true, reason: null };

    // 2) Fallback: direct upsert (requires DB unique constraint to behave correctly)
    const sb = getSupabase();
    if (!sb) return { ok: false, reason: "SUPABASE_NOT_CONFIGURED" };
    const name_key = payload.name.toLowerCase();
    const { error } = await sb
      .from(RANKING_TABLE)
      .upsert(
        { ...payload, name_key, updated_at: new Date().toISOString() },
        { onConflict: "game_id,name_key" }
      );
    if (error) return { ok: false, reason: error.message };
    return { ok: true, reason: null };
  }

  function renderLeaderboard(el, rows) {
    if (!el) return;
    if (!rows?.length) {
      el.innerHTML =
        '<div class="muted" style="opacity:.9">아직 랭킹이 없어요.</div>';
      return;
    }
    const items = rows
      .map((r, i) => {
        const nm = escapeHtml(r.name ?? "PLAYER");
        const sc = Number(r.score ?? 0);
        const bc = Number(r.best_combo ?? 0);
        const rd = Number(r.round ?? 0);
        return `
          <div style="display:flex; justify-content:space-between; gap:10px; padding:10px 12px; border-radius:14px; border:1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.04); margin:8px 0">
            <div style="display:flex; gap:10px; align-items:baseline">
              <div style="font-weight:900; opacity:.85; min-width:34px">#${
                i + 1
              }</div>
              <div style="font-weight:900">${nm}</div>
              <div class="muted" style="font-size:12px">R${rd} · C${bc}</div>
            </div>
            <div style="font-weight:900">${sc}</div>
          </div>
        `;
      })
      .join("");
    el.innerHTML = `
      <div style="font-weight:900; letter-spacing:.08em; font-size:12px; opacity:.9; margin-bottom:6px">LEADERBOARD</div>
      ${items}
    `;
  }

  function setRankStatus(msg) {
    const el = $overlay.querySelector("#rankStatus");
    if (el) el.textContent = msg || "";
  }

  async function wireGameOverRankingUI() {
    const input = /** @type {HTMLInputElement|null} */ (
      $overlay.querySelector("#playerName")
    );
    const btn = $overlay.querySelector("#btnSubmitScore");
    const board = $overlay.querySelector("#leaderboard");
    const body = $overlay.querySelector(".cardBody");
    if (input) input.value = localStorage.getItem("PLAYER_NAME") || "";

    // scope tabs
    if (body && !body.querySelector("#rankTabs")) {
      const tabs = document.createElement("div");
      tabs.id = "rankTabs";
      tabs.style.cssText =
        "display:flex; gap:8px; margin-top:10px; flex-wrap:wrap";
      tabs.innerHTML = `
        <button data-scope="all" class="btn" style="flex:0 0 auto; padding:10px 12px">전체</button>
        <button data-scope="daily" class="btn" style="flex:0 0 auto; padding:10px 12px">오늘</button>
        <button data-scope="weekly" class="btn" style="flex:0 0 auto; padding:10px 12px">이번주</button>
      `;
      const status = body.querySelector("#rankStatus");
      status?.parentElement?.insertBefore(tabs, status);
    }

    // 초기 로드
    const hasFn = !!getFunctionsBase() && !!SB_ANON_KEY;
    const sb = getSupabase();
    if (!hasFn && !sb) {
      setRankStatus(
        "랭킹 사용하려면 Supabase 설정이 필요해요. (SB_URL / SB_ANON_KEY)"
      );
      renderLeaderboard(board, []);
      return;
    }

    let currentScope = "all";
    async function load(scope) {
      currentScope = scope || "all";
      setRankStatus("랭킹 불러오는 중...");
      const res = await fetchLeaderboardScoped(currentScope, 10);
      if (res.ok) {
        setRankStatus("");
        renderLeaderboard(board, res.rows);
      } else {
        setRankStatus(`랭킹 로드 실패: ${res.reason}`);
        renderLeaderboard(board, []);
      }
    }

    // hook tab clicks
    $overlay.querySelectorAll("#rankTabs [data-scope]").forEach((b) => {
      b.onclick = () => load(b.getAttribute("data-scope"));
    });

    await load(currentScope);

    if (btn) {
      btn.onclick = async () => {
        const name = safeName(input?.value || "");
        localStorage.setItem("PLAYER_NAME", name);
        setRankStatus("등록 중...");
        const out = await submitScore(name);
        if (!out.ok) {
          setRankStatus(`등록 실패: ${out.reason}`);
          return;
        }
        setRankStatus("등록 완료!");
        const next = await fetchLeaderboardScoped(currentScope, 10);
        if (next.ok) renderLeaderboard(board, next.rows);
      };
    }
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        }[m])
    );
  }

  // ---------- FX spawners
  function addParticle(p) {
    fx.particles.push(p);
    if (fx.particles.length > 520)
      fx.particles.splice(0, fx.particles.length - 520);
  }
  function burstAtLane(lane, kind) {
    const x = lanes[lane].x;
    const y = H * 0.78;
    const col = palette[lane];
    // 피격 순간 프레임 드랍 방지: 파티클 수를 조금 줄임
    const n = kind === "good" ? 48 : 54;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp =
        rand(kind === "good" ? 280 : 360, kind === "good" ? 760 : 920) *
        state.speed;
      addParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(120, 320),
        r: rand(1.5, kind === "good" ? 4.8 : 5.8),
        life: rand(0.35, kind === "good" ? 0.85 : 1.05),
        t: 0,
        a: col.a,
        b: col.b,
        kind,
      });
    }
  }

  function spawnAmbient() {
    // small drifting particles
    if (Math.random() < 0.22) {
      const lane = randi(0, 2);
      const col = palette[lane];
      addParticle({
        x: rand(0, W),
        y: rand(-20, H),
        vx: rand(-22, 22),
        vy: rand(20, 88),
        r: rand(0.8, 2.2),
        life: rand(1.2, 2.4),
        t: 0,
        a: col.a,
        b: col.b,
        kind: "amb",
      });
    }
  }

  // ---------- render helpers
  function setShadow(color, blur, ox = 0, oy = 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = ox;
    ctx.shadowOffsetY = oy;
  }

  function drawScanlines(alpha = 0.08) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawHUDbar() {
    // 라이프 +1까지의 진행도 바 (3콤보당 1라이프)
    const pad = 44;
    const w = W - pad * 2;
    const h = 16;
    const x = pad;
    const y = 74;
    // combo: 0,1,2 -> 0/3, 1/3, 2/3 진행
    const progress = (state.combo % 3) / 3;
    const t = clamp(progress, 0, 1);

    ctx.save();
    roundedRect(x, y, w, h, 10);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();

    const col = t < 0.66 ? "rgba(0,229,255,0.85)" : "rgba(255,43,214,0.90)";
    setShadow(col, 18);
    roundedRect(x, y, w * t, h, 10);
    ctx.fillStyle = col;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    // 3등분(1/3, 2/3) 마커
    ctx.fillRect(x + w / 3, y + 2, 1, h - 4);
    ctx.fillRect(x + (w * 2) / 3, y + 2, 1, h - 4);
    ctx.restore();
  }

  function drawLifeHearts() {
    const n = clamp(state.life, 0, 9);
    const x0 = 56;
    const y0 = 34;
    const gap = 34;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.font =
      "900 22px ui-sans-serif, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = "LIFE";
    setShadow("rgba(0,229,255,0.35)", 16);
    ctx.fillStyle = "rgba(233,236,255,0.78)";
    ctx.fillText(label, x0, y0);

    for (let i = 0; i < 9; i++) {
      const x = x0 + 74 + i * gap;
      const on = i < n;
      const col = on ? "rgba(255,43,214,0.92)" : "rgba(255,255,255,0.16)";
      setShadow(on ? "rgba(255,43,214,0.55)" : "rgba(0,0,0,0)", on ? 18 : 0);
      drawHeart(x, y0, 9.6);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = on
        ? "rgba(255,255,255,0.18)"
        : "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerBall(tNow) {
    // 플레이어는 현재 lane 위치에 존재
    const x = lanes[state.player.lane].x;
    const baseY = getPlayerBaseY();
    const hit = state.player.status === "hit";
    const k = hit ? clamp(state.player.hitT / state.player.hitDur, 0, 1) : 0;
    // 맞으면: 뒤로 젖혀지고(위로 튕김) + 약간 옆으로 흔들 + 회전 느낌(빛 링)
    const y = baseY - (hit ? Math.sin(k * Math.PI) * 110 + k * 40 : 0);
    const r = PLAYER_R;
    const lifeMax = 9;
    const ratio = clamp(state.life / lifeMax, 0, 1);

    // color ramp: low life -> hot pink/red, high life -> cyan/purple
    const cLow = { r: 255, g: 43, b: 214 }; // #ff2bd6
    const cHigh = { r: 0, g: 229, b: 255 }; // #00e5ff
    const cr = Math.round(lerp(cLow.r, cHigh.r, ratio));
    const cg = Math.round(lerp(cLow.g, cHigh.g, ratio));
    const cb = Math.round(lerp(cLow.b, cHigh.b, ratio));
    const shield = `rgba(${cr},${cg},${cb},1)`;

    const pulse = 0.6 + 0.4 * Math.sin(tNow * 0.006);
    const shieldAlpha = 0.25 + 0.55 * ratio;
    const shieldBlur = 16 + 36 * ratio;
    const shieldW = 3 + 6 * ratio;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // outer shield glow
    const hurtBoost = hit ? 0.55 + 0.8 * (1 - k) : 0;
    setShadow(
      `rgba(${cr},${cg},${cb},${shieldAlpha})`,
      (shieldBlur + 10 * pulse) * (1 + hurtBoost)
    );
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${shieldAlpha})`;
    ctx.lineWidth = shieldW * (1 + 0.6 * hurtBoost);
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      r + 18 + 4 * pulse + (hit ? 14 * (1 - k) : 0),
      0,
      Math.PI * 2
    );
    ctx.stroke();

    // secondary ring if high life
    if (ratio > 0.55) {
      ctx.shadowBlur = shieldBlur * 0.65;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(2, shieldW * 0.55);
      ctx.beginPath();
      ctx.arc(x, y, r + 28 + 6 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // core ball
    ctx.shadowBlur = 0;
    const g = ctx.createRadialGradient(x - 8, y - 10, 6, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.35, `rgba(${cr},${cg},${cb},0.55)`);
    g.addColorStop(1, "rgba(10,12,30,0.85)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // life number inside
    ctx.font =
      "900 24px ui-sans-serif, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setShadow("rgba(0,0,0,0.45)", 8, 0, 2);
    ctx.fillStyle = "rgba(233,236,255,0.90)";
    ctx.fillText(String(state.life), x, y + 1);

    // hit "레이저 맞고 죽는" 느낌: 파편/링 추가
    if (hit) {
      const ringA = 0.75 * (1 - k);
      ctx.globalAlpha = ringA;
      ctx.lineWidth = 3.5;
      setShadow("rgba(255,43,214,0.75)", 30);
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath();
      ctx.arc(x, y, r + 46 + k * 55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawHeart(cx, cy, s) {
    ctx.beginPath();
    const x = cx,
      y = cy;
    ctx.moveTo(x, y + s * 0.6);
    ctx.bezierCurveTo(
      x - s * 1.2,
      y - s * 0.2,
      x - s * 0.55,
      y - s * 1.2,
      x,
      y - s * 0.45
    );
    ctx.bezierCurveTo(
      x + s * 0.55,
      y - s * 1.2,
      x + s * 1.2,
      y - s * 0.2,
      x,
      y + s * 0.6
    );
    ctx.closePath();
  }

  function drawLanes() {
    ctx.save();
    const top = 190;
    const bottom = H - 180;
    for (let i = 0; i < 3; i++) {
      const x = lanes[i].x;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();

      // base pads
      // 요청: LEFT/MID/RIGHT 패드를 조금 위로
      const baseY = UI_PAD_Y;
      const col = palette[i];
      const isPlayer = i === state.player.lane;
      const hot = isPlayer ? 1 : 0.35;
      const glow = isPlayer ? 34 : 20;
      ctx.globalAlpha = 0.95;
      setShadow(isPlayer ? col.b : "rgba(124,77,255,0.35)", glow);
      const bw = UI_PAD_W,
        bh = UI_PAD_H;
      roundedRect(x - bw / 2, baseY - bh / 2, bw, bh, 18);
      const grad = ctx.createLinearGradient(
        x - bw / 2,
        baseY,
        x + bw / 2,
        baseY
      );
      grad.addColorStop(0, withAlpha(col.a, 0.1 + hot * 0.12));
      grad.addColorStop(1, withAlpha(col.b, 0.06 + hot * 0.14));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.stroke();

      // labels
      ctx.fillStyle = "rgba(233,236,255,0.72)";
      ctx.font =
        "900 26px ui-sans-serif, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lanes[i].label, x, baseY);
    }
    ctx.restore();
  }

  function withAlpha(hex, a) {
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function drawMissile(tNow) {
    const m = state.missile;
    if (!m) return;
    const col = palette[m.lane];
    const x = lanes[m.lane].x;
    const y = m.y;

    // 아래에서 위로 올라오는 "정체모를 미사일/레이저" 연출
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // exhaust streaks (upwards)
    if (
      state.running &&
      state.player.status === "alive" &&
      Math.random() < 0.62
    ) {
      fx.streaks.push({
        x: x + rand(-9, 9),
        y: y + rand(12, 44),
        len: rand(60, 160),
        w: rand(2, 6),
        life: rand(0.1, 0.22),
        t: 0,
        a: col.a,
        b: col.b,
      });
      if (fx.streaks.length > 120)
        fx.streaks.splice(0, fx.streaks.length - 120);
    }

    // beam tail from bottom -> missile
    const yBottom = H * 0.95;
    const grad = ctx.createLinearGradient(x, yBottom, x, y);
    grad.addColorStop(0, withAlpha(col.b, 0.0));
    grad.addColorStop(0.18, withAlpha(col.b, 0.35));
    grad.addColorStop(0.55, withAlpha(col.a, 0.55));
    grad.addColorStop(1, withAlpha(col.b, 0.0));
    setShadow(withAlpha(col.b, 0.85), 34);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(x, yBottom);
    ctx.lineTo(x, y + 26);
    ctx.stroke();

    // missile body glow
    const pulse = 0.7 + 0.3 * Math.sin(tNow * 0.012);
    setShadow(col.b, 46 + 22 * pulse);
    ctx.fillStyle = withAlpha(col.b, 0.22);
    ctx.beginPath();
    ctx.arc(x, y, 54 + 8 * pulse, 0, Math.PI * 2);
    ctx.fill();

    setShadow(col.a, 34 + 18 * pulse);
    ctx.fillStyle = withAlpha(col.a, 0.26);
    ctx.beginPath();
    ctx.arc(x, y, 34 + 6 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // core
    ctx.shadowBlur = 0;
    const g = ctx.createRadialGradient(x - 10, y - 12, 6, x, y, 30);
    g.addColorStop(0, "rgba(255,255,255,0.92)");
    g.addColorStop(0.4, withAlpha(col.b, 0.88));
    g.addColorStop(1, withAlpha(col.a, 0.2));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 20 + 3 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // ring
    ctx.strokeStyle = withAlpha(col.b, 0.75);
    ctx.lineWidth = 3;
    setShadow(col.b, 18);
    ctx.beginPath();
    ctx.arc(x, y, 34 + 5 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawQPorts() {
    // 요청: ??? 박스는 더 이상 표시하지 않음
  }

  function drawHitMarkers(tNow) {
    const y = getHitY();
    const wobble = 0.6 + 0.4 * Math.sin(tNow * 0.006);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const x = lanes[i].x;
      const col = palette[i];
      const a = 0.22 + 0.1 * wobble;
      setShadow(withAlpha(col.b, a), 18);
      ctx.strokeStyle = withAlpha(col.b, a);
      ctx.lineWidth = 2.5;
      // 작은 브라켓( ) 모양의 타겟 마커
      ctx.beginPath();
      ctx.arc(x, y, 22, Math.PI * 0.15, Math.PI * 0.85);
      ctx.arc(x, y, 22, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      // 중앙 점
      ctx.shadowBlur = 0;
      ctx.fillStyle = withAlpha(col.a, 0.18 + 0.12 * wobble);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLaser(tNow) {
    // legacy function kept for compatibility - now missile handles beam visuals.
    // intentionally no-op
    void tNow;
  }

  function drawStreaks(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = fx.streaks.length - 1; i >= 0; i--) {
      const s = fx.streaks[i];
      s.t += dt;
      const k = 1 - s.t / s.life;
      if (k <= 0) {
        fx.streaks.splice(i, 1);
        continue;
      }
      const a = k * 0.75;
      const grad = ctx.createLinearGradient(s.x, s.y - s.len, s.x, s.y);
      grad.addColorStop(0, withAlpha(s.a, 0));
      grad.addColorStop(0.55, withAlpha(s.b, a * 0.45));
      grad.addColorStop(1, withAlpha(s.a, a));
      ctx.lineWidth = s.w;
      setShadow(withAlpha(s.b, a), 18);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - s.len);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.t += dt;
      const k = 1 - p.t / p.life;
      if (k <= 0) {
        fx.particles.splice(i, 1);
        continue;
      }
      // integrate
      const g = p.kind === "amb" ? 80 : 980;
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.988;
      p.vy *= 0.988;

      const a = (p.kind === "bad" ? 0.95 : 0.75) * k;
      const col = p.kind === "amb" ? p.b : pick([p.a, p.b]);
      setShadow(withAlpha(col, a), p.kind === "amb" ? 10 : 24);
      ctx.fillStyle = withAlpha(col, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.7 + 0.6 * (1 - k)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFrame(tNow, dt) {
    // screen shake
    const sh = state.shake;
    state.shake = Math.max(0, state.shake - 48 * dt);
    const sx = sh > 0 ? rand(-sh, sh) : 0;
    const sy = sh > 0 ? rand(-sh, sh) : 0;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    // descend camera easing
    if (state.descend.active) {
      const d = state.descend;
      d.t += dt;
      const p = clamp(d.t / d.dur, 0, 1);
      state.cameraY = lerp(d.from, d.to, easeOutCubic(p));
      if (p >= 1) d.active = false;
    }

    // camera down 느낌: "월드(배경/미사일)"만 위로 움직이게
    // UI(LEFT/MID/RIGHT 패드 + 공 + HUD)는 화면에 고정
    const cam = state.cameraY % 320;

    // ---- world layer (scrolls)
    ctx.save();
    ctx.translate(sx, sy - cam);

    // bg vignette
    const bg = ctx.createRadialGradient(
      W * 0.5,
      H * 0.45,
      120,
      W * 0.5,
      H * 0.5,
      H * 0.82
    );
    bg.addColorStop(0, "rgba(20,26,62,0.20)");
    bg.addColorStop(0.55, "rgba(6,8,20,0.16)");
    bg.addColorStop(1, "rgba(0,0,0,0.40)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // subtle grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    // world elements
    drawStreaks(dt);
    drawMissile(tNow);
    drawParticles(dt);
    ctx.restore();

    // ---- UI layer (fixed)
    ctx.save();
    ctx.translate(sx, sy);
    drawLifeHearts();
    drawHUDbar();
    drawHitMarkers(tNow);
    drawLanes();
    drawPlayerBall(tNow);
    drawScanlines(0.1);

    // flash overlay
    if (state.flash > 0.001) {
      state.flash = Math.max(0, state.flash - 1.6 * dt);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = state.flash * 0.55;
      const f = ctx.createLinearGradient(0, 0, W, H);
      f.addColorStop(0, "rgba(124,77,255,0.40)");
      f.addColorStop(0.55, "rgba(0,229,255,0.20)");
      f.addColorStop(1, "rgba(255,43,214,0.30)");
      ctx.fillStyle = f;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // combo text
    if (state.combo > 1 && state.running) {
      const txt = `COMBO x${state.combo}`;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.font =
        "900 40px ui-sans-serif, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const y = 140;
      const col = "rgba(0,229,255,0.85)";
      setShadow(col, 26);
      ctx.fillStyle = col;
      ctx.fillText(txt, W * 0.5, y);
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  // ---------- main loop
  let last = performance.now();
  function frame(now) {
    // dt를 너무 타이트하게(0.033) 자르면 프레임이 밀릴 때 "끊기는 느낌"이 날 수 있어서
    // 약간 여유를 주고(0.05) 연산 폭증은 clamp로 막음
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;

    // hit animation timeline
    if (state.player.status === "hit") {
      state.player.hitT += dt;
      if (
        state.player.hitT >= state.player.hitDur &&
        state.life > 0 &&
        !state.gameOver
      ) {
        state.player.status = "alive";
        state.player.hitT = state.player.hitDur;
      }
    }

    // spawn missile (random lane, not visible until it starts moving from bottom)
    if (state.running && !state.gameOver && state.player.status === "alive") {
      state.nextSpawnIn = Math.max(0, state.nextSpawnIn - dt);
      const threshold = 0.22;
      if (state.nextSpawnIn <= threshold && state.nextSpawnIn + dt > threshold)
        sfxTick();

      if (!state.missile && state.nextSpawnIn <= 0) {
        const lane = randi(0, 2);
        state.missile = {
          lane,
          y: H + 120,
          vy: -(900 + state.round * 14) * state.speed, // up
          r: 32,
        };
        // 발사 사운드
        beep({ f: 980, t: 0.05, type: "triangle", g: 0.05, sweep: -420 });
        setTimeout(
          () =>
            beep({ f: 280, t: 0.07, type: "sawtooth", g: 0.04, sweep: -120 }),
          18
        );
      }
    }

    // missile movement + collision
    if (state.running && state.missile) {
      const m = state.missile;
      m.y += m.vy * dt;

      // collision with player (same lane + y overlap)
      const playerY = getHitY() - (state.player.status === "hit" ? 90 : 0);
      if (state.player.status === "alive" && m.lane === state.player.lane) {
        const dy = Math.abs(m.y - playerY);
        if (dy < 44) {
          fail("레이저 맞음");
        }
      }

      // survived (passed beyond top)
      if (m.y < -140 && state.player.status === "alive") {
        state.missile = null;
        state.nextSpawnIn = rand(0.28, 0.88) / state.speed;
        win();
      }

      // remove missile if gameover/hit occurred mid-flight
      if (state.player.status !== "alive") {
        state.missile = null;
      }
    }

    // 피격 순간엔 잔먼지 FX를 줄여 프레임 드랍을 방지
    if (state.player.status !== "hit") spawnAmbient();
    drawFrame(now, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- input wiring
  function onKey(e) {
    const k = e.key.toLowerCase();
    // 좌/우는 "한 칸 이동" (RIGHT에서 ← 누르면 MID로)
    if (k === "arrowleft" || k === "a") moveLane(-1);
    if (k === "arrowright" || k === "d") moveLane(1);
    // MID는 별도: ↑(또는 W)로 중앙 고정
    if (k === "arrowup" || k === "w") chooseLane(1);
    // (기존 ↓/S도 중앙으로 유지)
    if (k === "arrowdown" || k === "s") chooseLane(1);
    if (k === "enter" && !state.running) startGame();
  }
  window.addEventListener("keydown", onKey);

  laneBtns.forEach((b) => {
    b.addEventListener("click", () => chooseLane(Number(b.dataset.lane)));
  });

  // 모바일/터치: 캔버스 "왼쪽 영역 탭 = 왼쪽으로", "오른쪽 영역 탭 = 오른쪽으로"
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      // 오버레이(규칙/결과) 떠있을 때는 무시
      if (!state.running || state.gameOver) return;
      if (state.player.status !== "alive") return;
      if (!$overlay.classList.contains("hidden")) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const half = rect.width * 0.5;

      if (x < half) moveLane(-1);
      else moveLane(1);

      // 스크롤/줌 제스처 방지
      e.preventDefault?.();
    },
    { passive: false }
  );

  function startGame() {
    reset();
    setOverlayVisible(false);
  }
  $btnStart.addEventListener("click", () => startGame());

  $btnMute.addEventListener("click", () => {
    sfxEnabled = !sfxEnabled;
    $btnMute.textContent = sfxEnabled ? "SFX ON" : "SFX OFF";
    if (sfxEnabled)
      beep({ f: 520, t: 0.05, type: "triangle", g: 0.05, sweep: 240 });
  });

  // allow audio on first interaction (mobile)
  window.addEventListener(
    "pointerdown",
    () => {
      if (sfxEnabled) ensureAudio();
    },
    { once: true }
  );

  // initial render state
  setOverlayVisible(true, "규칙");
})();
