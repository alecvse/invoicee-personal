import PDFDocument from "pdfkit";
import type { Settings } from "@prisma/client";
import { toNumber } from "../../utils/decimal.js";
import {
  buildCzkQrPayload,
  collectPdfBytes,
  currency,
  formatFxRateCzkPerUsd,
  formatBankAccountForSummary,
  formatPdfDate,
  generateQrBuffer,
  labels,
  localizedCountry,
  mondrianColors,
  mondrianPage,
  registerFonts,
  servicesDescription,
  usdConversionAtIssue,
  type InvoiceForPdf,
  type Lang
} from "./shared.js";

const gridWidth = 3.4;
const sectionGap = 18;

function drawGridLine(doc: PDFKit.PDFDocument, x1: number, y1: number, x2: number, y2: number, width = gridWidth): void {
  doc.save();
  doc.strokeColor(mondrianColors.grid).lineWidth(width).moveTo(x1, y1).lineTo(x2, y2).stroke();
  doc.restore();
}

function fillBlock(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, color: string): void {
  doc.save();
  doc.fillColor(color).strokeColor(mondrianColors.grid).lineWidth(gridWidth).rect(x, y, width, height).fillAndStroke();
  doc.restore();
}

function textColorForFill(color: string): string {
  return color === mondrianColors.grid || color === mondrianColors.blue || color === mondrianColors.red
    ? mondrianColors.white
    : mondrianColors.ink;
}

function drawFrame(doc: PDFKit.PDFDocument): void {
  const left = mondrianPage.left;
  const top = mondrianPage.top;
  const width = mondrianPage.right - mondrianPage.left;
  const height = mondrianPage.bottom - mondrianPage.top;

  doc.save();
  doc.lineWidth(gridWidth).strokeColor(mondrianColors.grid).rect(left, top, width, height).stroke();
  doc.restore();
}

function drawHeader(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  invoice: InvoiceForPdf;
}): number {
  const { doc, t, invoice } = params;
  const left = mondrianPage.left;
  const right = mondrianPage.right;
  const top = mondrianPage.top;
  const bottom = 152;
  const xA = 96;
  const xB = 166;
  const xC = 304;
  const xD = 420;
  const xE = 488;
  const yA = 66;
  const yB = 102;
  const invoiceNumber = invoice.invoiceNumber ?? "Koncept";
  const variableSymbol = invoice.variableSymbol ?? "-";
  const titlePanelX = xB;
  const titlePanelY = yA;
  const titlePanelWidth = xE - xB;
  const titlePanelHeight = bottom - yA;

  fillBlock(doc, left, top, xA - left, yA - top, mondrianColors.yellow);
  fillBlock(doc, xA, top, xB - xA, yA - top, mondrianColors.grid);
  fillBlock(doc, xC, top, xD - xC, yA - top, mondrianColors.red);
  fillBlock(doc, xD, top, xE - xD, bottom - top, mondrianColors.blue);
  fillBlock(doc, xE, yA, right - xE, yB - yA, mondrianColors.yellow);
  fillBlock(doc, left, yB, 28, bottom - yB, mondrianColors.grid);
  fillBlock(doc, xB, yB, 34, bottom - yB, mondrianColors.red);
  fillBlock(doc, xC, yB, xD - xC, 22, mondrianColors.yellow);
  fillBlock(doc, xE, yB, right - xE, bottom - yB, mondrianColors.grid);
  fillBlock(doc, titlePanelX, titlePanelY, titlePanelWidth, titlePanelHeight, mondrianColors.white);

  drawGridLine(doc, left, yA, right, yA);
  drawGridLine(doc, left, yB, right, yB);
  drawGridLine(doc, xA, top, xA, yB);
  drawGridLine(doc, xB, top, xB, bottom);
  drawGridLine(doc, xC, top, xC, bottom);
  drawGridLine(doc, xD, top, xD, bottom);
  drawGridLine(doc, xE, top, xE, bottom);
  drawGridLine(doc, left, bottom, right, bottom);

  doc.font("AppExtraBold").fontSize(28).fillColor(mondrianColors.ink).text(t.invoice, titlePanelX + 18, 78, {
    lineBreak: false
  });
  const titleWidth = doc.widthOfString(t.invoice);
  const numberX = Math.min(titlePanelX + 18 + titleWidth + 14, titlePanelX + titlePanelWidth - 170);
  doc.font("AppExtraBold").fontSize(28).fillColor(mondrianColors.blue).text(invoiceNumber, numberX, 78, { lineBreak: false });

  const variableLabel = `${t.variableSymbol}: `;
  doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.slate).text(variableLabel, titlePanelX + 18, 116, {
    lineBreak: false
  });
  const variableWidth = doc.widthOfString(variableLabel);
  doc.font("AppExtraBold").fontSize(11).fillColor(mondrianColors.ink).text(variableSymbol, titlePanelX + 18 + variableWidth, 116, {
    lineBreak: false
  });
  return bottom;
}

function drawPartySection(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  settings: Settings;
  invoice: InvoiceForPdf;
  lang: Lang;
  startY: number;
}): number {
  const { doc, t, settings, invoice, lang, startY } = params;
  const left = mondrianPage.left;
  const right = mondrianPage.right;
  const bottom = 366;
  const splitX = 274;
  const isEnglishUsd = lang === "en" && invoice.currency.trim().toUpperCase() === "USD";
  const hasCustomerIco = Boolean(invoice.contact.ico && invoice.contact.ico.trim().length > 0);
  const hasCustomerDic = Boolean(invoice.contact.dic && invoice.contact.dic.trim().length > 0);

  fillBlock(doc, left, startY, 92, 38, mondrianColors.yellow);
  fillBlock(doc, 126, startY, 36, 38, mondrianColors.grid);
  fillBlock(doc, 162, startY, splitX - 162, 58, mondrianColors.red);
  fillBlock(doc, left, startY + 38, 28, bottom - startY - 38, mondrianColors.blue);

  fillBlock(doc, 394, startY, right - 394, 38, mondrianColors.red);
  fillBlock(doc, 274, startY, 58, 86, mondrianColors.yellow);
  fillBlock(doc, 480, startY + 38, right - 480, 92, mondrianColors.blue);
  fillBlock(doc, 274, bottom - 48, 112, 48, mondrianColors.grid);

  drawGridLine(doc, splitX, startY, splitX, bottom);
  drawGridLine(doc, left, bottom, right, bottom);

  doc.font("AppExtraBold").fontSize(13).fillColor(mondrianColors.ink).text(t.supplier, 74, startY + 54, {
    width: 168
  });
  doc.font("AppExtraBold").fontSize(14).fillColor(mondrianColors.blue).text(settings.supplierName, 74, startY + 82, {
    width: 168
  });
  doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.ink);
  doc.text(settings.supplierStreet, 74, startY + 112, { width: 168 });
  doc.text(`${settings.supplierZip} ${settings.supplierCity}`, 74, startY + 130, { width: 168 });
  doc.text(localizedCountry(settings.supplierCountry, lang), 74, startY + 148, { width: 168 });
  doc.font("AppExtraBold").fontSize(11).fillColor(mondrianColors.ink).text(t.ico, 74, startY + 196, { lineBreak: false });
  doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.ink).text(settings.supplierICO ?? "-", 144, startY + 196, {
    width: 98,
    lineBreak: false
  });
  doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.ink).text(t.noVat, 74, startY + 220, {
    width: 168
  });

  doc.font("AppExtraBold").fontSize(13).fillColor(mondrianColors.ink).text(t.customer, splitX + 38, startY + 54, {
    width: 214
  });
  doc.font("AppExtraBold").fontSize(14).fillColor(mondrianColors.red).text(invoice.contact.name, splitX + 38, startY + 82, {
    width: 214
  });
  doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.ink);
  doc.text(invoice.contact.street, splitX + 38, startY + 112, { width: 182 });
  doc.text(`${invoice.contact.zip} ${invoice.contact.city}`, splitX + 38, startY + 130, { width: 182 });
  doc.text(localizedCountry(invoice.contact.country, lang), splitX + 38, startY + 148, { width: 182 });

  let customerMetaY = startY + 196;
  if (!isEnglishUsd || hasCustomerIco) {
    doc.font("AppExtraBold").fontSize(11).fillColor(mondrianColors.ink).text(t.ico, splitX + 38, customerMetaY, {
      lineBreak: false
    });
    doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.ink).text(invoice.contact.ico ?? "-", splitX + 108, customerMetaY, {
      width: 112,
      lineBreak: false
    });
    customerMetaY += 24;
  }

  if (!isEnglishUsd || hasCustomerDic) {
    doc.font("AppExtraBold").fontSize(11).fillColor(mondrianColors.ink).text(t.dic, splitX + 38, customerMetaY, {
      lineBreak: false
    });
    doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.ink).text(invoice.contact.dic ?? "-", splitX + 108, customerMetaY, {
      width: 112,
      lineBreak: false
    });
  }

  return bottom;
}

function drawInfoTile(params: {
  doc: PDFKit.PDFDocument;
  x: number;
  y: number;
  width: number;
  label: string;
  primary: string;
  accent: string;
  secondaryLabel?: string;
  secondaryValue?: string | null;
}): void {
  const { doc, x, y, width, label, primary, accent, secondaryLabel, secondaryValue } = params;
  fillBlock(doc, x, y, width, 16, accent);
  doc.font("AppExtraBold").fontSize(11).fillColor(textColorForFill(accent)).text(label, x + 10, y + 2, {
    width: width - 20
  });
  doc.font("AppRegular").fontSize(12).fillColor(mondrianColors.ink).text(primary, x + 10, y + 32, {
    width: width - 20
  });

  if (secondaryLabel) {
    doc.font("AppExtraBold").fontSize(10).fillColor(mondrianColors.slate).text(secondaryLabel, x + 10, y + 60, {
      width: width - 20
    });
    doc.font("AppRegular").fontSize(11).fillColor(mondrianColors.ink).text(secondaryValue ?? "-", x + 10, y + 76, {
      width: width - 20
    });
  }
}

function drawMetaSection(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  invoice: InvoiceForPdf;
  lang: Lang;
  startY: number;
}): number {
  const { doc, t, invoice, lang, startY } = params;
  const left = mondrianPage.left;
  const right = mondrianPage.right;
  const top = startY;
  const bottom = 566;
  const x1 = 228;
  const x2 = 388;
  const y1 = 458;
  const showUsdWireDetails = lang === "en" && invoice.currency.trim().toUpperCase() === "USD";

  fillBlock(doc, left, top, 26, y1 - top, mondrianColors.red);
  fillBlock(doc, x1, top, x2 - x1, 24, mondrianColors.blue);
  fillBlock(doc, x2, top, right - x2, 44, mondrianColors.yellow);
  fillBlock(doc, left, y1, 82, bottom - y1, mondrianColors.grid);
  fillBlock(doc, 82, y1, x2 - 82, 24, mondrianColors.yellow);
  fillBlock(doc, x2, y1 + 32, right - x2, 52, mondrianColors.red);

  drawGridLine(doc, left, top, right, top);
  drawGridLine(doc, left, y1, right, y1);
  drawGridLine(doc, left, bottom, right, bottom);
  drawGridLine(doc, x1, top, x1, y1);
  drawGridLine(doc, x2, top, x2, bottom);

  drawInfoTile({
    doc,
    x: 58,
    y: top + 22,
    width: x1 - 58,
    label: t.issueDate,
    primary: formatPdfDate(invoice.issueDate),
    accent: mondrianColors.yellow
  });
  drawInfoTile({
    doc,
    x: x1 + 18,
    y: top + 22,
    width: x2 - x1 - 18,
    label: t.dueDate,
    primary: formatPdfDate(invoice.dueDate),
    accent: mondrianColors.red
  });
  drawInfoTile({
    doc,
    x: x2 + 18,
    y: top + 22,
    width: right - x2 - 18,
    label: t.variableSymbol,
    primary: invoice.variableSymbol ?? "-",
    accent: mondrianColors.blue
  });

  drawInfoTile({
    doc,
    x: 106,
    y: y1 + 20,
    width: x2 - 106,
    label: t.account,
    primary: formatBankAccountForSummary(invoice.bankAccount),
    accent: mondrianColors.blue,
    secondaryLabel: showUsdWireDetails ? t.routingNumber : undefined,
    secondaryValue: showUsdWireDetails ? (invoice.bankAccount.routingNumber ?? "-") : undefined
  });
  drawInfoTile({
    doc,
    x: x2 + 18,
    y: y1 + 20,
    width: right - x2 - 18,
    label: t.paymentMethod,
    primary: t.paymentMethodValue,
    accent: mondrianColors.yellow,
    secondaryLabel: showUsdWireDetails ? t.swiftBic : undefined,
    secondaryValue: showUsdWireDetails ? (invoice.bankAccount.bic ?? "-") : undefined
  });

  return bottom;
}

function drawServicesSection(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  invoice: InvoiceForPdf;
  startY: number;
}): { endY: number } {
  const { doc, t, invoice, startY } = params;
  const left = mondrianPage.left;
  const right = mondrianPage.right;
  const top = startY + sectionGap;
  const textX = 134;
  const textWidth = 282;

  const description = servicesDescription(invoice.items);
  doc.font("AppRegular").fontSize(12);
  const bodyHeight = doc.heightOfString(description, {
    width: textWidth,
    lineGap: 1
  });
  const noteHeight = invoice.note
    ? doc.heightOfString(`${t.note}: ${invoice.note}`, { width: textWidth, lineGap: 1 }) + 18
    : 0;
  const blockHeight = Math.max(142, 58 + bodyHeight + noteHeight + 24);
  const bottom = top + blockHeight;

  fillBlock(doc, left, top, 34, blockHeight, mondrianColors.blue);
  fillBlock(doc, left + 34, top, 54, 34, mondrianColors.yellow);
  fillBlock(doc, left + 34, top + 42, 54, 64, mondrianColors.red);
  fillBlock(doc, right - 130, top, 64, 64, mondrianColors.grid);
  fillBlock(doc, right - 66, top, 66, 24, mondrianColors.yellow);
  fillBlock(doc, right - 66, top + 24, 66, 82, mondrianColors.blue);
  fillBlock(doc, right - 130, bottom - 58, 130, 58, mondrianColors.red);

  drawGridLine(doc, left, top, right, top);
  drawGridLine(doc, left, bottom, right, bottom);
  drawGridLine(doc, 122, top, 122, bottom);
  drawGridLine(doc, right - 142, top, right - 142, bottom);

  doc.font("AppExtraBold").fontSize(14).fillColor(mondrianColors.ink).text(t.servicesIntro, textX, top + 4, {
    width: textWidth
  });
  doc.font("AppRegular").fontSize(12).fillColor(mondrianColors.ink).text(description, textX, top + 36, {
    width: textWidth,
    lineGap: 1
  });

  if (invoice.note) {
    doc.font("AppRegular").fontSize(10).fillColor(mondrianColors.slate).text(`${t.note}: ${invoice.note}`, textX, top + 44 + bodyHeight, {
      width: textWidth,
      lineGap: 1
    });
  }

  return { endY: bottom };
}

function drawSettlementSection(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  invoice: InvoiceForPdf;
  lang: Lang;
  startY: number;
  qrCodeBuffer: Buffer | null;
}): void {
  const { doc, t, invoice, lang, startY, qrCodeBuffer } = params;
  const left = mondrianPage.left;
  const right = mondrianPage.right;
  const top = Math.max(startY + sectionGap, 688);
  const bottom = 790;
  const splitX = 214;
  const amountX = 282;

  fillBlock(doc, splitX, top, 52, 52, mondrianColors.grid);
  fillBlock(doc, splitX + 52, top, 138, 52, mondrianColors.red);
  fillBlock(doc, splitX, top + 52, 52, 86, mondrianColors.blue);
  fillBlock(doc, amountX + 118, top + 52, right - amountX - 118, 34, mondrianColors.yellow);
  fillBlock(doc, amountX + 212, top + 86, right - amountX - 212, 52, mondrianColors.red);
  fillBlock(doc, left, top + 64, 54, 46, mondrianColors.grid);

  drawGridLine(doc, left, top, right, top);
  drawGridLine(doc, splitX, top, splitX, bottom);
  drawGridLine(doc, right, top, right, bottom);

  if (lang === "cs" && qrCodeBuffer) {
    fillBlock(doc, left, top, 150, 138, mondrianColors.white);
    doc.font("AppExtraBold").fontSize(12).fillColor(mondrianColors.ink).text("QR PLATBA", left + 16, top + 12, {
      width: 118
    });
    doc.image(qrCodeBuffer, left + 24, top + 32, {
      fit: [100, 100]
    });
  } else {
    fillBlock(doc, left, top, 74, 30, mondrianColors.yellow);
    fillBlock(doc, left + 74, top, 36, 30, mondrianColors.grid);
    fillBlock(doc, left + 110, top, 86, 30, mondrianColors.blue);
    fillBlock(doc, left + 110, top + 38, 86, 58, mondrianColors.red);
  }

  fillBlock(doc, amountX, top + 8, 120, 46, mondrianColors.white);
  doc.font("AppRegular").fontSize(12).fillColor(mondrianColors.slate).text(t.totalWithoutVat, amountX + 10, top + 18, {
    width: right - amountX - 20,
    lineGap: 0
  });
  fillBlock(doc, amountX + 130, top + 54, right - amountX - 130, 92, mondrianColors.white);
  doc.font("AppExtraBold").fontSize(33).fillColor(mondrianColors.blue).text(currency(toNumber(invoice.total), invoice.currency), amountX + 8, top + 74, {
    width: right - amountX - 16,
    align: "right"
  });

  const usdConversion = lang === "en" ? usdConversionAtIssue(invoice) : null;
  if (usdConversion) {
    const conversionText = `${t.usdConversionAtIssue}: ${currency(usdConversion.totalCzk, "CZK")} (1 USD = ${formatFxRateCzkPerUsd(usdConversion.rateCzk)} CZK)`;
    doc
      .font("AppRegular")
      .fontSize(9.5)
      .fillColor(mondrianColors.slate)
      .text(conversionText, amountX + 8, top + 124, {
        width: right - amountX - 16,
        align: "right"
      });
  }
}

function drawFooter(_doc: PDFKit.PDFDocument, _lang: Lang): void {
  // The public distribution must not contain supplier-specific legal text.
}

export async function renderMondrianInvoicePdf(params: {
  invoice: InvoiceForPdf;
  settings: Settings;
  lang: Lang;
}): Promise<Buffer> {
  const { invoice, settings, lang } = params;
  const t = labels[lang];
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const done = collectPdfBytes(doc);

  registerFonts(doc);
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(mondrianColors.white);
  drawFrame(doc);

  const headerBottom = drawHeader({ doc, t, invoice });
  const partyBottom = drawPartySection({ doc, t, settings, invoice, lang, startY: headerBottom });
  const metaBottom = drawMetaSection({ doc, t, invoice, lang, startY: partyBottom });
  const services = drawServicesSection({ doc, t, invoice, startY: metaBottom });

  let qrCodeBuffer: Buffer | null = null;
  if (lang === "cs") {
    const qrPayload = buildCzkQrPayload(invoice);
    if (qrPayload) {
      qrCodeBuffer = await generateQrBuffer(qrPayload);
    }
  }

  drawSettlementSection({
    doc,
    t,
    invoice,
    lang,
    startY: services.endY,
    qrCodeBuffer
  });
  drawFooter(doc, lang);

  doc.end();
  return done;
}
