import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name} - Twitch and YouTube game monitoring`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 78px",
          background:
            "radial-gradient(circle at 80% 18%, rgba(122,108,255,.35), transparent 32%), radial-gradient(circle at 18% 82%, rgba(53,231,255,.26), transparent 30%), #090b12",
          color: "#f7f8fb",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 34, fontWeight: 700 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              border: "2px solid rgba(255,255,255,.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 25,
            }}
          >
            WP
          </div>
          {BRAND.name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
          <div style={{ fontSize: 70, lineHeight: 1.05, fontWeight: 800, letterSpacing: -2 }}>
            See when creators play your game.
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.35, color: "#aeb6c8" }}>
            Twitch stream alerts and YouTube game monitoring for developers, studios and publishers.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 24, color: "#d6dbea" }}>
          <span>YouTube</span>
          <span>•</span>
          <span>Twitch</span>
          <span>•</span>
          <span>Discord alerts</span>
          <span>•</span>
          <span>Daily digest</span>
        </div>
      </div>
    ),
    size,
  );
}
