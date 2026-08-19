import LandingPage from "@/components/LandingPage";
import MarketingRealityPatch from "@/components/MarketingRealityPatch";
import PricingCyclePatch from "@/components/PricingCyclePatch";
import QuickStartSignupPatch from "@/components/QuickStartSignupPatch";
import { BRAND } from "@/lib/brand";
import { COMPANY } from "@/lib/company";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${BRAND.siteUrl}/#website`,
      name: BRAND.name,
      url: BRAND.siteUrl,
      description:
        "Twitch and YouTube creator monitoring for game developers, studios and publishers.",
      publisher: { "@id": `${BRAND.siteUrl}/#organization` },
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
      <LandingPage />
      <QuickStartSignupPatch />
      <MarketingRealityPatch />
      <PricingCyclePatch />
    </>
  );
}
