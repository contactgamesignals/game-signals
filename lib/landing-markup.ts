import { BRAND } from "@/lib/brand";
import { landingRealityMarkup } from "@/lib/landing-reality";

export const landingMarkup = landingRealityMarkup.replace(
  "Privacy Policy · Terms · Contact",
  `Closed beta · <a href="mailto:${BRAND.supportEmail}">Contact</a>`,
);
