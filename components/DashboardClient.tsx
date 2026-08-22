"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import type { DashboardGame, DashboardMention } from "@/lib/types";
import type { PlanName } from "@/lib/plans";
import { PLAN_LABELS, PLAN_LIMITS } from "@/lib/plans";

type DashboardStats = {
  signalCount: number;
  liveNowCount: number;
  creatorCount: number;
  totalReach: number;
};

type Props = {
  email: string;
  workspaceName: string;
  workspaceId: string;
  plan: PlanName;
  initialGames: DashboardGame[];
  initialMentions: DashboardMention[];
  initialStats: DashboardStats;
};

type PendingGame = {
  title?: string;
  aliases?: string;
  steamUrl?: string;
};

type GameConfigResponse = {
  game?: DashboardGame;
  aliases?: string[];
  excludes?: string[];
  error?: string;
};

const TWITCH_LIVE_FRESHNESS_MS = 6 * 60 * 1000;
const DASHBOARD_MENTIONS_PER_PLATFORM = 100;
const PENDING_GAME_STORAGE_KEY = "who-plays-my-game-pending-game";
const LEGACY_PENDING_GAME_STORAGE_KEY = "gamesignal-pending-game";
const PLANS_HREF = "/dashboard/settings";

function platformClass(platform: DashboardMention["platform"]) {
  if (platform === "youtube") return { cls: "y", short: "YT" };
  if (platform === "twitch") return { cls: "t", short: "TW" };
  return { cls: "k", short: "K" };
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function scanTime(value: string | null) {
  return value ? `${relativeTime(value)} ago` : "pending";
}

function isTwitchLive(mention: DashboardMention) {
  return mention.platform === "twitch" && Boolean(
    mention.last_seen_at && Date.now() - new Date(mention.last_seen_at).getTime() <= TWITCH_LIVE_FRESHNESS_MS,
  );
}

function capMentionsByPlatform(input: DashboardMention[]) {
  const counts = new Map<DashboardMention["platform"], number>();
  return [...input]
    .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
    .filter((mention) => {
      const count = counts.get(mention.platform) ?? 0;
      if (count >= DASHBOARD_MENTIONS_PER_PLATFORM) return false;
      counts.set(mention.platform, count + 1);
      return true;
    });
}

export default function DashboardClient({
  email,
  workspaceName,
  workspaceId,
  plan,
  initialGames,
  initialMentions,
  initialStats,
}: Props) {
  const router = useRouter();
  const [games, setGames] = useState(initialGames);
  const [mentions, setMentions] = useState(() => capMentionsByPlatform(initialMentions));
  const [stats, setStats] = useState(initialStats);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<DashboardGame | null>(null);
  const [title, setTitle] = useState("");
  const [steamUrl, setSteamUrl] = useState("");
  const [aliases, setAliases] = useState("");
  const [excludes, setExcludes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "youtube" | "twitch">("all");

  const filteredMentions = useMemo(
    () => mentions.filter((mention) => filter === "all" || mention.platform === filter),
    [mentions, filter],
  );

  const hasPaidPlan = plan !== "free";
  const gameLimit = hasPaidPlan ? PLAN_LIMITS[plan].games : 0;
  const planLabel = PLAN_LABELS[plan];
  const activeGames = hasPaidPlan ? games.filter((game) => game.enabled).length : 0;
  const atGameLimit = hasPaidPlan && activeGames >= gameLimit;

  useEffect(() => {
    const supabase = createClient();
    const gameTitleById = new Map(games.map((game) => [game.id, game.title]));
    const channel = supabase
      .channel(`workspace-mentions-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mentions" },
        (payload) => {
          const row = payload.new as Omit<DashboardMention, "games">;
          const gameTitle = gameTitleById.get(row.game_id);
          if (!gameTitle) return;
          setMentions((current) => {
            if (current.some((mention) => mention.id === row.id)) return current;
            return capMentionsByPlatform([{ ...row, games: { title: gameTitle } }, ...current]);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mentions" },
        (payload) => {
          const row = payload.new as Omit<DashboardMention, "games">;
          setMentions((current) => current.map((mention) => mention.id === row.id ? { ...mention, ...row } : mention));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [games, workspaceId]);

  useEffect(() => {
    setGames(initialGames);
  }, [initialGames]);

  useEffect(() => {
    setMentions(capMentionsByPlatform(initialMentions));
  }, [initialMentions]);

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  useEffect(() => {
    if (!hasPaidPlan || !games.some((game) => game.enabled)) return;

    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [games, hasPaidPlan, router]);

  useEffect(() => {
    const pendingRaw = localStorage.getItem(PENDING_GAME_STORAGE_KEY) ?? localStorage.getItem(LEGACY_PENDING_GAME_STORAGE_KEY);
    if (!pendingRaw) return;

    if (!hasPaidPlan) {
      router.push(PLANS_HREF);
      return;
    }

    localStorage.removeItem(PENDING_GAME_STORAGE_KEY);
    localStorage.removeItem(LEGACY_PENDING_GAME_STORAGE_KEY);
    try {
      const pending = JSON.parse(pendingRaw) as PendingGame;
      setEditingGame(null);
      setTitle(pending.title ?? "");
      setSteamUrl(pending.steamUrl ?? "");
      setAliases(pending.aliases ?? "");
      setExcludes("");
      setModalOpen(true);
    } catch {
      // Ignore malformed browser data.
    }
  }, [hasPaidPlan, router]);

  function openNewMonitor() {
    if (!hasPaidPlan) {
      router.push(PLANS_HREF);
      return;
    }
    setEditingGame(null);
    setTitle("");
    setSteamUrl("");
    setAliases("");
    setExcludes("");
    setMessage(null);
    setModalOpen(true);
  }

  async function openEditMonitor(game: DashboardGame) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/games/${game.id}`);
      const result = (await response.json()) as GameConfigResponse;
      if (!response.ok || !result.game) throw new Error(result.error ?? "Could not load monitor settings.");
      setEditingGame(result.game);
      setTitle(result.game.title);
      setSteamUrl(result.game.steam_url ?? "");
      setAliases((result.aliases ?? []).join(", "));
      setExcludes((result.excludes ?? []).join(", "));
      setModalOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load monitor settings.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMonitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(editingGame ? `/api/games/${editingGame.id}` : "/api/games", {
        method: editingGame ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, steamUrl, aliases, excludes }),
      });
      const result = (await response.json()) as GameConfigResponse;
      if (!response.ok || !result.game) throw new Error(result.error ?? "Could not save the monitor.");

      if (editingGame) {
        setGames((current) => current.map((game) => game.id === result.game?.id ? result.game as DashboardGame : game));
        setMessage(`${result.game.title} monitor settings updated.`);
      } else {
        setGames((current) => [result.game as DashboardGame, ...current]);
        setMessage("Game added. YouTube and Twitch monitoring will start automatically.");
      }

      setEditingGame(null);
      setTitle("");
      setSteamUrl("");
      setAliases("");
      setExcludes("");
      setModalOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the monitor.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleGame(game: DashboardGame) {
    if (!hasPaidPlan && !game.enabled) {
      router.push(PLANS_HREF);
      return;
    }

    const nextEnabled = !game.enabled;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const result = (await response.json()) as GameConfigResponse;
      if (!response.ok || !result.game) throw new Error(result.error ?? `Could not ${nextEnabled ? "resume" : "pause"} the game.`);
      setGames((current) => current.map((item) => item.id === game.id ? result.game as DashboardGame : item));
      setMessage(`${game.title} monitoring ${nextEnabled ? "resumed" : "paused"}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not ${nextEnabled ? "resume" : "pause"} the game.`);
    } finally {
      setBusy(false);
    }
  }

  async function removeGame(id: string) {
    if (!window.confirm("Remove this game and its monitoring data?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/games/${id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not remove the game.");
      setGames((current) => current.filter((game) => game.id !== id));
      setMessage("Game removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the game.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className={`app-shell${busy ? " loading-inline" : ""}`}>
      <header className="app-topbar">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark" />
          <span>{BRAND.name}</span>
        </Link>
        <div className="app-topbar-right">
          <span>{email}</span>
          <button className="icon-btn" onClick={signOut}>Log out</button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="workspace-chip">
            <span>Workspace</span>
            <strong>{workspaceName}</strong>
          </div>
          <nav className="side-nav">
            <Link className="side-link active" href="/dashboard">⌁ Signals</Link>
            <a className="side-link" href="#games">◫ Games</a>
            <Link className="side-link" href={PLANS_HREF}>▣ Plans</Link>
            <Link className="side-link" href="/dashboard/settings">⚙ Settings</Link>
          </nav>
        </aside>

        <main className="dashboard-main">
          <div className="dashboard-head">
            <div>
              <div className="kicker">Live workspace</div>
              <h1>Creator signals</h1>
              <p>{hasPaidPlan ? "YouTube and Twitch monitoring is active. Kick is coming soon." : "Choose a plan to start YouTube and Twitch monitoring. Kick is coming soon."}</p>
            </div>
            <div className="dashboard-actions">
              <span className="plan-pill">
                {hasPaidPlan ? `${planLabel} · ${activeGames}/${gameLimit} active games` : "0/0 active games"}
              </span>
              {hasPaidPlan ? <a className="btn btn-ghost" href="/api/export">Export CSV</a> : null}
              {!hasPaidPlan ? (
                <Link className="btn btn-primary" href={PLANS_HREF}>Add game</Link>
              ) : atGameLimit ? (
                <Link className="btn btn-primary" href={PLANS_HREF}>Change plan</Link>
              ) : (
                <button className="btn btn-primary" disabled={busy} onClick={openNewMonitor}>Add game</button>
              )}
            </div>
          </div>

          {message ? <div className="status-message">{message}</div> : null}
          {!hasPaidPlan ? (
            <div className="status-message">
              Choose a plan to add games and start creator monitoring. There is no free monitoring plan.
            </div>
          ) : atGameLimit ? (
            <div className="status-message">
              You are using all {gameLimit} active monitoring slot{gameLimit === 1 ? "" : "s"} on {planLabel}. Pause a game or change your plan in Settings to monitor another title.
            </div>
          ) : null}

          {games.length === 0 ? (
            <section className="dashboard-panel" style={{ marginBottom: 20 }}>
              <div className="dashboard-panel-head">
                <div>
                  <div className="panel-title">Getting started</div>
                  <h2>Start monitoring your first game</h2>
                </div>
                <span className="plan-pill">Step 1 of 3</span>
              </div>
              <div className="dashboard-panel-body">
                <div className="settings-row" style={{ borderTop: 0 }}>
                  <div><strong>1. Add a game</strong><p>{hasPaidPlan ? `Enter the title and optional aliases so ${BRAND.name} knows what to look for.` : "Choose a plan first, then add the title and optional aliases you want to monitor."}</p></div>
                  {hasPaidPlan ? (
                    <button className="btn btn-primary" onClick={openNewMonitor} disabled={busy}>Add first game</button>
                  ) : (
                    <Link className="btn btn-primary" href={PLANS_HREF}>Add first game</Link>
                  )}
                </div>
                <div className="settings-row">
                  <div><strong>2. Automatic scans start</strong><p>YouTube and Twitch checks are queued automatically. You do not need to press a scan button.</p></div>
                  <span className="plan-pill">Automatic</span>
                </div>
                <div className="settings-row">
                  <div><strong>3. Configure alerts</strong><p>When you are ready, open Settings to manage your plan and connect Discord alerts.</p></div>
                  <Link className="btn btn-ghost" href="/dashboard/settings">Open Settings</Link>
                </div>
              </div>
            </section>
          ) : mentions.length === 0 ? (
            <div className="status-message">
              {hasPaidPlan
                ? "Your monitor is active and the first platform scans are queued. New YouTube videos and Twitch streams will appear here automatically when matching signals are found."
                : "Your saved games are paused until you choose an active paid plan."}
            </div>
          ) : null}

          <section className="dashboard-grid">
            <div className="metric-card"><span>Signals</span><b>{stats.signalCount.toLocaleString("en-US")}</b></div>
            <div className="metric-card"><span>Live now</span><b>{stats.liveNowCount.toLocaleString("en-US")}</b></div>
            <div className="metric-card"><span>Creators</span><b>{stats.creatorCount.toLocaleString("en-US")}</b></div>
            <div className="metric-card"><span>Total reach</span><b>{stats.totalReach.toLocaleString("en-US")}</b></div>
          </section>

          <section className="dashboard-panel" id="games">
            <div className="dashboard-panel-head">
              <div><div className="panel-title">Tracked portfolio</div><h2>Your games</h2></div>
              <span className="tiny">{hasPaidPlan ? `YouTube + Twitch active · ${activeGames}/${gameLimit} active slots used` : "Monitoring requires an active plan · 0/0 active slots used"}</span>
            </div>
            <div className="dashboard-panel-body">
              {games.length ? games.map((game) => {
                const monitoringEnabled = hasPaidPlan && game.enabled;
                return (
                  <div className="game-row" key={game.id}>
                    <div>
                      <div className="game-title">{game.title}</div>
                      <div className="game-meta"><span className="inline-platform youtube" aria-hidden="true" />YouTube: {scanTime(game.youtube_last_scanned_at)} · <span className="inline-platform twitch" aria-hidden="true" />Twitch: {scanTime(game.twitch_last_scanned_at)}</div>
                    </div>
                    <div className="game-status"><i />{monitoringEnabled ? "Monitoring" : "Paused"}</div>
                    <div className="dashboard-actions">
                      <button className="icon-btn" disabled={busy} onClick={() => openEditMonitor(game)}>Edit</button>
                      {!hasPaidPlan ? (
                        <Link className="icon-btn" href={PLANS_HREF}>Choose plan</Link>
                      ) : (
                        <button className="icon-btn" disabled={busy || (!game.enabled && atGameLimit)} onClick={() => toggleGame(game)}>
                          {game.enabled ? "Pause" : atGameLimit ? "No available slot" : "Resume"}
                        </button>
                      )}
                      <button className="icon-btn danger" disabled={busy} onClick={() => removeGame(game.id)}>Remove</button>
                    </div>
                  </div>
                );
              }) : (
                <div className="empty-state">
                  <strong>No games tracked yet</strong>
                  {hasPaidPlan
                    ? `Add your first game and ${BRAND.name} will start monitoring YouTube and Twitch automatically.`
                    : "Choose a plan, then add your first game to start monitoring YouTube and Twitch."}
                </div>
              )}
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <div className="panel-title">Detected content</div>
                <h2>Latest mentions</h2>
                <span className="tiny">Up to 100 recent signals per platform are shown here for a fast dashboard.</span>
              </div>
              <div className="tabs">
                {(["all", "youtube", "twitch"] as const).map((item) => (
                  <button key={item} className={`tab${filter === item ? " active" : ""}${item === "all" ? "" : ` platform-filter ${item}`}`} onClick={() => setFilter(item)}>
                    {item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="dashboard-panel-body">
              {filteredMentions.length ? filteredMentions.map((mention) => {
                const icon = platformClass(mention.platform);
                const gameValue = Array.isArray(mention.games) ? mention.games[0] : mention.games;
                const reach = mention.view_count ?? mention.viewer_count;
                const reachLabel = reach !== null
                  ? `${reach.toLocaleString("en-US")} ${mention.platform === "youtube" ? "views" : "viewers"}`
                  : null;
                const twitchLive = isTwitchLive(mention);
                return (
                  <a className="mention-row" href={mention.url} target="_blank" rel="noreferrer" key={mention.id}>
                    <div className={`ico ${icon.cls}`}>{icon.short}</div>
                    <div>
                      <div className="mention-title">{mention.title}</div>
                      <div className="mention-sub">
                        {mention.creator_name} · {gameValue?.title ?? "Tracked game"}
                        {reachLabel ? ` · ${reachLabel}` : ""}
                      </div>
                    </div>
                    <span className={`badge ${mention.platform === "youtube" ? "video" : "live"}`}>
                      {mention.platform === "youtube" ? "VIDEO" : twitchLive ? "LIVE" : "STREAM"}
                    </span>
                    <div className="mention-time">{relativeTime(mention.detected_at)}</div>
                  </a>
                );
              }) : (
                <div className="empty-state">
                  <strong>No matching signals yet</strong>
                  {hasPaidPlan
                    ? `${BRAND.name} is monitoring your tracked games. New YouTube videos and Twitch streams will appear here automatically.`
                    : "Choose a plan to start creator monitoring and receive new signals."}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {modalOpen ? (
        <div className="modal-backdrop react-modal open" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setModalOpen(false);
        }}>
          <div className="modal">
            <div className="modal-top">
              <div>
                <div className="kicker">{editingGame ? "Monitor settings" : "New monitor"}</div>
                <h3>{editingGame ? `Edit ${editingGame.title}` : "Add your game"}</h3>
              </div>
              <button className="close" disabled={busy} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form className="form-grid" onSubmit={saveMonitor}>
              <label>
                Game title
                <input className="app-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="AFTERBLAST" required disabled={busy} />
              </label>
              <label>
                Additional names / search phrases
                <input className="app-input" value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="AFTER BLAST, Lumino Games" disabled={busy} />
                <span className="form-help">Comma-separated phrases that should also find your game. The main title is always included automatically.</span>
              </label>
              <label>
                Exclude terms
                <input className="app-input" value={excludes} onChange={(event) => setExcludes(event.target.value)} placeholder="unrelated product, unwanted channel" disabled={busy} />
                <span className="form-help">Comma-separated terms used to reduce unrelated YouTube search results.</span>
              </label>
              <label>
                Steam or official game URL
                <input className="app-input" type="url" value={steamUrl} onChange={(event) => setSteamUrl(event.target.value)} placeholder="https://store.steampowered.com/app/..." disabled={busy} />
              </label>
              <div className="dialog-actions">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>{editingGame ? "Save monitor" : "Create monitor"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}