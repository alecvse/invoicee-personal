import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import type { BankAccount, Contact, Invoice, InvoiceItem } from "@prisma/client";
import { formatDate } from "../../utils/date.js";
import { toNumber } from "../../utils/decimal.js";

export type InvoiceForPdf = Invoice & {
  items: InvoiceItem[];
  contact: Contact;
  bankAccount: BankAccount;
};

export type Lang = "cs" | "en";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const regularFontPath = path.resolve(currentDir, "../../../assets/fonts/Inter-Regular.ttf");
const extraBoldFontPath = path.resolve(currentDir, "../../../assets/fonts/Inter-ExtraBold.ttf");
const invoiceIconPath = path.resolve(currentDir, "../../../assets/icons/invoice.svg");

export const classicColors = {
  background: "#FFFFFF",
  indigo600: "#4f46e5",
  slate960: "#020617"
} as const;

export const mondrianColors = {
  white: "#FFFFFF",
  ink: "#020617",
  blue: "#1d4ed8",
  red: "#dc2626",
  yellow: "#eab308",
  grid: "#111827",
  slate: "#334155",
  lightSlate: "#64748b"
} as const;

export const classicPage = {
  left: 30,
  right: 565
} as const;

export const mondrianPage = {
  left: 34,
  right: 561,
  top: 34,
  bottom: 808,
  width: 527
} as const;

export const sectionSpacing = 32;

const fallbackInvoiceIconPaths = {
  body: "M28.8813759,38.6956 L29.9857747,37.3152 C30.9561736,36.1022 33.0169712,36.2 33.8367703,37.4976 C34.8227692,39.059 37.2583665,38.7486 37.9337657,37.3124 C37.9689656,37.2378 37.8809657,37.4246 37.9561657,36.7784 C38.0311656,36.1322 38.0000166,35.9846 37.9373657,35.6896 L34.09117,17.5282 C33.1245711,12.9639 32.6411717,10.68172 30.9785735,9.34086 C29.3161754,8 26.9695781,8 22.2767834,8 L17.7231885,8 C13.0303338,8 10.6838764,8 9.0213183,9.34086 C7.35874018,10.68172 6.87542072,12.9639 5.90878181,17.5282 L2.06260615,35.6896 C2.00000395,35.9846 1.96882626,36.1322 2.04388617,36.7784 C2.11892609,37.4246 2.03108619,37.2378 2.06620615,37.3124 C2.74168539,38.7486 5.17712264,39.059 6.16330153,37.4976 C6.9830406,36.2 9.04373828,36.1022 10.0141772,37.3152 L11.1186759,38.6956 C12.5102744,40.4348 15.4163711,40.4348 16.8079895,38.6956 L16.9815893,38.4784 C18.4581877,36.633 21.5417842,36.633 23.0183825,38.4784 L23.1919823,38.6956 C24.5835807,40.4348 27.4897775,40.4348 28.8813759,38.6956 Z",
  top: "M0.966727388,15 C-0.203891291,13.78398 0.0164884602,12.21786 0.0164884602,8.30352 C0.0164884602,4.3892 0.0164884602,2.43204 1.18710714,1.21602 C2.35772582,0 4.24180369,0 8.00993944,0 L31.9903724,0 C35.7583681,0 37.642566,0 38.8131647,1.21602 C39.9837634,2.43204 39.9837634,4.3892 39.9837634,8.30352 C39.9837634,12.21786 40.2027631,13.78398 39.0321645,15"
} as const;

let invoiceIconPathsCache: { body: string; top: string } | null = null;

export const labels: Record<Lang, Record<string, string>> = {
  cs: {
    invoice: "FAKTURA",
    supplier: "DODAVATEL",
    customer: "ODBĚRATEL",
    variableSymbol: "Variabilní symbol",
    issueDate: "DATUM VYSTAVENÍ",
    dueDate: "DATUM SPLATNOSTI",
    account: "BANKOVNÍ ÚČET",
    paymentMethod: "ZPŮSOB PLATBY",
    paymentMethodValue: "převodem na účet",
    servicesIntro: "Fakturujeme vám následující služby:",
    totalWithoutVat: "Cena celkem\nbez DPH",
    note: "Poznámka",
    ico: "IČO",
    dic: "DIČ",
    noVat: "Neplátce DPH",
    routingNumber: "Routing number",
    swiftBic: "SWIFT/BIC",
    usdConversionAtIssue: "Přepočet při vystavení"
  },
  en: {
    invoice: "INVOICE",
    supplier: "SUPPLIER",
    customer: "CUSTOMER",
    variableSymbol: "Variable symbol",
    issueDate: "ISSUE DATE",
    dueDate: "DUE DATE",
    account: "BANK ACCOUNT",
    paymentMethod: "PAYMENT METHOD",
    paymentMethodValue: "Bank transfer",
    servicesIntro: "We invoice you for the following services:",
    totalWithoutVat: "Total amount\nwithout VAT",
    note: "Note",
    ico: "Company ID",
    dic: "Tax ID",
    noVat: "No VAT payer",
    routingNumber: "ROUTING NUMBER",
    swiftBic: "SWIFT/BIC",
    usdConversionAtIssue: "Converted at issue date"
  }
};

export function currency(value: number, code: string): string {
  if (code.trim().toUpperCase() === "USD") {
    const amount = new Intl.NumberFormat("cs-CZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
    return `$ ${amount}`;
  }

  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function usdConversionAtIssue(invoice: InvoiceForPdf): { totalCzk: number; rateCzk: number } | null {
  if (invoice.currency.trim().toUpperCase() !== "USD" || !invoice.fxRateCzk) {
    return null;
  }

  const rateCzk = toNumber(invoice.fxRateCzk);
  const totalCzk = invoice.totalCzkAtIssue
    ? toNumber(invoice.totalCzkAtIssue)
    : Number((toNumber(invoice.total) * rateCzk).toFixed(2));

  return { totalCzk, rateCzk };
}

export function formatFxRateCzkPerUsd(rateCzk: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(rateCzk);
}

export function formatPdfDate(value: Date): string {
  const [year, month, day] = formatDate(value).split("-");
  return `${day}. ${month}. ${year}`;
}

export function registerFonts(doc: PDFKit.PDFDocument): void {
  const regularFontSource = existsSync(regularFontPath) ? regularFontPath : "Helvetica";
  const extraBoldFontSource = existsSync(extraBoldFontPath) ? extraBoldFontPath : "Helvetica-Bold";

  doc.registerFont("AppRegular", regularFontSource);
  doc.registerFont("AppExtraBold", extraBoldFontSource);
}

function resolveInvoiceIconPaths(): { body: string; top: string } {
  if (invoiceIconPathsCache) {
    return invoiceIconPathsCache;
  }

  try {
    const svg = readFileSync(invoiceIconPath, "utf8");
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);

    if (paths.length >= 2) {
      invoiceIconPathsCache = {
        body: paths[0],
        top: paths[1]
      };
      return invoiceIconPathsCache;
    }
  } catch {
    // Use fallback icon path data when SVG is missing or malformed.
  }

  invoiceIconPathsCache = fallbackInvoiceIconPaths;
  return invoiceIconPathsCache;
}

export function drawInvoiceIcon(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size = 42,
  color: string = classicColors.indigo600,
  accentLine = true
): void {
  const iconPaths = resolveInvoiceIconPaths();
  const scale = size / 42;

  doc.save();
  doc.translate(x, y);
  doc.scale(scale, scale);
  doc.lineWidth(2).lineCap("round").lineJoin("round").strokeColor(color);
  doc.path(iconPaths.body).stroke();
  doc.path(iconPaths.top).stroke();
  if (accentLine) {
    doc.moveTo(20, 16).lineTo(14, 16).stroke();
    doc.moveTo(24, 24).lineTo(12, 24).stroke();
  }
  doc.restore();
}

export function drawRule(
  doc: PDFKit.PDFDocument,
  y: number,
  left = classicPage.left,
  right = classicPage.right,
  color: string = classicColors.indigo600,
  width = 2
): void {
  doc.save();
  doc.strokeColor(color).lineWidth(width).moveTo(left, y).lineTo(right, y).stroke();
  doc.restore();
}

export function formatBankAccountForSummary(account: BankAccount): string {
  if (account.accountType === "iban") {
    return account.iban ?? "-";
  }

  return account.bankCode ? `${account.accountNumber ?? "-"}/${account.bankCode}` : (account.accountNumber ?? "-");
}

function detailItemLine(item: InvoiceItem): string {
  return item.title;
}

export function servicesDescription(items: InvoiceItem[]): string {
  return items.map(detailItemLine).join(", ");
}

function normalizeCompact(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function normalizeDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

function ibanMod97(value: string): number {
  let remainder = 0;
  for (const char of value) {
    remainder = (remainder * 10 + Number(char)) % 97;
  }
  return remainder;
}

function toCzechIbanFromLocal(
  accountNumberRaw: string | null | undefined,
  bankCodeRaw: string | null | undefined
): string | null {
  const accountInput = normalizeCompact(accountNumberRaw);
  if (!accountInput) {
    return null;
  }

  let bankCode = normalizeDigits(bankCodeRaw);
  let accountCore = accountInput;

  if (!bankCode && accountInput.includes("/")) {
    const [left, right] = accountInput.split("/", 2);
    accountCore = left;
    bankCode = normalizeDigits(right);
  }

  if (!bankCode || bankCode.length > 4) {
    return null;
  }

  const [prefixRaw, accountRaw] = accountCore.includes("-") ? accountCore.split("-", 2) : ["", accountCore];

  let prefix = normalizeDigits(prefixRaw);
  let account = normalizeDigits(accountRaw);

  if (!prefix && account.length > 10) {
    const prefixLength = account.length - 10;
    if (prefixLength > 0 && prefixLength <= 6) {
      prefix = account.slice(0, prefixLength);
      account = account.slice(prefixLength);
    }
  }

  if (!account || prefix.length > 6 || account.length > 10) {
    return null;
  }

  const bban = `${bankCode.padStart(4, "0")}${prefix.padStart(6, "0")}${account.padStart(10, "0")}`;
  const checksumSource = `${bban}123500`;
  const checksum = String(98 - ibanMod97(checksumSource)).padStart(2, "0");
  return `CZ${checksum}${bban}`;
}

function resolveQrAccount(invoice: InvoiceForPdf): string | null {
  if (invoice.bankAccount.accountType === "iban") {
    const iban = normalizeCompact(invoice.bankAccount.iban).toUpperCase().replace(/\s+/g, "");
    return iban.length >= 15 && iban.length <= 34 ? iban : null;
  }

  return toCzechIbanFromLocal(invoice.bankAccount.accountNumber, invoice.bankAccount.bankCode);
}

export function buildCzkQrPayload(invoice: InvoiceForPdf): string | null {
  if (invoice.currency.trim().toUpperCase() !== "CZK") {
    return null;
  }

  const account = resolveQrAccount(invoice);
  const variableSymbol = normalizeDigits(invoice.variableSymbol);
  const amountValue = toNumber(invoice.total);

  if (!account || !variableSymbol || amountValue <= 0) {
    return null;
  }

  const amount = amountValue.toFixed(2);
  return `SPD*1.0*ACC:${account}*AM:${amount}*CC:CZK*X-VS:${variableSymbol}`;
}

export async function generateQrBuffer(payload: string): Promise<Buffer | null> {
  try {
    return await QRCode.toBuffer(payload, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512
    });
  } catch (error) {
    console.warn("QR code generation failed for invoice PDF", error);
    return null;
  }
}

export function localizedCountry(country: string, lang: Lang): string {
  if (lang !== "en") {
    return country;
  }

  const normalized = country.trim().toLowerCase();
  if (normalized === "česko" || normalized === "česká republika" || normalized === "czech republic") {
    return "Czechia";
  }

  return country;
}

export function collectPdfBytes(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
