import { PDFDocument, PDFFont, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { authorizeRequest, json, jsonHeaders, serviceClient } from "../_shared/core.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TERMS_VERSION = "2026-08-17-v1";
const PRIVACY_VERSION = "2026-08-17-v1";
const WITHDRAWAL_VERSION = "2026-08-17-v1";
const COMPANY_NAME = "Lumino Games sp. z o.o.";
const COMPANY_ADDRESS = "ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Małopolskie, Poland";
const COMPANY_KRS = "0000910452";
const COMPANY_NIP = "6762600090";
const COMPANY_REGON = "389433660";
const SUPPORT_EMAIL = "whoplaysmygame@gmail.com";
const PUBLIC_SUPPORT_PHONE = "+48 694 366 395";
const SITE_URL = "https://www.whoplaysmygame.com";
const PDF_FILENAME = "who-plays-my-game-account-agreement.pdf";

const PDF_SECTION_HEADINGS = new Set([
  "Operator",
  "Account",
  "Service agreed at signup",
  "Duration and termination",
  "Withdrawal",
  "Complaints and support",
  "Personal data",
  "Applicable documents accepted at signup",
]);

type AcceptanceRow = {
  id: string;
  user_id: string;
  terms_version: string;
  privacy_version: string;
  accepted_at: string;
  confirmation_text: string | null;
  confirmation_sha256: string | null;
  confirmation_status: "pending" | "sending" | "delivered" | "failed" | "needs_review";
  confirmation_provider_message_id: string | null;
  confirmation_attempts: number;
};

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is not configured.`);
  return normalized;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildConfirmationText(input: { email: string; acceptedAt: string; phone: string }) {
  return `WHO PLAYS MY GAME - ACCOUNT AGREEMENT CONFIRMATION

This document confirms the online agreement concluded when you created and confirmed your Who Plays My Game account.

Operator
${COMPANY_NAME}
${COMPANY_ADDRESS}
KRS: ${COMPANY_KRS}
NIP: ${COMPANY_NIP}
REGON: ${COMPANY_REGON}
Email: ${SUPPORT_EMAIL}
Phone: ${input.phone}
Website: ${SITE_URL}

Account
Email: ${input.email}
Agreement accepted: ${input.acceptedAt}
Terms version: ${TERMS_VERSION}
Privacy version: ${PRIVACY_VERSION}
Withdrawal information version: ${WITHDRAWAL_VERSION}

Service agreed at signup
- Who Plays My Game is a web-based creator-monitoring service for game developers and publishers.
- The Free public-beta plan costs 0 USD and creates no recurring payment obligation.
- Free includes one active tracked game, YouTube video monitoring, Twitch live-stream monitoring and the authenticated creator-signal dashboard.
- Kick monitoring is not currently available.
- Paid subscriptions are not part of this Free account agreement and require a separate Paddle checkout.
- The service requires internet access, a current mainstream browser and a working email account for authentication.
- Monitoring relies on third-party platforms and APIs, so complete or immediate detection of every public mention cannot be guaranteed.

Duration and termination
The Free account continues until it is deleted or otherwise terminated under the Terms. You can request account deletion through the product subject to legal-record retention and other safeguards described in the Terms and Privacy Policy.

Withdrawal
If mandatory consumer law gives you a right to withdraw from this distance contract, the statutory period is generally 14 days from conclusion of the contract. Starting the Free service does not by itself waive mandatory withdrawal rights. To withdraw, send an unambiguous statement before the deadline to ${SUPPORT_EMAIL} or to the registered address above.

Model withdrawal statement:
"I hereby give notice that I withdraw from my contract for the Who Plays My Game service concluded on ${input.acceptedAt}. Account email: ${input.email}. Name: __________. Date: __________."

Complaints and support
Product-access, functionality, conformity, privacy or legal requests can be sent to ${SUPPORT_EMAIL} or through the contact details above. Mandatory consumer remedies are not excluded.

Personal data
Account and service data are processed as described in Privacy Policy version ${PRIVACY_VERSION}. Payment-card data is not collected for the Free plan.

Applicable documents accepted at signup
Terms: ${SITE_URL}/terms
Privacy Policy: ${SITE_URL}/privacy
Withdrawal information: ${SITE_URL}/withdrawal

This PDF is the account agreement confirmation sent to you for your records. The frozen confirmation text and its SHA-256 digest are retained with the agreement evidence.
`;
}

function asciiForPdf(value: string) {
  const replacements: Record<string, string> = {
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "A", "Ć": "C", "Ę": "E", "Ł": "L", "Ń": "N", "Ó": "O", "Ś": "S", "Ź": "Z", "Ż": "Z",
    "–": "-", "-": "-", "−": "-", "’": "'", "“": "\"", "”": "\"", " ": " ",
  };
  return Array.from(value, (character) => replacements[character] ?? character).join("");
}

function wrapPdfLine(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }
    let fragment = "";
    for (const character of word) {
      const next = `${fragment}${character}`;
      if (fragment && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment = next;
      }
    }
    current = fragment;
  }
  if (current) lines.push(current);
  return lines;
}

async function buildConfirmationPdf(confirmationText: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodySize = 9.4;
  const bodyLineHeight = 13.2;
  const marginX = 54;
  const bottomMargin = 50;
  const safeText = asciiForPdf(confirmationText).replace(/^WHO PLAYS MY GAME - ACCOUNT AGREEMENT CONFIRMATION\n+/, "");

  let page = pdf.addPage([595.28, 841.89]);
  let y = 0;

  const startPage = () => {
    const { width, height } = page.getSize();
    page.drawText("WHO PLAYS MY GAME", { x: marginX, y: height - 58, size: 15, font: bold, color: rgb(0.06, 0.08, 0.14) });
    page.drawText("Account agreement confirmation", { x: marginX, y: height - 79, size: 11.5, font: regular, color: rgb(0.32, 0.35, 0.42) });
    page.drawLine({ start: { x: marginX, y: height - 94 }, end: { x: width - marginX, y: height - 94 }, thickness: 0.7, color: rgb(0.84, 0.85, 0.88) });
    y = height - 116;
  };

  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    startPage();
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < bottomMargin) newPage();
  };

  startPage();
  const lines = safeText.split("\n");
  for (const sourceLine of lines) {
    const trimmed = sourceLine.trim();
    if (!trimmed) {
      y -= 7;
      continue;
    }

    if (PDF_SECTION_HEADINGS.has(trimmed)) {
      ensureSpace(28);
      y -= 5;
      page.drawText(trimmed, { x: marginX, y, size: 10.6, font: bold, color: rgb(0.06, 0.08, 0.14) });
      y -= 18;
      continue;
    }

    const isBullet = trimmed.startsWith("- ");
    const text = isBullet ? trimmed.slice(2) : trimmed;
    const x = isBullet ? marginX + 14 : marginX;
    const maxWidth = page.getWidth() - marginX - x;
    const wrapped = wrapPdfLine(text, regular, bodySize, maxWidth);
    ensureSpace(wrapped.length * bodyLineHeight + 3);
    if (isBullet) page.drawText("-", { x: marginX + 2, y, size: bodySize, font: regular, color: rgb(0.16, 0.18, 0.23) });
    for (const wrappedLine of wrapped) {
      page.drawText(wrappedLine, { x, y, size: bodySize, font: regular, color: rgb(0.16, 0.18, 0.23) });
      y -= bodyLineHeight;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    const { width } = currentPage.getSize();
    const footer = `Page ${index + 1} of ${pages.length}`;
    const footerWidth = regular.widthOfTextAtSize(footer, 8);
    currentPage.drawText("Who Plays My Game", { x: marginX, y: 27, size: 8, font: regular, color: rgb(0.48, 0.5, 0.56) });
    currentPage.drawText(footer, { x: width - marginX - footerWidth, y: 27, size: 8, font: regular, color: rgb(0.48, 0.5, 0.56) });
  });

  pdf.setTitle("Who Plays My Game - Account Agreement Confirmation");
  pdf.setAuthor(COMPANY_NAME);
  pdf.setSubject("Account agreement confirmation");
  pdf.setCreator("Who Plays My Game");
  return new Uint8Array(await pdf.save());
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function formatAcceptedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function buildEmailText(input: { email: string; acceptedAt: string }) {
  return `Welcome to Who Plays My Game

Your account is ready.

Plan: Free
Price: 0 USD
Account: ${input.email}
Agreement accepted: ${formatAcceptedDate(input.acceptedAt)}

Your full account agreement confirmation is attached as a PDF. Please keep it for your records.

Open dashboard: ${SITE_URL}/dashboard
Terms: ${SITE_URL}/terms
Privacy: ${SITE_URL}/privacy
Withdrawal information: ${SITE_URL}/withdrawal

Need help? Contact ${SUPPORT_EMAIL}.

Who Plays My Game
${COMPANY_NAME}
`;
}

function buildEmailHtml(input: { email: string; acceptedAt: string }) {
  const email = escapeHtml(input.email);
  const acceptedAt = escapeHtml(formatAcceptedDate(input.acceptedAt));
  return `
  <div style="background:#f5f7fb;padding:28px 12px;font-family:Inter,Arial,sans-serif;color:#171a23">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e7e9ef;border-radius:16px;overflow:hidden">
      <div style="padding:30px 34px 22px">
        <div style="font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#545b6b">Who Plays My Game</div>
        <h1 style="font-size:28px;line-height:1.2;margin:14px 0 10px;color:#10131a">Your account is ready</h1>
        <p style="font-size:16px;line-height:1.65;margin:0;color:#4b5260">Thanks for creating your Who Plays My Game account.</p>
      </div>
      <div style="padding:0 34px 28px">
        <div style="background:#f7f8fb;border:1px solid #e7e9ef;border-radius:12px;padding:18px 20px;line-height:1.7;font-size:14px">
          <div><strong>Plan:</strong> Free</div>
          <div><strong>Price:</strong> 0 USD</div>
          <div><strong>Account:</strong> ${email}</div>
          <div><strong>Agreement accepted:</strong> ${acceptedAt}</div>
        </div>
        <p style="font-size:15px;line-height:1.65;margin:22px 0;color:#4b5260">Your full account agreement confirmation is attached as a PDF. Please keep it for your records.</p>
        <a href="${SITE_URL}/dashboard" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px">Open dashboard</a>
        <div style="margin-top:26px;font-size:13px;line-height:1.7;color:#697080">
          <a href="${SITE_URL}/terms" style="color:#4f46e5;text-decoration:none">Terms</a>
          <span style="padding:0 7px">|</span>
          <a href="${SITE_URL}/privacy" style="color:#4f46e5;text-decoration:none">Privacy</a>
          <span style="padding:0 7px">|</span>
          <a href="${SITE_URL}/withdrawal" style="color:#4f46e5;text-decoration:none">Withdrawal information</a>
        </div>
      </div>
      <div style="border-top:1px solid #eceef3;padding:20px 34px;font-size:12px;line-height:1.65;color:#7a8190">
        Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#4f46e5;text-decoration:none">${SUPPORT_EMAIL}</a><br>
        ${COMPANY_NAME}
      </div>
    </div>
  </div>`;
}

function providerError(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : null;
    if (message) return `Resend HTTP ${status}: ${message}`;
  }
  return `Resend HTTP ${status}.`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const auth = await authorizeRequest(request);
    if (auth.internal || !auth.userId) return json({ error: "Forbidden." }, 403);

    const supabase = serviceClient();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(auth.userId);
    const recipient = userData.user?.email?.trim();
    if (userError || !recipient) throw new Error("Authenticated account email could not be resolved.");

    const { data: rowData, error: rowError } = await supabase
      .from("account_legal_acceptances")
      .select("id,user_id,terms_version,privacy_version,accepted_at,confirmation_text,confirmation_sha256,confirmation_status,confirmation_provider_message_id,confirmation_attempts")
      .eq("user_id", auth.userId)
      .eq("terms_version", TERMS_VERSION)
      .eq("privacy_version", PRIVACY_VERSION)
      .eq("source", "signup")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rowError) throw new Error(`Could not read account agreement acceptance: ${rowError.message}`);

    if (!rowData) return json({ ok: true, legacy_account: true });

    let row = rowData as AcceptanceRow;
    if (row.confirmation_status === "delivered") {
      return json({ ok: true, already_delivered: true, provider_message_id: row.confirmation_provider_message_id });
    }
    if (row.confirmation_status === "sending" || row.confirmation_status === "needs_review") {
      return json({ error: "Agreement confirmation delivery needs reconciliation before another send." }, 409);
    }

    const apiKey = required(Deno.env.get("RESEND_API_KEY"), "RESEND_API_KEY");
    const fromEmail = Deno.env.get("ACCOUNT_AGREEMENT_FROM_EMAIL")?.trim()
      || Deno.env.get("RESEND_FROM_EMAIL")?.trim()
      || "Who Plays My Game <updates@auth.whoplaysmygame.com>";
    const supportPhone = Deno.env.get("GAMESIGNAL_SUPPORT_PHONE")?.trim() || PUBLIC_SUPPORT_PHONE;

    if (!row.confirmation_text || !row.confirmation_sha256) {
      const confirmationText = buildConfirmationText({ email: recipient, acceptedAt: row.accepted_at, phone: supportPhone });
      const confirmationHash = await sha256(confirmationText);
      const { data: prepared, error: prepareError } = await supabase
        .from("account_legal_acceptances")
        .update({ confirmation_text: confirmationText, confirmation_sha256: confirmationHash, confirmation_status: "pending", confirmation_last_error: null })
        .eq("id", row.id)
        .is("confirmation_text", null)
        .select("id,user_id,terms_version,privacy_version,accepted_at,confirmation_text,confirmation_sha256,confirmation_status,confirmation_provider_message_id,confirmation_attempts")
        .maybeSingle();
      if (prepareError) throw new Error(`Could not freeze account agreement confirmation: ${prepareError.message}`);
      if (prepared) row = prepared as AcceptanceRow;
      else {
        const { data: refreshed, error: refreshError } = await supabase
          .from("account_legal_acceptances")
          .select("id,user_id,terms_version,privacy_version,accepted_at,confirmation_text,confirmation_sha256,confirmation_status,confirmation_provider_message_id,confirmation_attempts")
          .eq("id", row.id)
          .single();
        if (refreshError || !refreshed) throw new Error("Could not reload frozen account agreement confirmation.");
        row = refreshed as AcceptanceRow;
      }
    }

    if (!row.confirmation_text || !row.confirmation_sha256) throw new Error("Frozen account agreement confirmation is incomplete.");
    if (await sha256(row.confirmation_text) !== row.confirmation_sha256) throw new Error("Frozen account agreement confirmation hash mismatch.");

    const { data: claimed, error: claimError } = await supabase
      .from("account_legal_acceptances")
      .update({ confirmation_status: "sending", confirmation_attempts: row.confirmation_attempts + 1, confirmation_last_error: null })
      .eq("id", row.id)
      .in("confirmation_status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(`Could not claim agreement confirmation delivery: ${claimError.message}`);
    if (!claimed) return json({ error: "Agreement confirmation is already being processed." }, 409);

    let response: Response;
    try {
      const pdfBytes = await buildConfirmationPdf(row.confirmation_text);
      response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `account-agreement/${row.id}/${row.confirmation_sha256}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient],
          subject: "Who Plays My Game - your account is ready",
          text: buildEmailText({ email: recipient, acceptedAt: row.accepted_at }),
          html: buildEmailHtml({ email: recipient, acceptedAt: row.accepted_at }),
          attachments: [{ content: toBase64(pdfBytes), filename: PDF_FILENAME }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await supabase.from("account_legal_acceptances").update({
        confirmation_status: "needs_review",
        confirmation_last_error: "Ambiguous Resend network failure after delivery POST began; automatic resend disabled.",
      }).eq("id", row.id);
      return json({ error: "Agreement confirmation delivery outcome is ambiguous and needs review." }, 503);
    }

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok) {
      const providerId = typeof payload?.id === "string" ? payload.id.trim() : "";
      if (!providerId) {
        await supabase.from("account_legal_acceptances").update({
          confirmation_status: "needs_review",
          confirmation_last_error: "Resend returned success without a provider message ID.",
        }).eq("id", row.id);
        return json({ error: "Agreement confirmation provider response needs review." }, 503);
      }
      const { error: deliveredError } = await supabase.from("account_legal_acceptances").update({
        confirmation_status: "delivered",
        confirmation_provider_message_id: providerId,
        confirmation_sent_at: new Date().toISOString(),
        confirmation_last_error: null,
      }).eq("id", row.id).eq("confirmation_status", "sending");
      if (deliveredError) throw new Error(`Email was accepted but delivery evidence could not be persisted: ${deliveredError.message}`);
      return json({ ok: true, delivered: true, provider_message_id: providerId });
    }

    const errorText = providerError(payload, response.status).slice(0, 4000);
    const retryable = response.status === 429 || response.status >= 500;
    await supabase.from("account_legal_acceptances").update({
      confirmation_status: retryable ? "failed" : "needs_review",
      confirmation_last_error: errorText,
    }).eq("id", row.id);
    return json({ error: errorText, retryable }, retryable ? 503 : 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account agreement confirmation failed.";
    const status = /Unauthorized/.test(message) ? 401 : /Forbidden/.test(message) ? 403 : /not configured/.test(message) ? 503 : 500;
    return json({ error: message.slice(0, 500) }, status);
  }
});
