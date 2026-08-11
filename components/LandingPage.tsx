"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { landingMarkup } from "@/lib/landing-markup";

type Source = "youtube" | "twitch" | "kick";

export default function LandingPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const abort = new AbortController();
    const { signal } = abort;
    const timers: number[] = [];

    const qs = <T extends Element>(selector: string) => host.querySelector<T>(selector);
    const qsa = <T extends Element>(selector: string) =>
      Array.from(host.querySelectorAll<T>(selector));

    const modals = {
      onboarding: qs<HTMLElement>("#onboardingModal"),
      login: qs<HTMLElement>("#loginModal"),
      plan: qs<HTMLElement>("#planModal"),
    };

    const openModal = (name: keyof typeof modals) => {
      modals[name]?.classList.add("open");
      document.body.classList.add("modal-open");
    };

    const closeModals = () => {
      qsa<HTMLElement>(".modal-backdrop").forEach((modal) => modal.classList.remove("open"));
      document.body.classList.remove("modal-open");
    };

    const showToast = (message: string) => {
      const element = qs<HTMLElement>("#toast");
      if (!element) return;
      element.textContent = message;
      element.classList.add("show");
      window.setTimeout(() => element.classList.remove("show"), 2600);
    };

    const setGame = (name: string) => {
      if (!name) return;
      const upperName = name.toUpperCase();
      const heroGame = qs<HTMLElement>("#heroGame");
      const workspaceTitle = qs<HTMLElement>("#workspaceTitle");
      const labGame = qs<HTMLInputElement>("#labGame");
      if (heroGame) heroGame.textContent = upperName;
      if (workspaceTitle) workspaceTitle.textContent = upperName;
      if (labGame) labGame.value = name;
      localStorage.setItem("gamesignal-demo-game-v3", name);
    };

    qsa<HTMLElement>("[data-open]").forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const target = button.dataset.open;
          if (target === "login") {
            router.push("/login");
            return;
          }
          if (target === "onboarding") openModal("onboarding");
        },
        { signal },
      );
    });

    qsa<HTMLElement>("[data-close]").forEach((button) =>
      button.addEventListener("click", closeModals, { signal }),
    );

    qsa<HTMLElement>(".modal-backdrop").forEach((modal) =>
      modal.addEventListener(
        "click",
        (event) => {
          if (event.target === modal) closeModals();
        },
        { signal },
      ),
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") closeModals();
      },
      { signal },
    );

    qs<HTMLFormElement>("#quickAdd")?.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const name = qs<HTMLInputElement>("#gameName")?.value.trim() ?? "";
        if (!name) return;
        const modalGame = qs<HTMLInputElement>("#modalGame");
        if (modalGame) modalGame.value = name;
        setGame(name);
        openModal("onboarding");
      },
      { signal },
    );

    qs<HTMLInputElement>("#labGame")?.addEventListener(
      "input",
      (event) => {
        const input = event.currentTarget as HTMLInputElement;
        const name = input.value.trim() || "YOUR GAME";
        const workspaceTitle = qs<HTMLElement>("#workspaceTitle");
        const heroGame = qs<HTMLElement>("#heroGame");
        if (workspaceTitle) workspaceTitle.textContent = name.toUpperCase();
        if (heroGame) heroGame.textContent = name.toUpperCase();
      },
      { signal },
    );

    qsa<HTMLElement>(".source-check").forEach((button) =>
      button.addEventListener("click", () => button.classList.toggle("selected"), { signal }),
    );

    const sourceEnabled = (source: Source) => {
      const toggle = qs<HTMLElement>(`[data-source-toggle="${source}"]`);
      return toggle ? toggle.classList.contains("on") : true;
    };

    let currentFilter = "all";
    const applyFilters = () => {
      const min = Number(qs<HTMLInputElement>("#viewerRange")?.value ?? 0);
      qsa<HTMLElement>(".result").forEach((row) => {
        const source = (row.dataset.source ?? "youtube") as Source;
        const viewers = Number(row.dataset.viewers ?? 0);
        const sourceOk = sourceEnabled(source);
        const filterOk = currentFilter === "all" || currentFilter === source;
        const viewersOk = source === "youtube" || viewers >= min;
        row.style.display = sourceOk && filterOk && viewersOk ? "grid" : "none";
      });
    };

    qsa<HTMLElement>(".switch").forEach((toggle) =>
      toggle.addEventListener(
        "click",
        () => {
          toggle.classList.toggle("on");
          applyFilters();
        },
        { signal },
      ),
    );

    qs<HTMLFormElement>("#onboardingForm")?.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const inputs = Array.from(form.querySelectorAll<HTMLInputElement>("input"));
        const payload = {
          title: inputs[0]?.value.trim() || "My game",
          aliases: inputs[1]?.value.trim() || "",
          steamUrl: inputs[2]?.value.trim() || "",
          sources: qsa<HTMLElement>(".source-check.selected").map((item) =>
            (item.textContent ?? "").trim().toLowerCase(),
          ),
        };
        localStorage.setItem("gamesignal-pending-game", JSON.stringify(payload));
        closeModals();
        router.push(`/signup?game=${encodeURIComponent(payload.title)}`);
      },
      { signal },
    );

    const saved = localStorage.getItem("gamesignal-demo-game-v3");
    if (saved) setGame(saved);

    qs<HTMLInputElement>("#viewerRange")?.addEventListener(
      "input",
      (event) => {
        const input = event.currentTarget as HTMLInputElement;
        const value = qs<HTMLElement>("#viewerValue");
        if (value) value.textContent = input.value;
        applyFilters();
      },
      { signal },
    );

    qsa<HTMLElement>(".tab").forEach((tab) =>
      tab.addEventListener(
        "click",
        () => {
          qsa<HTMLElement>(".tab").forEach((item) => item.classList.remove("active"));
          tab.classList.add("active");
          currentFilter = tab.dataset.filter ?? "all";
          applyFilters();
        },
        { signal },
      ),
    );

    qs<HTMLButtonElement>("#scanBtn")?.addEventListener(
      "click",
      () => {
        const button = qs<HTMLButtonElement>("#scanBtn");
        if (!button) return;
        button.classList.add("loading");
        button.textContent = "Scanning…";
        const timer = window.setTimeout(() => {
          const game = qs<HTMLInputElement>("#labGame")?.value.trim() || "Your game";
          const options = [
            {
              source: "youtube" as const,
              cls: "y",
              short: "YT",
              title: `“I found ${game} by accident — and it is wild”`,
              sub: "YouTube · 1.9K views",
              badge: "VIDEO",
              badgeClass: "video",
              viewers: 0,
            },
            {
              source: "twitch" as const,
              cls: "t",
              short: "TW",
              title: `voidrunner started streaming ${game}`,
              sub: "Twitch · 93 viewers",
              badge: "LIVE",
              badgeClass: "live",
              viewers: 93,
            },
            {
              source: "kick" as const,
              cls: "k",
              short: "K",
              title: `midnightbyte is testing ${game}`,
              sub: "Kick · 121 viewers",
              badge: "LIVE",
              badgeClass: "live",
              viewers: 121,
            },
          ].filter((item) => sourceEnabled(item.source));

          if (!options.length) {
            button.classList.remove("loading");
            button.textContent = "Scan now";
            showToast("Enable at least one source.");
            return;
          }

          const item = options[Math.floor(Math.random() * options.length)];
          const row = document.createElement("div");
          row.className = "result";
          row.dataset.source = item.source;
          row.dataset.viewers = String(item.viewers);
          row.innerHTML = `<div class="ico ${item.cls}">${item.short}</div><div><div class="result-title">${item.title}</div><div class="result-sub">${item.sub}</div></div><span class="badge ${item.badgeClass}">${item.badge}</span><div class="result-time">now</div>`;
          qs<HTMLElement>("#results")?.prepend(row);

          const statNew = qs<HTMLElement>("#statNew");
          const statLive = qs<HTMLElement>("#statLive");
          if (statNew) statNew.textContent = String(Number(statNew.textContent) + 1);
          if (statLive && item.badge === "LIVE") {
            statLive.textContent = String(Number(statLive.textContent) + 1);
          }
          const reach = qs<HTMLElement>("#statReach");
          if (reach) reach.textContent = "291K";
          button.classList.remove("loading");
          button.textContent = "Scan now";
          applyFilters();
          showToast("A new signal was added to the demo feed.");
        }, 950);
        timers.push(timer);
      },
      { signal },
    );

    qs<HTMLElement>("#notifBtn")?.addEventListener(
      "click",
      () => qs<HTMLElement>("#drawer")?.classList.toggle("open"),
      { signal },
    );
    qs<HTMLElement>("#drawerClose")?.addEventListener(
      "click",
      () => qs<HTMLElement>("#drawer")?.classList.remove("open"),
      { signal },
    );

    qsa<HTMLElement>("[data-cycle]").forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          qsa<HTMLElement>("[data-cycle]").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          const yearly = button.dataset.cycle === "yearly";
          qsa<HTMLElement>(".price").forEach((price) => {
            const value = yearly ? price.dataset.yearly : price.dataset.monthly;
            price.innerHTML = `${value ?? "0"} PLN <small>/mo</small>`;
          });
        },
        { signal },
      ),
    );

    qsa<HTMLElement>(".plan-btn").forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          const plan = (button.dataset.plan ?? "indie").toLowerCase();
          localStorage.setItem("gamesignal-pending-plan", plan);
          router.push(`/signup?plan=${encodeURIComponent(plan)}`);
        },
        { signal },
      ),
    );

    qs<HTMLElement>("#checkoutDemo")?.addEventListener(
      "click",
      () => router.push("/signup"),
      { signal },
    );

    qsa<HTMLElement>(".faq-q").forEach((question) =>
      question.addEventListener(
        "click",
        () => {
          const item = question.parentElement;
          const wasOpen = item?.classList.contains("open");
          qsa<HTMLElement>(".faq-item").forEach((element) => element.classList.remove("open"));
          if (!wasOpen) item?.classList.add("open");
        },
        { signal },
      ),
    );

    const heroEvents = [
      ["t", "TW", "voidrunner started streaming", "Twitch · 93 viewers", "LIVE"],
      ["y", "YT", "“I found a hidden gem on Steam”", "YouTube · new upload", "VIDEO"],
      ["k", "K", "midnightbyte is playing for the first time", "Kick · 121 viewers", "LIVE"],
    ];
    let heroEventIndex = 0;
    const feedTimer = window.setInterval(() => {
      const feed = qs<HTMLElement>("#heroFeed");
      if (!feed) return;
      const [cls, short, title, meta, type] = heroEvents[heroEventIndex++ % heroEvents.length];
      const node = document.createElement("div");
      node.className = "feed-line new";
      node.innerHTML = `<div class="ico ${cls}">${short}</div><div><strong>${title}</strong><span>${meta}</span></div><div class="feed-meta">now<br>${type}</div>`;
      feed.prepend(node);
      Array.from(feed.children).forEach((element, index) =>
        element.classList.toggle("new", index === 0),
      );
      if (feed.children.length > 3) feed.lastElementChild?.remove();
    }, 7200);
    timers.push(feedTimer);

    qsa<HTMLElement>(".draggable").forEach((card) => {
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;

      card.addEventListener(
        "pointerdown",
        (event) => {
          if (window.innerWidth < 721) return;
          dragging = true;
          card.classList.add("dragging");
          card.setPointerCapture(event.pointerId);
          startX = event.clientX;
          startY = event.clientY;
          const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
          originX = matrix.m41;
          originY = matrix.m42;
        },
        { signal },
      );

      card.addEventListener(
        "pointermove",
        (event) => {
          if (!dragging) return;
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;
          const rotation = card.classList.contains("a") ? 2 : -2;
          card.style.transform = `translate(${originX + dx}px,${originY + dy}px) rotate(${rotation}deg)`;
        },
        { signal },
      );

      const stop = () => {
        dragging = false;
        card.classList.remove("dragging");
      };
      card.addEventListener("pointerup", stop, { signal });
      card.addEventListener("pointercancel", stop, { signal });
    });

    const command = qs<HTMLElement>("#command");
    command?.addEventListener(
      "pointermove",
      (event) => {
        if (window.innerWidth < 721) return;
        const rectangle = command.getBoundingClientRect();
        const x = (event.clientX - rectangle.left) / rectangle.width - 0.5;
        const y = (event.clientY - rectangle.top) / rectangle.height - 0.5;
        const grid = qs<HTMLElement>(".command-grid");
        if (grid) {
          grid.style.transform = `rotateX(${(-y * 2.2).toFixed(2)}deg) rotateY(${(x * 2.8).toFixed(2)}deg)`;
        }
      },
      { signal },
    );
    command?.addEventListener(
      "pointerleave",
      () => {
        const grid = qs<HTMLElement>(".command-grid");
        if (grid) grid.style.transform = "rotateX(0deg) rotateY(0deg)";
      },
      { signal },
    );

    return () => {
      abort.abort();
      timers.forEach((timer) => window.clearTimeout(timer));
      document.body.classList.remove("modal-open");
    };
  }, [router]);

  return <div ref={hostRef} className="landing-host" dangerouslySetInnerHTML={{ __html: landingMarkup }} />;
}
