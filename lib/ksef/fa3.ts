import "server-only";

import { COMPANY } from "@/lib/company";

const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";

export type Fa3PostalAddress = {
  countryCode: string;
  line1: string;
  line2?: string | null;
};

export type Fa3PolishBusinessBuyer = {
  nip: string;
  name: string;
  address?: Fa3PostalAddress | null;
};

export type Fa3VatExemptInvoiceInput = {
  /**
   * The legal invoice number controlled by Lumino Games' invoice sequence.
   * Do not silently substitute a Stripe invoice number here.
   */
  invoiceNumber: string;
  issueDate: string;
  createdAt: string;
  buyer: Fa3PolishBusinessBuyer;
  serviceName: string;
  amountMinor: number;
  currency?: "PLN";
  servicePeriod?: {
    from: string;
    to: string;
  } | null;
  /**
   * Must be reviewed for the actual seller status at the invoice date.
   * Example candidates must not be treated as hard-coded tax advice.
   */
  exemptionLegalBasis: string;
  stripeInvoiceId?: string | null;
};

export type Fa3Draft = {
  xml: string;
  invoiceNumber: string;
  amountMinor: number;
  schema: "FA(3)";
  schemaVersion: "1-0E";
  namespace: typeof FA3_NAMESPACE;
  taxTreatment: "vat_exempt";
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
    throw new Error("amountMinor must be a positive safe integer.");
  }
  return value;
}

function moneyFromMinor(value: number) {
  requireMinorAmount(value);
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function addressXml(address: Fa3PostalAddress) {
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

function sellerAddress() {
  // Keep legal seller data centralized in lib/company.ts. KSeF formatting is
  // intentionally separate from the human-readable legal-page string.
  return {
    countryCode: "PL",
    line1: "ul. Ujastek 1, 31-752 Kraków",
  } satisfies Fa3PostalAddress;
}

export function buildFa3VatExemptPolishB2bInvoice(input: Fa3VatExemptInvoiceInput): Fa3Draft {
  const invoiceNumber = requireText(input.invoiceNumber, "invoiceNumber", 256);
  const issueDate = requireDate(input.issueDate, "issueDate");
  const createdAt = requireIsoUtc(input.createdAt, "createdAt");
  const sellerNip = requirePolishNip(COMPANY.nip, "seller NIP");
  const buyerNip = requirePolishNip(input.buyer.nip, "buyer NIP");
  const buyerName = requireText(input.buyer.name, "buyer.name");
  const serviceName = requireText(input.serviceName, "serviceName");
  const exemptionLegalBasis = requireText(input.exemptionLegalBasis, "exemptionLegalBasis", 256);
  const amountMinor = requireMinorAmount(input.amountMinor);
  const amount = moneyFromMinor(amountMinor);
  const currency = input.currency ?? "PLN";

  if (currency !== "PLN") {
    throw new Error("The first FA(3) implementation is intentionally limited to PLN invoices.");
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

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Faktura xmlns="${FA3_NAMESPACE}">`,
    "<Naglowek>",
    `<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>`,
    "<WariantFormularza>3</WariantFormularza>",
    `<DataWytworzeniaFa>${createdAt}</DataWytworzeniaFa>`,
    `<SystemInfo>${escapeXml(`${COMPANY.productName} / Lumino Games`)}</SystemInfo>`,
    "</Naglowek>",
    "<Podmiot1>",
    "<DaneIdentyfikacyjne>",
    `<NIP>${sellerNip}</NIP>`,
    `<Nazwa>${escapeXml(COMPANY.legalName)}</Nazwa>`,
    "</DaneIdentyfikacyjne>",
    addressXml(sellerAddress()),
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
    `<P_13_7>${amount}</P_13_7>`,
    `<P_15>${amount}</P_15>`,
    "<Adnotacje>",
    "<P_16>2</P_16>",
    "<P_17>2</P_17>",
    "<P_18>2</P_18>",
    "<P_18A>2</P_18A>",
    "<Zwolnienie>",
    "<P_19>1</P_19>",
    `<P_19A>${escapeXml(exemptionLegalBasis)}</P_19A>`,
    "</Zwolnienie>",
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
    `<P_9A>${amount}</P_9A>`,
    `<P_11>${amount}</P_11>`,
    "<P_12>zw</P_12>",
    "</FaWiersz>",
    "</Fa>",
    "</Faktura>",
  ].filter(Boolean).join("");

  return {
    xml,
    invoiceNumber,
    amountMinor,
    schema: "FA(3)",
    schemaVersion: "1-0E",
    namespace: FA3_NAMESPACE,
    taxTreatment: "vat_exempt",
  };
}
