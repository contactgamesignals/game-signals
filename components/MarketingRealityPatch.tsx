"use client";

import { useEffect } from "react";

function findTextElement(selector: string, startsWith: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) =>
    (element.textContent ?? "").trim().startsWith(startsWith),
  );
}

function isUnavailableControl(element: Element | null) {
  if (!element) return false;
  if (element.closest('[data-source-toggle="kick"]')) return true;
  if (element.closest('.tab[data-filter="kick"]')) return true;

  const sourceCheck = element.closest(".source-check");
  if (sourceCheck && (sourceCheck.textContent ?? "").trim().startsWith("Kick")) return true;

  const sourceSwitch = element.closest(".source-switch");
  const sourceSwitchText = (sourceSwitch?.textContent ?? "").trim();
  return sourceSwitchText.startsWith("Kick") || sourceSwitchText.startsWith("Email");
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

      const scoreStep = Array.from(document.querySelectorAll<HTMLElement>(".step")).find((step) =>
        (step.querySelector("h3")?.textContent ?? "").trim() === "Score",
      );
      const scoreCopy = scoreStep?.querySelector<HTMLElement>("p");
      if (scoreCopy) {
        scoreCopy.textContent = "See the creator, current views or live viewers, and a signal score that helps prioritize mentions.";
      }

      const alertStep = Array.from(document.querySelectorAll<HTMLElement>(".step")).find((step) =>
        (step.querySelector("h3")?.textContent ?? "").trim() === "Alert",
      );
      const alertCopy = alertStep?.querySelector<HTMLElement>("p");
      if (alertCopy) {
        alertCopy.textContent = "Studio and Publisher can send matching signals to Discord. Email delivery is coming soon.";
      }

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

      const emailToggleRow = findTextElement(".source-switch", "Email");
      if (emailToggleRow) {
        const toggle = emailToggleRow.querySelector<HTMLElement>(".switch");
        toggle?.classList.remove("on");
        toggle?.setAttribute("aria-disabled", "true");
        emailToggleRow.style.opacity = "0.55";
        emailToggleRow.title = "Email delivery is coming soon";
        const text = Array.from(emailToggleRow.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (text) text.textContent = "Email · coming soon ";
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

      const onboardingNotice = document.querySelector<HTMLElement>("#onboardingModal .notice");
      if (onboardingNotice) {
        onboardingNotice.textContent =
          "After signup, YouTube and Twitch monitoring starts automatically. Kick and email delivery are coming soon.";
      }

      const planFeatures: Record<string, string[]> = {
        Indie: [
          "1 active tracked game",
          "YouTube + Twitch monitoring",
          "Creator signal dashboard",
          "Aliases and exclusion terms",
        ],
        Studio: [
          "Up to 3 active games",
          "Everything in Indie",
          "Discord alerts",
          "Faster monitoring cadence",
          "Stripe self-service billing",
        ],
        Publisher: [
          "Up to 10 active games",
          "Everything in Studio",
          "CSV signal export",
          "Highest monitoring cadence",
          "Pause and resume active monitors",
        ],
      };

      document.querySelectorAll<HTMLElement>(".plan").forEach((plan) => {
        const planName = (plan.querySelector("h3")?.textContent ?? "").trim();
        const features = planFeatures[planName];
        const list = plan.querySelector<HTMLElement>("ul");
        if (!features || !list) return;
        list.innerHTML = features.map((feature) => `<li><span class="check">✓</span>${feature}</li>`).join("");
      });

      document.querySelectorAll<HTMLElement>(".faq-item").forEach((item) => {
        const question = (item.querySelector(".faq-q")?.textContent ?? "").trim();
        const answer = item.querySelector<HTMLElement>(".faq-a");
        if (!answer) return;
        if (question.startsWith("What if my game has a common name?")) {
          answer.textContent =
            "Add aliases, studio-specific search phrases, and exclusion terms. You can edit them later if a false positive appears.";
        }
        if (question.startsWith("Can I cancel my subscription?")) {
          answer.textContent =
            "Yes. Paid subscriptions are managed in Stripe Customer Portal, and cancellation keeps access until the end of the paid period.";
        }
      });
    };

    const blockUnavailableClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isUnavailableControl(target)) return;
      event.preventDefault();
      event.stopPropagation();
      apply();
    };

    document.addEventListener("click", blockUnavailableClick, true);
    apply();
    const frame = requestAnimationFrame(apply);
    const timeout = window.setTimeout(apply, 250);
    const observer = new MutationObserver(removeDynamicKickSignals);
    const landingHost = document.querySelector(".landing-host");
    if (landingHost) observer.observe(landingHost, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("click", blockUnavailableClick, true);
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
