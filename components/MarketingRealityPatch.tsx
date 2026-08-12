"use client";

import { useEffect } from "react";

function findTextElement(selector: string, startsWith: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) =>
    (element.textContent ?? "").trim().startsWith(startsWith),
  );
}

function isKickControl(element: Element | null) {
  if (!element) return false;
  if (element.closest('[data-source-toggle="kick"]')) return true;
  if (element.closest('.tab[data-filter="kick"]')) return true;
  const sourceCheck = element.closest(".source-check");
  return Boolean(sourceCheck && (sourceCheck.textContent ?? "").trim().startsWith("Kick"));
}

export default function MarketingRealityPatch() {
  useEffect(() => {
    const removeDynamicKickSignals = () => {
      document.querySelectorAll<HTMLElement>('[data-source="kick"]').forEach((element) => {
        element.remove();
      });
      document.querySelectorAll<HTMLElement>("#heroFeed .feed-line").forEach((element) => {
        if ((element.textContent ?? "").includes("Kick")) element.remove();
      });
    };

    const apply = () => {
      const heroCopy = document.querySelector<HTMLElement>(".hero-copy");
      if (heroCopy) {
        heroCopy.textContent =
          "GameSignal detects new YouTube videos and live streams on Twitch. Kick monitoring is planned, pending KICK developer approval.";
      }

      const systemState = document.querySelector<HTMLElement>(".system-state");
      if (systemState) systemState.innerHTML = "<i></i> 2 sources online";

      const kickPlatform = findTextElement(".platform", "Kick");
      if (kickPlatform) kickPlatform.innerHTML = '<span class="dot ki"></span>Kick · coming soon';

      const notificationsPlatform = findTextElement(".platform", "Email");
      if (notificationsPlatform) notificationsPlatform.textContent = "Discord · Email coming soon";

      const kickMapLabel = document.querySelector<HTMLElement>(".map-label.l3");
      if (kickMapLabel) kickMapLabel.textContent = "Kick / coming soon";

      const kickSourceRow = Array.from(document.querySelectorAll<HTMLElement>(".source-row")).find((row) =>
        (row.textContent ?? "").includes("Kick"),
      );
      if (kickSourceRow) {
        const count = kickSourceRow.querySelector<HTMLElement>(".source-count");
        if (count) count.textContent = "soon";
      }

      removeDynamicKickSignals();

      const kickSourceCheck = findTextElement(".source-check", "Kick");
      if (kickSourceCheck) {
        kickSourceCheck.classList.remove("selected");
        kickSourceCheck.setAttribute("aria-disabled", "true");
        kickSourceCheck.style.opacity = "0.55";
        kickSourceCheck.title = "Coming soon, pending KICK developer approval";
      }

      const kickToggleRow = findTextElement(".source-switch", "Kick");
      if (kickToggleRow) {
        const toggle = kickToggleRow.querySelector<HTMLElement>('[data-source-toggle="kick"]');
        toggle?.classList.remove("on");
        toggle?.setAttribute("aria-disabled", "true");
        kickToggleRow.style.opacity = "0.55";
        kickToggleRow.title = "Coming soon, pending KICK developer approval";
        const text = Array.from(kickToggleRow.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (text) text.textContent = "Kick · coming soon ";
      }

      const kickTab = document.querySelector<HTMLButtonElement>('.tab[data-filter="kick"]');
      if (kickTab) {
        kickTab.textContent = "Kick · soon";
        kickTab.disabled = true;
        kickTab.style.opacity = "0.55";
        kickTab.title = "Coming soon, pending KICK developer approval";
      }

      const notice = document.querySelector<HTMLElement>(".controls .notice");
      if (notice) {
        notice.textContent =
          "Interactive demo. Production monitoring is live for YouTube and Twitch; Kick and email delivery are still being prepared.";
      }

      Array.from(document.querySelectorAll<HTMLElement>(".plan li")).forEach((item) => {
        if ((item.textContent ?? "").includes("YouTube, Twitch, and Kick")) {
          const check = item.querySelector<HTMLElement>(".check");
          item.textContent = "YouTube + Twitch monitoring";
          if (check) item.prepend(check);
        }
        if ((item.textContent ?? "").includes("Notifications email")) {
          const check = item.querySelector<HTMLElement>(".check");
          item.textContent = "Dashboard alerts; email coming soon";
          if (check) item.prepend(check);
        }
      });
    };

    const blockKickClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isKickControl(target)) return;
      event.preventDefault();
      event.stopPropagation();
      apply();
    };

    document.addEventListener("click", blockKickClick, true);
    apply();
    const frame = requestAnimationFrame(apply);
    const timeout = window.setTimeout(apply, 250);
    const observer = new MutationObserver(removeDynamicKickSignals);
    const landingHost = document.querySelector(".landing-host");
    if (landingHost) observer.observe(landingHost, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("click", blockKickClick, true);
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
