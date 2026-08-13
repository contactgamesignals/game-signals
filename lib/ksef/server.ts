import "server-only";

export type KsefEnvironment = "test" | "demo" | "production";

const KSEF_BASE_URLS: Record<KsefEnvironment, string> = {
  test: "https://api-test.ksef.mf.gov.pl/v2",
  demo: "https://api-demo.ksef.mf.gov.pl/v2",
  production: "https://api.ksef.mf.gov.pl/v2",
};

const PRODUCTION_UNLOCK_PHRASE = "I_UNDERSTAND_KSEF_PRODUCTION_HAS_LEGAL_EFFECT";

function normalizeEnvironment(value: string | undefined): KsefEnvironment {
  if (value === "demo" || value === "production") return value;
  return "test";
}

export function getKsefServerConfig() {
  const environment = normalizeEnvironment(process.env.KSEF_ENV);
  const enabled = process.env.KSEF_ENABLED === "true";
  const productionUnlocked =
    environment !== "production" || process.env.KSEF_PRODUCTION_UNLOCK === PRODUCTION_UNLOCK_PHRASE;

  return {
    enabled,
    environment,
    baseUrl: KSEF_BASE_URLS[environment],
    productionUnlocked,
    canSubmit: enabled && productionUnlocked,
    apiFamily: "KSeF 2.0",
    invoiceSchema: "FA(3)",
  } as const;
}

export function assertKsefSubmissionAllowed() {
  const config = getKsefServerConfig();
  if (!config.enabled) {
    throw new Error("KSeF submission is disabled.");
  }
  if (!config.productionUnlocked) {
    throw new Error("KSeF production is locked because production invoices have legal effect.");
  }
  return config;
}
