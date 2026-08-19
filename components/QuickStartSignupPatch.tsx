"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const PENDING_GAME_STORAGE_KEY = "who-plays-my-game-pending-game";
const LEGACY_PENDING_GAME_STORAGE_KEY = "gamesignal-pending-game";
const DEMO_GAME_STORAGE_KEY = "who-plays-my-game-demo-game-v1";
const LEGACY_DEMO_GAME_STORAGE_KEY = "gamesignal-demo-game-v3";

export default function QuickStartSignupPatch() {
  const router = useRouter();

  useEffect(() => {
    const handleQuickStart = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.id !== "quickAdd") return;

      const input = form.querySelector<HTMLInputElement>("#gameName");
      const gameTitle = input?.value.trim() ?? "";
      if (!gameTitle) return;

      event.preventDefault();
      event.stopPropagation();

      localStorage.setItem(
        PENDING_GAME_STORAGE_KEY,
        JSON.stringify({ title: gameTitle, aliases: "", steamUrl: "" }),
      );
      localStorage.removeItem(LEGACY_PENDING_GAME_STORAGE_KEY);
      localStorage.setItem(DEMO_GAME_STORAGE_KEY, gameTitle);
      localStorage.removeItem(LEGACY_DEMO_GAME_STORAGE_KEY);

      router.push(`/signup?game=${encodeURIComponent(gameTitle)}`);
    };

    document.addEventListener("submit", handleQuickStart, true);
    return () => document.removeEventListener("submit", handleQuickStart, true);
  }, [router]);

  return null;
}
