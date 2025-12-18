// Supabase Edge Function: leaderboard
// - POST  /submit        { game_id, name, score, best_combo, round }
// - GET   /leaderboard?game_id=run&scope=all|daily|weekly&limit=10
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// This function uses service role to write/read rankings securely.
// Client still passes anon key for authorization header, but DB writes are validated here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Scope = "all" | "daily" | "weekly";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders,
    },
  });
}

function normalizeName(name: unknown) {
  const s = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 16);
  const safe = s || "PLAYER";
  const key = safe.toLowerCase();
  return { name: safe, name_key: key };
}

function normalizeGameId(gameId: unknown) {
  const raw = String(gameId ?? "").trim().toLowerCase();
  // allow: a-z0-9_- (1..24)
  const safe = raw.replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  return safe || "run";
}

function toInt(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.trunc(x);
}

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function kstStartOfDayISO() {
  const d = kstNow();
  d.setUTCHours(0, 0, 0, 0);
  // convert back to UTC by subtracting 9h
  return new Date(d.getTime() - 9 * 60 * 60 * 1000).toISOString();
}

function kstStartOfWeekISO() {
  // week starts on Monday in KST
  const d = kstNow();
  d.setUTCHours(0, 0, 0, 0);
  // JS getUTCDay(): 0 Sun .. 6 Sat (but we're using "shifted KST time" in UTC fields)
  const day = d.getUTCDay();
  const diffToMon = (day + 6) % 7; // Mon=0, Sun=6
  d.setUTCDate(d.getUTCDate() - diffToMon);
  return new Date(d.getTime() - 9 * 60 * 60 * 1000).toISOString();
}

// ultra-simple in-memory rate limit (best-effort)
const rl = new Map<string, number[]>();
function allow(ip: string, max = 10, windowMs = 30_000) {
  const now = Date.now();
  const arr = rl.get(ip) ?? [];
  const next = arr.filter((t) => now - t < windowMs);
  next.push(now);
  rl.set(ip, next);
  return next.length <= max;
}

function getIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function validateScore(payload: {
  score: number | null;
  round: number | null;
  best_combo: number | null;
}) {
  const { score, round, best_combo } = payload;
  if (score == null || round == null || best_combo == null) return "BAD_INPUT";
  if (score < 0 || score > 1_000_000) return "SCORE_OUT_OF_RANGE";
  if (round < 1 || round > 5000) return "ROUND_OUT_OF_RANGE";
  if (best_combo < 0 || best_combo > 5000) return "COMBO_OUT_OF_RANGE";
  if (best_combo > round) return "COMBO_GT_ROUND";
  // weak sanity check: score should roughly grow with round
  if (score < round * 30) return "SCORE_TOO_LOW_FOR_ROUND";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "SERVER_NOT_CONFIGURED" }, 500);
  }

  const ip = getIp(req);
  if (!allow(ip)) return json({ ok: false, error: "RATE_LIMITED" }, 429);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // GET https://<project>.supabase.co/functions/v1/leaderboard?...
  if (req.method === "GET" && path.endsWith("/leaderboard")) {
    const game_id = normalizeGameId(url.searchParams.get("game_id"));
    const scope = (url.searchParams.get("scope") || "all") as Scope;
    const limit = Math.max(
      1,
      Math.min(50, Number(url.searchParams.get("limit") || 10))
    );
    const since =
      scope === "daily"
        ? kstStartOfDayISO()
        : scope === "weekly"
          ? kstStartOfWeekISO()
          : null;

    let q = sb
      .from("rankings")
      .select("name, score, best_combo, round, updated_at")
      .eq("game_id", game_id)
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (since) q = q.gte("updated_at", since);

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true, game_id, scope, since, rows: data ?? [] });
  }

  // POST https://<project>.supabase.co/functions/v1/leaderboard/submit
  if (req.method === "POST" && path.endsWith("/leaderboard/submit")) {
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "BAD_JSON" }, 400);
    }

    const game_id = normalizeGameId(body?.game_id);
    const { name, name_key } = normalizeName(body?.name);
    const score = toInt(body?.score);
    const best_combo = toInt(body?.best_combo);
    const round = toInt(body?.round);
    const bad = validateScore({ score, best_combo, round });
    if (bad) return json({ ok: false, error: bad }, 400);

    const row = {
      game_id,
      name,
      name_key,
      score,
      best_combo,
      round,
      updated_at: new Date().toISOString(),
    };

    // upsert by (game_id, name_key): keep only latest row per nickname per game
    const { error } = await sb.from("rankings").upsert(row, {
      onConflict: "game_id,name_key",
    });
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ ok: false, error: "NOT_FOUND" }, 404);
});

