import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BRAND.siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BRAND.siteUrl}/terms`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BRAND.siteUrl}/privacy`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BRAND.siteUrl}/withdrawal`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
