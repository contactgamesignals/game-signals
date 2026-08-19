"use client";

import { useEffect } from "react";

const CANDIDATE_ATTRIBUTE = "data-loading-candidate";
const OWNED_BUSY_ATTRIBUTE = "data-loading-owned-busy";

function clearLoading(button: HTMLButtonElement) {
  button.classList.remove("is-loading");
  button.removeAttribute(CANDIDATE_ATTRIBUTE);
  if (button.hasAttribute(OWNED_BUSY_ATTRIBUTE)) {
    button.removeAttribute("aria-busy");
    button.removeAttribute(OWNED_BUSY_ATTRIBUTE);
  }
}

function syncLoading(button: HTMLButtonElement) {
  if (!button.hasAttribute(CANDIDATE_ATTRIBUTE)) return;

  if (button.disabled || button.getAttribute("aria-busy") === "true") {
    button.classList.add("is-loading");
    if (!button.hasAttribute("aria-busy")) {
      button.setAttribute("aria-busy", "true");
      button.setAttribute(OWNED_BUSY_ATTRIBUTE, "true");
    }
    return;
  }

  clearLoading(button);
}

export default function InteractionFeedback() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;

      button.setAttribute(CANDIDATE_ATTRIBUTE, "true");

      window.requestAnimationFrame(() => {
        if (!button.isConnected) return;
        syncLoading(button);

        // Synchronous buttons should never keep a pending marker. Async React
        // handlers normally disable their button before this short fallback.
        if (button.hasAttribute(CANDIDATE_ATTRIBUTE) && !button.disabled) {
          window.setTimeout(() => {
            if (button.isConnected && !button.disabled) clearLoading(button);
          }, 220);
        }
      });
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "attributes") continue;
        const button = mutation.target;
        if (button instanceof HTMLButtonElement) syncLoading(button);
      }
    });

    document.addEventListener("click", onClick, true);
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-busy"],
    });

    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
