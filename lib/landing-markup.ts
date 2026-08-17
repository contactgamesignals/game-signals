import { landingSeoMarkup } from "@/lib/landing-seo";

export const landingMarkup = landingSeoMarkup.replace(
  '<a href="/withdrawal">Withdrawal</a> · ',
  '<a href="/withdrawal">Withdrawal</a> · <a href="/refunds">Refund Policy</a> · ',
);
