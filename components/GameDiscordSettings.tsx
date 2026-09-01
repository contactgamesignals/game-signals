"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/supabase/function-error";

type GameOption = {
  id: string;
  title: string;
  enabled: boolean;
};

type ChannelState = {
  configured: boolean;
  enabled: boolean;
  minimumLiveViewers: number;
};

type Feedback = {
  kind: "success" | "error";
  message: string;
};

type Props = {
  workspaceId: string;
  games: GameOption[];
  canManage: boolean;
};

export default function GameDiscordSettings({ workspaceId, games, canManage }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [perGameAvailable, setPerGameAvailable] = useState(true);
  const [channels, setChannels] = useState<Record<string, ChannelState>>({});
  const [webhookUrls, setWebhookUrls] = useState<Record<string, string>>({});
  const [minimumLiveViewers, setMinimumLiveViewers] = useState<Record<string, number>>({});
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback | undefined>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  async function invokeDiscord(action: "status" | "upsert" | "delete" | "test", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("manage-discord", {
      body: { action, workspace_id: workspaceId, ...extra },
    });
    if (functionError) {
      throw new Error(await edgeFunctionErrorMessage(functionError, "Could not complete the Discord request."));
    }
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await invokeDiscord("status");
        if (!active) return;

        const nextChannels: Record<string, ChannelState> = {};
        const nextThresholds: Record<string, number> = {};
        const rows = Array.isArray(data.channels) ? data.channels : [];
        for (const value of rows) {
          if (!value || typeof value !== "object") continue;
          const row = value as Record<string, unknown>;
          const gameId = String(row.game_id ?? "");
          if (!gameId) continue;
          const threshold = Math.max(0, Math.round(Number(row.minimum_live_viewers ?? 0)));
          nextChannels[gameId] = {
            configured: true,
            enabled: Boolean(row.enabled),
            minimumLiveViewers: threshold,
          };
          nextThresholds[gameId] = threshold;
        }

        setChannels(nextChannels);
        setMinimumLiveViewers(nextThresholds);
        setAllowed(Boolean(data.allowed));
        setPerGameAvailable(data.per_game_available !== false);
        setLoadError(null);
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Could not load Discord settings.");
        setAllowed(false);
      }
    })();

    return () => { active = false; };
    // workspaceId is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  function setGameFeedback(gameId: string, value?: Feedback) {
    setFeedback((current) => ({ ...current, [gameId]: value }));
  }

  async function saveGameDiscord(event: FormEvent<HTMLFormElement>, game: GameOption) {
    event.preventDefault();
    if (!allowed || !canManage || !perGameAvailable) return;

    const currentChannel = channels[game.id];
    const webhook = webhookUrls[game.id]?.trim() ?? "";
    if (!currentChannel?.configured && !webhook) return;

    const threshold = Math.max(0, Math.round(Number(minimumLiveViewers[game.id] ?? 0)));
    setBusyGameId(game.id);
    setGameFeedback(game.id);

    try {
      const data = await invokeDiscord("upsert", {
        game_id: game.id,
        ...(webhook ? { webhook_url: webhook } : {}),
        minimum_live_viewers: threshold,
      });
      const savedThreshold = Math.max(0, Math.round(Number(data.minimum_live_viewers ?? threshold)));
      setChannels((current) => ({
        ...current,
        [game.id]: {
          configured: true,
          enabled: true,
          minimumLiveViewers: savedThreshold,
        },
      }));
      setMinimumLiveViewers((current) => ({ ...current, [game.id]: savedThreshold }));
      setWebhookUrls((current) => ({ ...current, [game.id]: "" }));
      setGameFeedback(game.id, {
        kind: "success",
        message: webhook ? "Discord webhook saved for this game." : "Discord settings saved for this game.",
      });
    } catch (error) {
      setGameFeedback(game.id, {
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save the Discord webhook.",
      });
    } finally {
      setBusyGameId(null);
    }
  }

  async function testGameDiscord(game: GameOption) {
    if (!allowed || !canManage || !channels[game.id]?.configured || !perGameAvailable) return;
    setBusyGameId(game.id);
    setGameFeedback(game.id);

    try {
      await invokeDiscord("test", { game_id: game.id });
      setGameFeedback(game.id, { kind: "success", message: "Test notification sent to this game's Discord." });
    } catch (error) {
      setGameFeedback(game.id, {
        kind: "error",
        message: error instanceof Error ? error.message : "Could not send the test notification.",
      });
    } finally {
      setBusyGameId(null);
    }
  }

  async function removeGameDiscord(game: GameOption) {
    if (!canManage || !channels[game.id]?.configured || !perGameAvailable) return;
    if (!window.confirm(`Remove Discord alerts for ${game.title}?`)) return;

    setBusyGameId(game.id);
    setGameFeedback(game.id);
    try {
      await invokeDiscord("delete", { game_id: game.id });
      setChannels((current) => {
        const next = { ...current };
        delete next[game.id];
        return next;
      });
      setMinimumLiveViewers((current) => ({ ...current, [game.id]: 0 }));
      setWebhookUrls((current) => ({ ...current, [game.id]: "" }));
      setGameFeedback(game.id, { kind: "success", message: "Discord alerts removed for this game." });
    } catch (error) {
      setGameFeedback(game.id, {
        kind: "error",
        message: error instanceof Error ? error.message : "Could not remove the Discord webhook.",
      });
    } finally {
      setBusyGameId(null);
    }
  }

  const connectedCount = games.filter((game) => channels[game.id]?.configured && channels[game.id]?.enabled).length;
  const controlsLocked = allowed === false || !canManage || !perGameAvailable;

  return (
    <section className="settings-card per-game-discord-settings" id="discord">
      <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
        <div>
          <h2><span className="service-mark discord" aria-hidden="true" />Discord alerts</h2>
          <p>Assign a separate Discord webhook to each game. Creator alerts for a game are sent only to its connected channel.</p>
        </div>
        <span className="plan-pill">
          {allowed === null ? "Checking..." : !allowed ? "Paid plan required" : games.length ? `${connectedCount} / ${games.length} connected` : "No games"}
        </span>
      </div>

      {loadError ? <div className="auth-error">{loadError}</div> : null}
      {!perGameAvailable ? (
        <div className="status-message">Per-game Discord routing is still being prepared. Existing alerts continue to use the current workspace connection.</div>
      ) : null}
      {allowed === false && !loadError ? (
        <div className="status-message">Discord alerts are included in every paid plan and promotional trial. Saved game connections are not used without product access.</div>
      ) : null}
      {!canManage ? (
        <div className="status-message">Only workspace owners and admins can change Discord connections.</div>
      ) : null}
      {games.length === 0 ? (
        <div className="status-message">Add a game first, then connect the Discord channel that should receive alerts for it.</div>
      ) : (
        <div className="discord-game-list">
          {games.map((game) => {
            const channel = channels[game.id];
            const configured = Boolean(channel?.configured && channel.enabled);
            const busy = busyGameId === game.id;
            const gameFeedback = feedback[game.id];
            const webhook = webhookUrls[game.id] ?? "";
            const threshold = minimumLiveViewers[game.id] ?? channel?.minimumLiveViewers ?? 0;

            return (
              <article className="discord-game-config" key={game.id}>
                <div className="discord-game-head">
                  <div>
                    <strong>{game.title}</strong>
                    <span>{game.enabled ? "Active game" : "Paused game"}</span>
                  </div>
                  <span className="plan-pill">{configured ? "Connected" : "Not connected"}</span>
                </div>

                {gameFeedback ? (
                  <div className={gameFeedback.kind === "success" ? "auth-success" : "auth-error"}>{gameFeedback.message}</div>
                ) : null}

                <form className="form-grid discord-game-form" onSubmit={(event) => saveGameDiscord(event, game)}>
                  <label>
                    {configured ? "Replace webhook URL" : "Discord webhook URL"}
                    <input
                      className="app-input"
                      type="url"
                      value={webhook}
                      onChange={(event) => setWebhookUrls((current) => ({ ...current, [game.id]: event.target.value }))}
                      placeholder={configured ? "Paste a new webhook only if you want to replace it" : "https://discord.com/api/webhooks/..."}
                      autoComplete="off"
                      disabled={busy || controlsLocked}
                    />
                    <span className="form-help">Discord - Server Settings - Integrations - Webhooks. The saved URL is never shown again.</span>
                  </label>
                  <label>
                    Minimum viewers for Twitch live streams
                    <input
                      className="app-input"
                      type="number"
                      min="0"
                      step="1"
                      value={threshold}
                      onChange={(event) => setMinimumLiveViewers((current) => ({ ...current, [game.id]: Math.max(0, Number(event.target.value)) }))}
                      disabled={busy || controlsLocked}
                    />
                  </label>
                  <div className="dashboard-actions">
                    <button className="btn btn-primary" disabled={busy || controlsLocked || (!configured && !webhook.trim())}>
                      <span className="service-mark discord" aria-hidden="true" />
                      {busy ? "Saving..." : configured ? (webhook.trim() ? "Replace and save" : "Save settings") : "Connect Discord"}
                    </button>
                    <button className="btn btn-ghost" type="button" disabled={busy || controlsLocked || !configured} onClick={() => testGameDiscord(game)}>
                      <span className="service-mark discord" aria-hidden="true" />Send test
                    </button>
                    {configured ? (
                      <button className="icon-btn danger" type="button" disabled={busy || !canManage || !perGameAvailable} onClick={() => removeGameDiscord(game)}>Remove</button>
                    ) : null}
                  </div>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
