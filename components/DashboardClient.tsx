"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DashboardGame, DashboardMention } from "@/lib/types";
import type { PlanName } from "@/lib/plans";
import { PLAN_LABELS, PLAN_LIMITS } from "@/lib/plans";

type Props = {
  email: string;
  workspaceName: string;
  workspaceId: string;
  plan: PlanName;
  initialGames: DashboardGame[];
  initialMentions: DashboardMention[];
};

type PendingGame = {
  title?: string;
  aliases?: string;
  steamUrl?: string;
  sources?: string[];
};

const TWITCH_LIVE_FRESHNESS_MS = 6 * 60 * 1000;

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

export default function DashboardClient({
  email,
  workspaceName,
  workspaceId,
  plan,
  initialGames,
  initialMentions,
}: Props) {
  const router = useRouter();
  const [games, setGames] = useState(initialGames);
  const [mentions, setMentions] = useState(initialMentions);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [steamUrl, setSteamUrl] = useState("");
  const [aliases, setAliases] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "youtube" | "twitch">("all");

  const filteredMentions = useMemo(
    () => mentions.filter((mention) => filter === "all" || mention.platform === filter),
    [mentions, filter],
  );

  const liveNow = mentions.filter(isTwitchLive).length;
  const totalReach = mentions.reduce(
    (total, mention) => total + (mention.view_count ?? mention.viewer_count ?? 0),
    0,
  );
  const creators = new Set(mentions.map((mention) => mention.creator_name.toLowerCase())).size;
  const gameLimit = PLAN_LIMITS[plan].games;
  const planLabel = PLAN_LABELS[plan];
  const activeGames = games.filter((game) => game.enabled).length;
  const atGameLimit = activeGames >= gameLimit;

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
            return [{ ...row, games: { title: gameTitle } }, ...current].slice(0, 100);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mentions" },
        (payload) => {
          const row = payload.new as Omit<DashboardMention, "games">;
          setMentions((current) =>
            current.map((mention) =>
              mention.id === row.id ? { ...mention, ...row } : mention,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [games, workspaceId]);

  useEffect(() => {
    const pendingRaw = localStorage.getItem("gamesignal-pending-game");
    if (!pendingRaw) return;

    localStorage.removeItem("gamesignal-pending-game");
    try {
      const pending = JSON.parse(pendingRaw) as PendingGame;
      setTitle(pending.title ?? "");
      setSteamUrl(pending.steamUrl ?? "");
      setAliases(pending.aliases ?? "");
      setModalOpen(true);
    } catch {
      // Ignore malformed browser data.
    }
  }, []);

  async function addGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, steamUrl, aliases }),
      });
      const result = (await response.json()) as { game?: DashboardGame; error?: string };
      if (!response.ok || !result.game) throw new Error(result.error ?? "Could not add the game.");
      setGames((current) => [result.game as DashboardGame, ...current]);
      setTitle("");
      setSteamUrl("");
      setAliases("");
      setModalOpen(false);
      setMessage("Game added. YouTube and Twitch monitoring will start automatically.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the game.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleGame(game: DashboardGame) {
    const nextEnabled = !game.enabled;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const result = (await response.json()) as { game?: DashboardGame; error?: string };
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
          <span>GameSignal</span>
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
            <Link className="side-link" href="/dashboard/settings">⚙ Settings</Link>
          </nav>
        </aside>

        <main className="dashboard-main">
          <div className="dashboard-head">
            <div>
              <div className="kicker">Live workspace</div>
              <h1>Creator signals</h1>
              <p>YouTube and Twitch monitoring is active. Kick is coming soon.</p>
            </div>
            <div className="dashboard-actions">
              <span className="plan-pill">{planLabel} · {activeGames}/{gameLimit} active games</span>
              {plan === "publisher" ? <a className="btn btn-ghost" href="/api/export">Export CSV</a> : null}
              <button className="btn btn-primary" disabled={atGameLimit} onClick={() => setModalOpen(true)}>
                {atGameLimit ? "Active game limit reached" : "Add game"}
              </button>
            </div>
          </div>

          {message ? <div className="status-message">{message}</div> : null}
          {atGameLimit && plan !== "publisher" ? (
            <div className="status-message">
              You are using all {gameLimit} active monitoring slot{gameLimit === 1 ? "" : "s"} on {planLabel}. Pause a game or manage your plan in Settings to monitor another title.
            </div>
          ) : null}

          <section className="dashboard-grid">
            <div className="metric-card"><span>New signals</span><b>{mentions.length}</b></div>
            <div className="metric-card"><span>Live now</span><b>{liveNow}</b></div>
            <div className="metric-card"><span>Creators</span><b>{creators}</b></div>
            <div className="metric-card"><span>Total reach</span><b>{totalReach.toLocaleString("en-US")}</b></div>
          </section>

          <section className="dashboard-panel" id="games">
            <div className="dashboard-panel-head">
              <div><div className="panel-title">Tracked portfolio</div><h2>Your games</h2></div>
              <span className="tiny">YouTube + Twitch active · {activeGames}/{gameLimit} active slots used</span>
            </div>
            <div className="dashboard-panel-body">
              {games.length ? games.map((game) => (
                <div className="game-row" key={game.id}>
                  <div>
                    <div className="game-title">{game.title}</div>
                    <div className="game-meta">
                      YouTube: {scanTime(game.youtube_last_scanned_at)} · Twitch: {scanTime(game.twitch_last_scanned_at)}
                    </div>
                  </div>
                  <div className="game-status"><i />{game.enabled ? "Monitoring" : "Paused"}</div>
                  <div className="dashboard-actions">
                    <button
                      className="icon-btn"
                      disabled={busy || (!game.enabled && atGameLimit)}
                      onClick={() => toggleGame(game)}
                    >
                      {game.enabled ? "Pause" : atGameLimit ? "No free slot" : "Resume"}
                    </button>
                    <button className="icon-btn danger" disabled={busy} onClick={() => removeGame(game.id)}>Remove</button>
                  </div>
                </div>
              )) : (
                <div className="empty-state">
                  <strong>No games tracked yet</strong>
                  Add your first game and GameSignal will start monitoring YouTube and Twitch automatically.
                </div>
              )}
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div><div className="panel-title">Detected content</div><h2>Latest mentions</h2></div>
              <div className="tabs">
                {(["all", "youtube", "twitch"] as const).map((item) => (
                  <button key={item} className={`tab${filter === item ? " active" : ""}`} onClick={() => setFilter(item)}>
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
                const twitchLive = isTwitchLive(mention);
                return (
                  <a className="mention-row" href={mention.url} target="_blank" rel="noreferrer" key={mention.id}>
                    <div className={`ico ${icon.cls}`}>{icon.short}</div>
                    <div>
                      <div className="mention-title">{mention.title}</div>
                      <div className="mention-sub">
                        {mention.creator_name} · {gameValue?.title ?? "Tracked game"}
                        {reach !== null ? ` · ${reach.toLocaleString("en-US")}` : ""} · score {mention.signal_score}/100
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
                  GameSignal is monitoring your tracked games. New YouTube videos and Twitch streams will appear here automatically.
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {modalOpen ? (
        <div className="modal-backdrop react-modal open" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setModalOpen(false);
        }}>
          <div className="modal">
            <div className="modal-top">
              <div><div className="kicker">New monitor</div><h3>Add your game</h3></div>
              <button className="close" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form className="form-grid" onSubmit={addGame}>
              <label>
                Game title
                <input className="app-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="AFTERBLAST" required />
              </label>
              <label>
                Aliases and extra keywords
                <input className="app-input" value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="AFTER BLAST, Lumino Games" />
                <span className="form-help">Separate multiple aliases with commas.</span>
              </label>
              <label>
                Steam or official game URL
                <input className="app-input" type="url" value={steamUrl} onChange={(event) => setSteamUrl(event.target.value)} placeholder="https://store.steampowered.com/app/..." />
              </label>
              <div className="dialog-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>Create monitor</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
