import { landingRealityMarkup } from "@/lib/landing-reality";

export const landingMarkup = landingRealityMarkup.replace(
  "Privacy Policy · Terms · Contact",
  'Closed beta · <a href="mailto:contact.gamesignals@gmail.com">Contact</a>',
);
