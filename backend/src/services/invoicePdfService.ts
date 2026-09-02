import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { getCnbRateForDate } from "./cnbService.js";
import { generateInvoicePdf } from "./pdfService.js";
import { ensureSettings } from "./settingsService.js";
import { decimalFromNumber, normalizeCurrency } from "../utils/invoicePdf.js";
import { roundCurrency, toNumber } from "../utils/decimal.js";
import { fail } from "../utils/http.js";

export const invoiceInclude = {
  contact: true,
  bankAccount: true,
  items: true
} satisfies Prisma.InvoiceInclude;

export async function prepareInvoicePdf(id: string, lang: "cs" | "en") {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: invoiceInclude
  });

  if (!invoice) {
    fail(404, "NOT_FOUND", "Faktura nebyla nalezena.");
  }

  if (invoice.status === "draft" || !invoice.invoiceNumber) {
    fail(409, "CONFLICT", "PDF lze stáhnout až po vystavení faktury.");
  }

  let effectiveInvoice = invoice;
  if (lang === "en" && normalizeCurrency(invoice.currency) === "USD" && (!invoice.fxRateCzk || !invoice.totalCzkAtIssue)) {
    try {
      const rate = await getCnbRateForDate("USD", invoice.issueDate);
      const totalCzk = roundCurrency(toNumber(invoice.total) * rate.rateCzk);
      effectiveInvoice = {
        ...invoice,
        fxRateCzk: decimalFromNumber(rate.rateCzk),
        fxRateDate: new Date(`${rate.rateDate}T00:00:00.000Z`),
        totalCzkAtIssue: decimalFromNumber(totalCzk)
      };
    } catch {
      // Keep original invoice data if CNB fallback is temporarily unavailable.
    }
  }

  const settings = await ensureSettings();
  const generated = await generateInvoicePdf({ invoice: effectiveInvoice, settings, lang });
  return { invoice, generated };
}
