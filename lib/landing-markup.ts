import { landingRealityMarkup } from "@/lib/landing-reality";

export const landingMarkup = landingRealityMarkup.replace(
  '<a href="/withdrawal">Withdrawal</a> · ',
  '<a href="/withdrawal">Withdrawal</a> · <a href="/refunds">Refund Policy</a> · ',
);
