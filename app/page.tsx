import MarketingHome from "@/components/MarketingHome";
import { BRAND } from "@/lib/brand";
import { COMPANY } from "@/lib/company";

export const dynamic = "force-static";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${BRAND.siteUrl}/#website`,
      name: BRAND.name,
      url: BRAND.siteUrl,
      description: "Twitch and YouTube creator monitoring for game developers, studios and publishers.",
      publisher: { "@id": `${BRAND.siteUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: BRAND.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: BRAND.siteUrl,
      description: "Monitor new YouTube videos and Twitch live streams related to your game, then review creator signals in a dashboard with Discord alerts and daily email digests on paid plans.",
      offers: [
        { "@type": "Offer", name: "Indie", price: "2.99", priceCurrency: "USD" },
        { "@type": "Offer", name: "Studio", price: "7.99", priceCurrency: "USD" },
        { "@type": "Offer", name: "Publisher", price: "14.99", priceCurrency: "USD" },
      ],
    },
    {
      "@type": "Organization",
      "@id": `${BRAND.siteUrl}/#organization`,
      name: COMPANY.legalName,
      url: BRAND.siteUrl,
      email: COMPANY.supportEmail,
      telephone: COMPANY.supportPhone,
      address: {
        "@type": "PostalAddress",
        streetAddress: COMPANY.streetAddress,
        postalCode: COMPANY.postalCode,
        addressLocality: COMPANY.city,
        addressRegion: COMPANY.region,
        addressCountry: COMPANY.countryCode,
      },
      identifier: [
        { "@type": "PropertyValue", propertyID: "KRS", value: COMPANY.krs },
        { "@type": "PropertyValue", propertyID: "NIP", value: COMPANY.nip },
        { "@type": "PropertyValue", propertyID: "REGON", value: COMPANY.regon },
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }}
      />
      <MarketingHome />
    </>
  );
}
