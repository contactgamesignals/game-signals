"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type AccessKind = "paid" | "trial" | "none";

type Props = {
  accessKind: AccessKind;
  trialEndsAt: string | null;
  trialHistoryEndsAt: string | null;
  hasPaidHistory: boolean;
};

const TRIAL_CODE_HREF = "/dashboard/settings#trial-code";
const PLANS_HREF = "/dashboard/settings";

function trialDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function remainingLabel(endsAt: string, now: number) {
  const totalMinutes = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 60_000));
  if (totalMinutes <= 0) return "Ending now";

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"} remaining`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} min remaining`;
  }
  return `${minutes} min remaining`;
}

export default function DashboardTrialExperience({
  accessKind,
  trialEndsAt,
  trialHistoryEndsAt,
  hasPaidHistory,
}: Props) {
  const router = useRouter();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const dashboardMain = document.querySelector<HTMLElement>(".dashboard-main");
    if (!dashboardMain) return;

    let mount = document.getElementById("dashboard-trial-experience-root");
    const created = !mount;
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "dashboard-trial-experience-root";
      dashboardMain.prepend(mount);
    }

    setPortalTarget(mount);
    return () => {
      setPortalTarget(null);
      if (created) mount?.remove();
    };
  }, []);

  useEffect(() => {
    if (accessKind !== "trial" || !trialEndsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [accessKind, trialEndsAt]);

  const activeTrial = accessKind === "trial" && Boolean(trialEndsAt);
  const trialExpired = useMemo(() => {
    if (accessKind !== "none" || hasPaidHistory || !trialHistoryEndsAt) return false;
    return new Date(trialHistoryEndsAt).getTime() <= now;
  }, [accessKind, hasPaidHistory, now, trialHistoryEndsAt]);
  const canRedeemTrial = accessKind === "none" && !hasPaidHistory && !trialHistoryEndsAt;

  useEffect(() => {
    if (!activeTrial || !trialEndsAt) return;
    if (new Date(trialEndsAt).getTime() > now) return;
    router.refresh();
  }, [activeTrial, now, router, trialEndsAt]);

  if (!portalTarget || accessKind === "paid") return null;

  let content = null;

  if (activeTrial && trialEndsAt) {
    content = (
      <section className="dashboard-panel" style={{ marginBottom: 20 }} aria-label="Indie trial status">
        <div className="dashboard-panel-head">
          <div>
            <div className="panel-title">Promotional access</div>
            <h2>Your 7-day Indie trial is active</h2>
            <span className="tiny">1 active game · YouTube + Twitch · Discord alerts · Daily email · CSV export</span>
          </div>
          <span className="plan-pill">{remainingLabel(trialEndsAt, now)}</span>
        </div>
        <div className="dashboard-panel-body">
          <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <strong>Full Indie access until {trialDate(trialEndsAt)}</strong>
              <p>No card is attached to this trial. It will not renew or charge you automatically when the 7 days end.</p>
            </div>
            <Link className="btn btn-ghost" href={PLANS_HREF}>View plans</Link>
          </div>
        </div>
      </section>
    );
  } else if (trialExpired && trialHistoryEndsAt) {
    content = (
      <section className="dashboard-panel" style={{ marginBottom: 20 }} aria-label="Expired Indie trial">
        <div className="dashboard-panel-head">
          <div>
            <div className="panel-title">Trial ended</div>
            <h2>Your 7-day Indie trial has ended</h2>
            <span className="tiny">Your game and detected signals are still saved.</span>
          </div>
          <span className="plan-pill">Monitoring paused</span>
        </div>
        <div className="dashboard-panel-body">
          <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <strong>Keep monitoring for $2.99/month</strong>
              <p>Continue with Indie to reactivate 1 game and keep YouTube, Twitch, Discord, daily email and CSV access. Nothing is charged unless you choose a paid plan.</p>
            </div>
            <Link className="btn btn-primary" href={PLANS_HREF}>Continue with Indie</Link>
          </div>
        </div>
      </section>
    );
  } else if (canRedeemTrial) {
    content = (
      <section className="dashboard-panel" style={{ marginBottom: 20 }} aria-label="Creator trial code">
        <div className="dashboard-panel-head">
          <div>
            <div className="panel-title">Creator invite</div>
            <h2>Have a trial code?</h2>
            <span className="tiny">Unlock 7 days of Indie for 1 active game. No card required.</span>
          </div>
          <span className="plan-pill">7 days free</span>
        </div>
        <div className="dashboard-panel-body">
          <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <strong>Redeem the one-time code you received</strong>
              <p>The trial includes YouTube and Twitch monitoring, Discord alerts, daily email digest and CSV export, with no automatic renewal.</p>
            </div>
            <Link className="btn btn-primary" href={TRIAL_CODE_HREF}>Redeem code</Link>
          </div>
        </div>
      </section>
    );
  }

  return content ? createPortal(content, portalTarget) : null;
}
