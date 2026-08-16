"use client";

import { useEffect, useRef } from "react";

type TurnstileOptions = {
  sitekey: string;
  action?: string;
  theme?: "auto" | "light" | "dark";
  appearance?: "always" | "execute" | "interaction-only";
  size?: "normal" | "flexible" | "compact";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Props = {
  action: "auth_login" | "auth_signup" | "password_reset";
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
};

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAESFe84BxL0zJH7I";
const SCRIPT_ID = "who-plays-my-game-turnstile";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function TurnstileChallenge({ action, onTokenChange, resetKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const renderWidget = () => {
      if (disposed || widgetIdRef.current || !containerRef.current || !window.turnstile) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        theme: "auto",
        appearance: "interaction-only",
        size: "flexible",
        callback: (token) => onTokenChange(token),
        "error-callback": () => onTokenChange(null),
        "expired-callback": () => onTokenChange(null),
        "timeout-callback": () => onTokenChange(null),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget);

      return () => {
        disposed = true;
        script?.removeEventListener("load", renderWidget);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }

    return () => {
      disposed = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, onTokenChange]);

  useEffect(() => {
    if (resetKey <= 0 || !widgetIdRef.current || !window.turnstile) return;
    onTokenChange(null);
    window.turnstile.reset(widgetIdRef.current);
  }, [resetKey, onTokenChange]);

  return (
    <div style={{ minHeight: 38, width: "100%" }} aria-label="Security verification">
      <div ref={containerRef} />
    </div>
  );
}
