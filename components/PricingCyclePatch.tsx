"use client";

import { useEffect } from "react";

const yearlyTotals: Record<string, string> = {
  Indie: "245",
  Studio: "645",
  Publisher: "1495",
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
          if (total) price.innerHTML = `${total} PLN <small>/yr</small>`;
          return;
        }

        const monthly = price.dataset.monthly;
        if (monthly) price.innerHTML = `${monthly} PLN <small>/mo</small>`;
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
