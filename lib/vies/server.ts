import "server-only";

const VIES_CHECK_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

const VIES_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "XI",
]);

export type ViesMatch = "VALID" | "INVALID" | "NOT_PROCESSED" | null;

export type ViesEvidence = {
  source: "EU_VIES_REST";
  checkedAt: string;
  countryCode: string;
  vatNumber: string;
  valid: boolean;
  requestDate: string | null;
  requestIdentifier: string | null;
  name: string | null;
  address: string | null;
  matches: {
    name: ViesMatch;
    street: ViesMatch;
    postalCode: ViesMatch;
    city: ViesMatch;
    companyType: ViesMatch;
  };
  auditStrength: "request_identifier_present" | "validity_only";
  taxDecision: "evidence_only";
};

function normalizedText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function match(value: unknown): ViesMatch {
  return value === "VALID" || value === "INVALID" || value === "NOT_PROCESSED" ? value : null;
}

function normalizeCountryCode(value: string) {
  const input = value.trim().toUpperCase();
  const countryCode = input === "GR" ? "EL" : input;
  if (!VIES_COUNTRY_CODES.has(countryCode)) throw new Error("Unsupported VIES country code.");
  return countryCode;
}

function normalizeVatNumber(countryCode: string, value: string) {
  let vatNumber = value.trim().toUpperCase().replace(/[\s.\-/]/g, "");
  if (countryCode === "EL" && vatNumber.startsWith("GR")) vatNumber = vatNumber.slice(2);
  if (vatNumber.startsWith(countryCode)) vatNumber = vatNumber.slice(countryCode.length);
  if (!/^[A-Z0-9]{2,20}$/.test(vatNumber)) throw new Error("VAT number format is not suitable for VIES verification.");
  return vatNumber;
}

export function normalizeViesVatId(countryCodeInput: string, vatNumberInput: string) {
  const countryCode = normalizeCountryCode(countryCodeInput);
  return { countryCode, vatNumber: normalizeVatNumber(countryCode, vatNumberInput) };
}

export async function checkViesVatNumber(input: {
  countryCode: string;
  vatNumber: string;
  requester?: {
    memberStateCode: string;
    vatNumber: string;
  } | null;
  trader?: {
    name?: string | null;
    street?: string | null;
    postalCode?: string | null;
    city?: string | null;
    companyType?: string | null;
  } | null;
}): Promise<ViesEvidence> {
  const target = normalizeViesVatId(input.countryCode, input.vatNumber);
  const body: Record<string, string> = {
    countryCode: target.countryCode,
    vatNumber: target.vatNumber,
  };

  if (input.requester) {
    const requester = normalizeViesVatId(input.requester.memberStateCode, input.requester.vatNumber);
    body.requesterMemberStateCode = requester.countryCode;
    body.requesterNumber = requester.vatNumber;
  }

  const traderFields = {
    traderName: input.trader?.name,
    traderStreet: input.trader?.street,
    traderPostalCode: input.trader?.postalCode,
    traderCity: input.trader?.city,
    traderCompanyType: input.trader?.companyType,
  };
  for (const [key, value] of Object.entries(traderFields)) {
    if (typeof value === "string" && value.trim()) body[key] = value.trim().slice(0, 240);
  }

  const response = await fetch(VIES_CHECK_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload) throw new Error(`VIES verification failed with HTTP ${response.status}.`);
  if (typeof payload.valid !== "boolean") throw new Error("VIES returned an unexpected response without a validity result.");

  const requestIdentifier = normalizedText(payload.requestIdentifier);
  return {
    source: "EU_VIES_REST",
    checkedAt: new Date().toISOString(),
    countryCode: normalizedText(payload.countryCode) ?? target.countryCode,
    vatNumber: normalizedText(payload.vatNumber) ?? target.vatNumber,
    valid: payload.valid,
    requestDate: normalizedText(payload.requestDate),
    requestIdentifier,
    name: normalizedText(payload.name),
    address: normalizedText(payload.address),
    matches: {
      name: match(payload.traderNameMatch),
      street: match(payload.traderStreetMatch),
      postalCode: match(payload.traderPostalCodeMatch),
      city: match(payload.traderCityMatch),
      companyType: match(payload.traderCompanyTypeMatch),
    },
    auditStrength: requestIdentifier ? "request_identifier_present" : "validity_only",
    taxDecision: "evidence_only",
  };
}
