import "server-only";

import { ACTIVE_SELLER } from "@/lib/seller-profile";

const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";
const STANDARD_VAT_RATE = 23;

export type Fa3ActiveVatPostalAddress = {
  countryCode: string;
  line1: string;
  line2?: string | null;
};

export type Fa3ActiveVatSeller = {
  nip: string;
  name: string;
  address: Fa3ActiveVatPostalAddress;
  systemInfo?: string | null;
};

export type Fa3ActiveVatPolishBusinessBuyer = {
  nip: string;
  name: string;
  address?: Fa3ActiveVatPostalAddress | null;
};

export type Fa3StandardVatInvoiceInput = {
  /** Legal invoice number from the seller's own invoice sequence. */
  invoiceNumber: string;
  issueDate: string;
  createdAt: string;
  /** Optional immutable seller snapshot. Existing callers default to ACTIVE_SELLER. */
  seller?: Fa3ActiveVatSeller;
  buyer: Fa3ActiveVatPolishBusinessBuyer;
  serviceName: string;
  /** Customer-facing gross amount, including 23% Polish VAT. */
  grossAmountMinor: number;
  currency?: "PLN";
  servicePeriod?: {
    from: string;
    to: string;
  } | null;
  stripeInvoiceId?: string | null;
};

export type Fa3StandardVatDraft = {
  xml: string;
  invoiceNumber: string;
  grossAmountMinor: number;
  netAmountMinor: number;
  vatAmountMinor: number;
  vatRate: 23;
  schema: "FA(3)";
  schemaVersion: "1-0E";
  namespace: typeof FA3_NAMESPACE;
  taxTreatment: "vat_23_inclusive";
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function requireText(value: string, field: string, maxLength = 512) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${field} is required.`);
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized;
}

function requireDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must use YYYY-MM-DD.`);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} is not a valid date.`);
  return value;
}

function requireIsoUtc(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error(`${field} must be an ISO UTC timestamp ending in Z.`);
  }
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} is not a valid timestamp.`);
  return value;
}

function requirePolishNip(value: string, field: string) {
  const nip = value.replace(/\D/g, "");
  if (!/^\d{10}$/.test(nip)) throw new Error(`${field} must contain exactly 10 digits.`);
  return nip;
}

function requireCountryCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error("Country code must contain two letters.");
  return code;
}

function requireMinorAmount(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("grossAmountMinor must be a positive safe integer.");
  }
  return value;
}

function moneyFromMinor(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Money amount must be a non-negative safe integer.");
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

/**
 * Extract 23% VAT from a VAT-inclusive amount using the standard gross * 23/123
 * formula and integer minor-unit rounding. Net + VAT always equals gross.
 */
export function splitPolishVat23FromGross(grossAmountMinor: number) {
  const gross = requireMinorAmount(grossAmountMinor);
  const vatAmountMinor = Math.round((gross * STANDARD_VAT_RATE) / (100 + STANDARD_VAT_RATE));
  const netAmountMinor = gross - vatAmountMinor;
  if (netAmountMinor <= 0 || vatAmountMinor <= 0 || netAmountMinor + vatAmountMinor !== gross) {
    throw new Error("Could not split the gross amount into net and VAT safely.");
  }
  return { grossAmountMinor: gross, netAmountMinor, vatAmountMinor } as const;
}

function addressXml(address: Fa3ActiveVatPostalAddress) {
  const countryCode = requireCountryCode(address.countryCode);
  const line1 = requireText(address.line1, "address.line1");
  const line2 = address.line2 ? requireText(address.line2, "address.line2") : null;

  return [
    "<Adres>",
    `<KodKraju>${escapeXml(countryCode)}</KodKraju>`,
    `<AdresL1>${escapeXml(line1)}</AdresL1>`,
    line2 ? `<AdresL2>${escapeXml(line2)}</AdresL2>` : "",
    "</Adres>",
  ].filter(Boolean).join("");
}

export function buildFa3StandardVatPolishB2bInvoice(input: Fa3StandardVatInvoiceInput): Fa3StandardVatDraft {
  const invoiceNumber = requireText(input.invoiceNumber, "invoiceNumber", 256);
  const issueDate = requireDate(input.issueDate, "issueDate");
  const createdAt = requireIsoUtc(input.createdAt, "createdAt");
  const seller: Fa3ActiveVatSeller = input.seller ?? {
    nip: ACTIVE_SELLER.nip,
    name: ACTIVE_SELLER.legalName,
    address: ACTIVE_SELLER.structuredAddress,
    systemInfo: `${ACTIVE_SELLER.productName} / ${ACTIVE_SELLER.legalName}`,
  };
  const sellerNip = requirePolishNip(seller.nip, "seller NIP");
  const sellerName = requireText(seller.name, "seller.name");
  const sellerSystemInfo = requireText(seller.systemInfo ?? `GameSignal / ${sellerName}`, "seller.systemInfo");
  const buyerNip = requirePolishNip(input.buyer.nip, "buyer NIP");
  const buyerName = requireText(input.buyer.name, "buyer.name");
  const serviceName = requireText(input.serviceName, "serviceName");
  const currency = input.currency ?? "PLN";
  const amounts = splitPolishVat23FromGross(input.grossAmountMinor);

  if (currency !== "PLN") {
    throw new Error("The first active-VAT FA(3) implementation is intentionally limited to PLN invoices.");
  }
  if (buyerNip === sellerNip) throw new Error("Buyer NIP cannot equal seller NIP.");

  let periodXml = "";
  if (input.servicePeriod) {
    const from = requireDate(input.servicePeriod.from, "servicePeriod.from");
    const to = requireDate(input.servicePeriod.to, "servicePeriod.to");
    if (from > to) throw new Error("servicePeriod.from cannot be after servicePeriod.to.");
    periodXml = `<OkresFa><P_6_Od>${from}</P_6_Od><P_6_Do>${to}</P_6_Do></OkresFa>`;
  }

  const buyerAddressXml = input.buyer.address ? addressXml(input.buyer.address) : "";
  const stripeReference = input.stripeInvoiceId
    ? `<DodatkowyOpis><Klucz>Stripe invoice ID</Klucz><Wartosc>${escapeXml(requireText(input.stripeInvoiceId, "stripeInvoiceId"))}</Wartosc></DodatkowyOpis>`
    : "";

  const gross = moneyFromMinor(amounts.grossAmountMinor);
  const net = moneyFromMinor(amounts.netAmountMinor);
  const vat = moneyFromMinor(amounts.vatAmountMinor);

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Faktura xmlns="${FA3_NAMESPACE}">`,
    "<Naglowek>",
    `<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>`,
    "<WariantFormularza>3</WariantFormularza>",
    `<DataWytworzeniaFa>${createdAt}</DataWytworzeniaFa>`,
    `<SystemInfo>${escapeXml(sellerSystemInfo)}</SystemInfo>`,
    "</Naglowek>",
    "<Podmiot1>",
    "<DaneIdentyfikacyjne>",
    `<NIP>${sellerNip}</NIP>`,
    `<Nazwa>${escapeXml(sellerName)}</Nazwa>`,
    "</DaneIdentyfikacyjne>",
    addressXml(seller.address),
    "</Podmiot1>",
    "<Podmiot2>",
    "<DaneIdentyfikacyjne>",
    `<NIP>${buyerNip}</NIP>`,
    `<Nazwa>${escapeXml(buyerName)}</Nazwa>`,
    "</DaneIdentyfikacyjne>",
    buyerAddressXml,
    "<JST>2</JST>",
    "<GV>2</GV>",
    "</Podmiot2>",
    "<Fa>",
    `<KodWaluty>${currency}</KodWaluty>`,
    `<P_1>${issueDate}</P_1>`,
    `<P_2>${escapeXml(invoiceNumber)}</P_2>`,
    periodXml,
    `<P_13_1>${net}</P_13_1>`,
    `<P_14_1>${vat}</P_14_1>`,
    `<P_15>${gross}</P_15>`,
    "<Adnotacje>",
    "<P_16>2</P_16>",
    "<P_17>2</P_17>",
    "<P_18>2</P_18>",
    "<P_18A>2</P_18A>",
    "<Zwolnienie><P_19N>1</P_19N></Zwolnienie>",
    "<NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>",
    "<P_23>2</P_23>",
    "<PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>",
    "</Adnotacje>",
    "<RodzajFaktury>VAT</RodzajFaktury>",
    stripeReference,
    "<FaWiersz>",
    "<NrWierszaFa>1</NrWierszaFa>",
    `<P_7>${escapeXml(serviceName)}</P_7>`,
    "<P_8A>usługa</P_8A>",
    "<P_8B>1</P_8B>",
    `<P_9A>${net}</P_9A>`,
    `<P_11>${net}</P_11>`,
    "<P_12>23</P_12>",
    "</FaWiersz>",
    "</Fa>",
    "</Faktura>",
  ].filter(Boolean).join("");

  return {
    xml,
    invoiceNumber,
    grossAmountMinor: amounts.grossAmountMinor,
    netAmountMinor: amounts.netAmountMinor,
    vatAmountMinor: amounts.vatAmountMinor,
    vatRate: STANDARD_VAT_RATE,
    schema: "FA(3)",
    schemaVersion: "1-0E",
    namespace: FA3_NAMESPACE,
    taxTreatment: "vat_23_inclusive",
  };
}
