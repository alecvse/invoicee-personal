import PDFDocument from "pdfkit";
import type { Settings } from "@prisma/client";
import { toNumber } from "../../utils/decimal.js";
import {
  buildCzkQrPayload,
  classicColors,
  classicPage,
  collectPdfBytes,
  currency,
  drawInvoiceIcon,
  drawRule,
  formatBankAccountForSummary,
  formatFxRateCzkPerUsd,
  formatPdfDate,
  generateQrBuffer,
  labels,
  localizedCountry,
  registerFonts,
  sectionSpacing,
  servicesDescription,
  usdConversionAtIssue,
  type InvoiceForPdf,
  type Lang
} from "./shared.js";

function drawHeader(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  invoice: InvoiceForPdf;
}): number {
  const { doc, t, invoice } = params;
  const titleY = 44;
  const invoiceNumber = invoice.invoiceNumber ?? "Koncept";
  const variableSymbol = invoice.variableSymbol ?? "-";

  drawInvoiceIcon(doc, classicPage.right - 42, 38, 42);

  doc.font("AppExtraBold").fontSize(26).fillColor(classicColors.slate960);
  doc.text(t.invoice, classicPage.left, titleY, { lineBreak: false });
  const titleWidth = doc.widthOfString(t.invoice);
  doc.fillColor(classicColors.indigo600).text(invoiceNumber, classicPage.left + titleWidth + 10, titleY, { lineBreak: false });

  const variableLabel = `${t.variableSymbol}: `;
  const variableY = titleY + 34;
  doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960).text(variableLabel, classicPage.left, variableY, { lineBreak: false });
  const variableLabelWidth = doc.widthOfString(variableLabel);
  doc
    .font("AppExtraBold")
    .fillColor(classicColors.slate960)
    .text(variableSymbol, classicPage.left + variableLabelWidth, variableY, { lineBreak: false });

  const variableLineHeight = doc.currentLineHeight();
  const lineY = Math.round(variableY + variableLineHeight + sectionSpacing);
  drawRule(doc, lineY);
  return lineY;
}

function drawAddressColumns(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  settings: Settings;
  invoice: InvoiceForPdf;
  y: number;
  lang: Lang;
}): number {
  const { doc, t, settings, invoice, y, lang } = params;
  const colGap = 24;
  const colWidth = (classicPage.right - classicPage.left - colGap) / 2;
  const leftX = classicPage.left;
  const rightX = leftX + colWidth + colGap;
  const isEnglishUsd = lang === "en" && invoice.currency.trim().toUpperCase() === "USD";
  const hasCustomerIco = Boolean(invoice.contact.ico && invoice.contact.ico.trim().length > 0);
  const hasCustomerDic = Boolean(invoice.contact.dic && invoice.contact.dic.trim().length > 0);

  const headingY = y + sectionSpacing;
  const nameY = headingY + 24;
  const addressY = nameY + 22;
  const metaY = addressY + 66;

  doc.font("AppExtraBold").fontSize(13).fillColor(classicColors.slate960);
  doc.text(t.supplier, leftX, headingY, { width: colWidth, lineBreak: false });
  doc.text(t.customer, rightX, headingY, { width: colWidth, lineBreak: false });

  doc.font("AppExtraBold").fontSize(11).fillColor(classicColors.indigo600);
  doc.text(settings.supplierName, leftX, nameY, { width: colWidth });
  doc.text(invoice.contact.name, rightX, nameY, { width: colWidth });

  doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960);
  doc.text(settings.supplierStreet, leftX, addressY, { width: colWidth });
  doc.text(`${settings.supplierZip} ${settings.supplierCity}`, leftX, addressY + 17, { width: colWidth });
  doc.text(localizedCountry(settings.supplierCountry, lang), leftX, addressY + 34, { width: colWidth });

  doc.text(invoice.contact.street, rightX, addressY, { width: colWidth });
  doc.text(`${invoice.contact.zip} ${invoice.contact.city}`, rightX, addressY + 17, { width: colWidth });
  doc.text(localizedCountry(invoice.contact.country, lang), rightX, addressY + 34, { width: colWidth });

  doc.font("AppExtraBold").fontSize(11).fillColor(classicColors.slate960);
  doc.text(t.ico, leftX, metaY, { lineBreak: false });
  doc.font("AppRegular").text(t.noVat, leftX, metaY + 20, { lineBreak: false });

  doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960);
  doc.text(settings.supplierICO ?? "-", leftX + 100, metaY, { lineBreak: false });

  if (!isEnglishUsd || hasCustomerIco) {
    doc.font("AppExtraBold").fontSize(11).fillColor(classicColors.slate960).text(t.ico, rightX, metaY, { lineBreak: false });
    doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960).text(invoice.contact.ico ?? "-", rightX + 100, metaY, {
      lineBreak: false
    });
  }

  if (!isEnglishUsd || hasCustomerDic) {
    doc
      .font("AppExtraBold")
      .fontSize(11)
      .fillColor(classicColors.slate960)
      .text(t.dic, rightX, metaY + 20, { lineBreak: false });
    doc
      .font("AppRegular")
      .fontSize(11)
      .fillColor(classicColors.slate960)
      .text(invoice.contact.dic ?? "-", rightX + 100, metaY + 20, { lineBreak: false });
  }

  doc.font("AppRegular").fontSize(11);
  const metaLineHeight = doc.currentLineHeight();
  const sectionEndY = Math.round(metaY + 20 + metaLineHeight + sectionSpacing);
  drawRule(doc, sectionEndY);
  return sectionEndY;
}

function drawMetaGrid(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  invoice: InvoiceForPdf;
  y: number;
  lang: Lang;
}): number {
  const { doc, t, invoice, y, lang } = params;
  const colGap = 24;
  const colWidth = (classicPage.right - classicPage.left - colGap) / 2;
  const leftX = classicPage.left;
  const rightX = leftX + colWidth + colGap;
  const showUsdWireDetails = lang === "en" && invoice.currency.trim().toUpperCase() === "USD";

  const firstRowTitleY = y + sectionSpacing;
  const firstRowValueY = firstRowTitleY + 26;
  const secondRowTitleY = firstRowValueY + 34;
  const secondRowValueY = secondRowTitleY + 24;

  doc.font("AppExtraBold").fontSize(13).fillColor(classicColors.slate960);
  doc.text(t.issueDate, leftX, firstRowTitleY, { width: colWidth });
  doc.text(t.dueDate, rightX, firstRowTitleY, { width: colWidth });

  doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960);
  doc.text(formatPdfDate(invoice.issueDate), leftX, firstRowValueY, { width: colWidth });
  doc.text(formatPdfDate(invoice.dueDate), rightX, firstRowValueY, { width: colWidth });

  doc.font("AppExtraBold").fontSize(13).fillColor(classicColors.slate960);
  doc.text(t.account, leftX, secondRowTitleY, { width: colWidth });
  doc.text(t.paymentMethod, rightX, secondRowTitleY, { width: colWidth });

  doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960);
  doc.text(formatBankAccountForSummary(invoice.bankAccount), leftX, secondRowValueY, { width: colWidth });
  doc.text(t.paymentMethodValue, rightX, secondRowValueY, { width: colWidth });

  let lastValueY = secondRowValueY;
  if (showUsdWireDetails) {
    const thirdRowTitleY = secondRowValueY + 30;
    const thirdRowValueY = thirdRowTitleY + 24;

    doc.font("AppExtraBold").fontSize(13).fillColor(classicColors.slate960);
    doc.text(t.routingNumber, leftX, thirdRowTitleY, { width: colWidth });
    doc.text(t.swiftBic, rightX, thirdRowTitleY, { width: colWidth });

    doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960);
    doc.text(invoice.bankAccount.routingNumber ?? "-", leftX, thirdRowValueY, { width: colWidth });
    doc.text(invoice.bankAccount.bic ?? "-", rightX, thirdRowValueY, { width: colWidth });

    lastValueY = thirdRowValueY;
  }

  doc.font("AppRegular").fontSize(11);
  const valueLineHeight = doc.currentLineHeight();
  const sectionEndY = Math.round(lastValueY + valueLineHeight + sectionSpacing);
  drawRule(doc, sectionEndY);
  return sectionEndY;
}

function drawItemsAndTotal(params: {
  doc: PDFKit.PDFDocument;
  t: Record<string, string>;
  invoice: InvoiceForPdf;
  lang: Lang;
  startY: number;
  qrCodeBuffer?: Buffer | null;
  note?: string | null;
}): void {
  const { doc, t, invoice, lang, startY, qrCodeBuffer, note } = params;
  const sectionPadding = sectionSpacing;

  doc.font("AppExtraBold").fontSize(13).fillColor(classicColors.slate960).text(t.servicesIntro, classicPage.left, startY);

  const bodyY = startY + 30;
  const description = servicesDescription(invoice.items);
  doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960).text(description, classicPage.left, bodyY, {
    width: classicPage.right - classicPage.left,
    lineGap: -1
  });

  const bodyHeight = doc.heightOfString(description, { width: classicPage.right - classicPage.left });
  const itemsEndY = Math.round(bodyY + bodyHeight + sectionPadding);
  drawRule(doc, itemsEndY);

  const totalY = itemsEndY + sectionPadding;
  doc.font("AppRegular").fontSize(11).fillColor(classicColors.slate960).text(t.totalWithoutVat, classicPage.left, totalY, {
    width: 240,
    lineGap: 0
  });

  doc
    .font("AppExtraBold")
    .fontSize(28)
    .fillColor(classicColors.indigo600)
    .text(currency(toNumber(invoice.total), invoice.currency), classicPage.right - 260, totalY, {
      width: 260,
      align: "right",
      lineBreak: false
    });

  const usdConversion = lang === "en" ? usdConversionAtIssue(invoice) : null;
  if (usdConversion) {
    const conversionText = `${t.usdConversionAtIssue}: ${currency(usdConversion.totalCzk, "CZK")} (1 USD = ${formatFxRateCzkPerUsd(usdConversion.rateCzk)} CZK)`;
    doc
      .font("AppRegular")
      .fontSize(10)
      .fillColor(classicColors.slate960)
      .fillOpacity(0.74)
      .text(conversionText, classicPage.right - 320, totalY + 38, {
        width: 320,
        align: "right"
      });
    doc.fillOpacity(1);
  }

  let noteY = totalY + 74;
  if (qrCodeBuffer) {
    const qrSize = 86;
    const qrX = classicPage.left;
    const qrY = totalY + 48;
    doc.image(qrCodeBuffer, qrX, qrY, {
      fit: [qrSize, qrSize]
    });
    noteY = Math.max(noteY, qrY + qrSize + 16);
  }

  if (note) {
    doc
      .font("AppRegular")
      .fontSize(11)
      .fillColor(classicColors.slate960)
      .fillOpacity(0.74)
      .text(`${t.note}: ${note}`, classicPage.left, noteY, { width: classicPage.right - classicPage.left });
    doc.fillOpacity(1);
  }
}

function drawFooter(_doc: PDFKit.PDFDocument, _lang: Lang): void {
  // The public distribution must not contain supplier-specific legal text.
}

export async function renderClassicInvoicePdf(params: {
  invoice: InvoiceForPdf;
  settings: Settings;
  lang: Lang;
}): Promise<Buffer> {
  const { invoice, settings, lang } = params;
  const t = labels[lang];
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const done = collectPdfBytes(doc);

  registerFonts(doc);

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(classicColors.background);

  const sectionStartY = drawHeader({ doc, t, invoice });
  const metaStartY = drawAddressColumns({ doc, t, settings, invoice, y: sectionStartY, lang });
  const metaEndY = drawMetaGrid({ doc, t, invoice, y: metaStartY, lang });

  let qrCodeBuffer: Buffer | null = null;
  if (lang === "cs") {
    const qrPayload = buildCzkQrPayload(invoice);
    if (qrPayload) {
      qrCodeBuffer = await generateQrBuffer(qrPayload);
    }
  }

  drawItemsAndTotal({
    doc,
    t,
    invoice,
    lang,
    startY: metaEndY + sectionSpacing,
    qrCodeBuffer,
    note: invoice.note
  });
  drawFooter(doc, lang);

  doc.end();
  return done;
}
