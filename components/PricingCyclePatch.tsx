"use client";

import { useEffect } from "react";

const yearlyTotals: Record<string, string> = {
  Indie: "$29.90",
  Studio: "$79.90",
  Publisher: "$149.90",
};

export default function PricingCyclePatch() {
  useEffect(() => {
    const updatePrices = (yearly: boolean) => {
      document.querySelectorAll<HTMLElement>(".plan").forEach((plan) => {
        const name = (plan.querySelector("h3")?.textContent ?? "").trim();
        const price = plan.querySelector<HTMLElement>(".price");
        if (!price) return;

        if (yearly) {
          const total = yearlyTotals[name];
          if (total) price.innerHTML = `${total} <small>/yr</small>`;
          return;
        }

        const monthly = price.dataset.monthly;
        if (monthly) price.innerHTML = `${monthly} <small>/mo</small>`;
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cycle]") : null;
      if (!target) return;
      const yearly = target.dataset.cycle === "yearly";
      requestAnimationFrame(() => updatePrices(yearly));
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
