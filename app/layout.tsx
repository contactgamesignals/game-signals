import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${BRAND.name} - Twitch and YouTube game monitoring`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/opengraph-image"],
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
        <Analytics />
      </body>
    </html>
  );
}
