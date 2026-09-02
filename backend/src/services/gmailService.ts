import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { fail } from "../utils/http.js";

const oauthScope = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"].join(" ");
const stateLifetimeMs = 10 * 60 * 1000;

type GmailAuth = {
  refreshToken: string;
  email: string;
  connectedAt: string;
};

let pendingState: { value: string; expiresAt: number } | null = null;

function isConfigured(): boolean {
  return Boolean(config.gmailClientId && config.gmailClientSecret && config.gmailRedirectUri);
}

async function readAuth(): Promise<GmailAuth | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(config.gmailTokenPath, "utf8")) as Partial<GmailAuth>;
    if (
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.connectedAt !== "string"
    ) {
      return null;
    }
    return parsed as GmailAuth;
  } catch {
    return null;
  }
}

async function writeAuth(auth: GmailAuth): Promise<void> {
  await fs.mkdir(path.dirname(config.gmailTokenPath), { recursive: true });
  await fs.writeFile(config.gmailTokenPath, JSON.stringify(auth, null, 2) + "\n", { mode: 0o600 });
  await fs.chmod(config.gmailTokenPath, 0o600);
}

function configuredOrFail(): void {
  if (!isConfigured()) {
    fail(
      503,
      "GMAIL_NOT_CONFIGURED",
      "Odesílání přes Gmail není nastavené. Doplňte GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET a GMAIL_REDIRECT_URI."
    );
  }
}

async function authOrFail(): Promise<GmailAuth> {
  configuredOrFail();
  const auth = await readAuth();
  if (!auth) {
    fail(409, "GMAIL_NOT_CONNECTED", "Gmail není propojený. Propojte ho znovu v Nastavení.");
  }
  return auth;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function assertSafeHeaderValue(value: string, label: string): void {
  if (/[\r\n]/.test(value)) {
    fail(400, "VALIDATION_ERROR", `${label} obsahuje nepovolený znak.`);
  }
}

export function getGmailStatus(): Promise<{ configured: boolean; connected: boolean; email: string | null }> {
  if (!isConfigured()) {
    return Promise.resolve({ configured: false, connected: false, email: null });
  }

  return readAuth().then((auth) => ({
    configured: true,
    connected: Boolean(auth),
    email: auth?.email ?? null
  }));
}

export function createGmailConnectUrl(): string {
  configuredOrFail();
  const value = randomBytes(32).toString("hex");
  pendingState = { value, expiresAt: Date.now() + stateLifetimeMs };

  const params = new URLSearchParams({
    client_id: config.gmailClientId,
    redirect_uri: config.gmailRedirectUri,
    response_type: "code",
    scope: oauthScope,
    access_type: "offline",
    prompt: "consent",
    state: value
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function consumeState(value: string): boolean {
  const current = pendingState;
  pendingState = null;
  return Boolean(current && current.value === value && current.expiresAt >= Date.now());
}

export async function completeGmailOAuth(code: string, state: string): Promise<GmailAuth> {
  configuredOrFail();
  if (!consumeState(state)) {
    fail(400, "BAD_REQUEST", "OAuth přihlášení vypršelo nebo není platné. Začněte propojení znovu.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.gmailClientId,
      client_secret: config.gmailClientSecret,
      redirect_uri: config.gmailRedirectUri,
      grant_type: "authorization_code"
    })
  });
  const tokenData = await responseJson(tokenResponse);
  const refreshToken = typeof tokenData.refresh_token === "string" ? tokenData.refresh_token : "";
  const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";
  if (!tokenResponse.ok || !refreshToken || !accessToken) {
    fail(502, "UPSTREAM_UNAVAILABLE", "Google nedokončil propojení Gmailu. Zkuste to prosím znovu.");
  }

  const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const userInfo = await responseJson(userInfoResponse);
  const email = typeof userInfo.email === "string" ? userInfo.email.trim() : "";
  if (!userInfoResponse.ok || !email || /[\r\n]/.test(email)) {
    fail(502, "UPSTREAM_UNAVAILABLE", "Google nevrátil adresu propojeného Gmail účtu.");
  }

  const auth: GmailAuth = { refreshToken, email, connectedAt: new Date().toISOString() };
  await writeAuth(auth);
  return auth;
}

async function removeAuth(): Promise<void> {
  await fs.rm(config.gmailTokenPath, { force: true });
}

export async function disconnectGmail(): Promise<void> {
  const auth = await readAuth();
  if (auth) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: auth.refreshToken })
      });
    } catch {
      // Local removal remains the source of truth when Google is unavailable.
    }
  }
  await removeAuth();
}

async function getAccessToken(auth: GmailAuth): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.gmailClientId,
      client_secret: config.gmailClientSecret,
      refresh_token: auth.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const data = await responseJson(response);
  if (!response.ok) {
    if (data.error === "invalid_grant") {
      await removeAuth();
      fail(409, "GMAIL_AUTH_EXPIRED", "Připojení ke Gmailu vypršelo nebo bylo odvoláno. Propojte ho znovu v Nastavení.");
    }
    fail(502, "UPSTREAM_UNAVAILABLE", "Přístupový token Gmailu se nepodařilo obnovit.");
  }

  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) {
    fail(502, "UPSTREAM_UNAVAILABLE", "Google nevrátil přístupový token Gmailu.");
  }
  return accessToken;
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  filename: string;
  pdfBytes: Buffer;
}): string {
  assertSafeHeaderValue(params.from, "Odesílatel");
  assertSafeHeaderValue(params.to, "Příjemce");
  assertSafeHeaderValue(params.subject, "Předmět");
  assertSafeHeaderValue(params.filename, "Název přílohy");

  const boundary = `invoice-${randomBytes(12).toString("hex")}`;
  return [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    params.body,
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${params.filename}"`,
    "",
    wrapBase64(params.pdfBytes.toString("base64")),
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

export async function sendInvoiceEmail(params: {
  to: string;
  subject: string;
  body: string;
  filename: string;
  pdfBytes: Buffer;
}): Promise<{ messageId: string }> {
  assertSafeHeaderValue(params.to, "Příjemce");
  assertSafeHeaderValue(params.subject, "Předmět");
  const auth = await authOrFail();
  const accessToken = await getAccessToken(auth);
  const raw = Buffer.from(
    buildMimeMessage({ ...params, from: auth.email }),
    "utf8"
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  const data = await responseJson(response);
  if (response.status === 401) {
    await removeAuth();
    fail(409, "GMAIL_AUTH_EXPIRED", "Připojení ke Gmailu vypršelo nebo bylo odvoláno. Propojte ho znovu v Nastavení.");
  }
  if (!response.ok) {
    fail(502, "EMAIL_SEND_FAILED", "Gmail zprávu nepřijal. Zkontrolujte propojení a zkuste to znovu.");
  }

  const messageId = typeof data.id === "string" ? data.id : "";
  if (!messageId) {
    fail(502, "EMAIL_SEND_FAILED", "Gmail nevrátil ID odeslané zprávy.");
  }
  return { messageId };
}
