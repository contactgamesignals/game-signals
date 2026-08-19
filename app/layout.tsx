import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import InteractionFeedback from "@/components/InteractionFeedback";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const title = `Twitch & YouTube Game Monitoring | ${BRAND.name}`;
const description =
  "Get alerts when Twitch streamers play your game or new YouTube videos cover it. Creator monitoring for indie developers, studios and publishers.";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title,
  description,
  applicationName: BRAND.name,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: BRAND.siteUrl,
    siteName: BRAND.name,
    title,
    description,
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${spaceGrotesk.variable}`}>
      <body>
        <InteractionFeedback />
        {children}
      </body>
    </html>
  );
}
