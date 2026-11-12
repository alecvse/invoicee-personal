import { InvoiceStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../prisma.js";
import { getCnbRateForDate } from "../services/cnbService.js";
import { prepareInvoicePdf, invoiceInclude } from "../services/invoicePdfService.js";
import { sendInvoiceEmail, assertSafeHeaderValue } from "../services/gmailService.js";
import { invoiceTotalFromItems, lineTotal, serializeInvoice } from "../services/serializers.js";
import { parseISODate, yearBounds } from "../utils/date.js";
import { roundCurrency, toNumber } from "../utils/decimal.js";
import { generateInvoiceNumber, variableSymbolFromInvoiceNumber } from "../utils/invoice.js";
import { decimalFromNumber, normalizeCurrency } from "../utils/invoicePdf.js";
import { asyncHandler, fail, singleValue } from "../utils/http.js";
import { createInvoiceSchema, sendEmailSchema, updateInvoiceSchema } from "../validation.js";

export const invoicesRouter = Router();

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function resolveUsdSnapshot(params: {
  currency: string;
  issueDate: Date;
  total: number;
}): Promise<{ fxRateCzk: Prisma.Decimal; fxRateDate: Date; totalCzkAtIssue: Prisma.Decimal } | null> {
  if (normalizeCurrency(params.currency) !== "USD") {
    return null;
  }

  try {
    const rate = await getCnbRateForDate("USD", params.issueDate);
    const totalCzk = roundCurrency(params.total * rate.rateCzk);
    return {
      fxRateCzk: decimalFromNumber(rate.rateCzk),
      fxRateDate: new Date(`${rate.rateDate}T00:00:00.000Z`),
      totalCzkAtIssue: decimalFromNumber(totalCzk)
    };
  } catch {
    fail(502, "UPSTREAM_UNAVAILABLE", "Nelze načíst kurz ČNB, zkuste to prosím později.");
  }
}

async function fetchLegacyUsdRateByIssueDate(invoices: Array<{ issueDate: Date }>): Promise<Map<string, number>> {
  const usdRateByIssueDate = new Map<string, number>();
  const issueDateKeys = Array.from(new Set(invoices.map((invoice) => invoice.issueDate.toISOString().slice(0, 10))));

  await Promise.all(
    issueDateKeys.map(async (dateKey) => {
      try {
        const rate = await getCnbRateForDate("USD", new Date(`${dateKey}T00:00:00.000Z`));
        usdRateByIssueDate.set(dateKey, rate.rateCzk);
      } catch {
        // Legacy fallback is best effort only.
      }
    })
  );

  return usdRateByIssueDate;
}

function convertedTotalCzk(invoice: {
  currency: string;
  issueDate: Date;
  total: Prisma.Decimal;
  totalCzkAtIssue: Prisma.Decimal | null;
}, rateByIssueDate: Map<string, number>): number | null {
  if (normalizeCurrency(invoice.currency) !== "USD") {
    return null;
  }

  if (invoice.totalCzkAtIssue) {
    return roundCurrency(toNumber(invoice.totalCzkAtIssue));
  }

  const dateKey = invoice.issueDate.toISOString().slice(0, 10);
  const rate = rateByIssueDate.get(dateKey);
  return rate ? roundCurrency(toNumber(invoice.total) * rate) : null;
}

function invoiceDerivedStatus(status: InvoiceStatus, dueDate: Date): InvoiceStatus | "overdue" {
  if (status === "draft") {
    return "draft";
  }

  if (status === "paid") {
    return "paid";
  }

  if (dueDate.getTime() < startOfTodayUtc().getTime()) {
    return "overdue";
  }

  return status;
}

function createInvoiceItems(items: Array<{ title: string; quantity: number; unit: string; unitPrice: number }>) {
  return items.map((item) => ({
    title: item.title,
    quantity: new Prisma.Decimal(item.quantity.toFixed(2)),
    unit: item.unit,
    unitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2)),
    lineTotal: lineTotal(item.quantity, item.unitPrice)
  }));
}

invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const yearParam = singleValue(req.query.year);
    const year = yearParam ? Number(yearParam) : undefined;
    const statusParam = singleValue(req.query.status);
    const contactId = singleValue(req.query.contactId);
    const search = singleValue(req.query.search)?.trim();

    const filters: Prisma.InvoiceWhereInput[] = [];

    if (year && !Number.isNaN(year)) {
      const { start, end } = yearBounds(year);
      filters.push({
        issueDate: {
          gte: start,
          lt: end
        }
      });
    }

    if (statusParam === "overdue") {
      filters.push({
        status: { in: ["issued", "sent"] },
        dueDate: {
          lt: startOfTodayUtc()
        }
      });
    } else if (statusParam && ["draft", "issued", "sent", "paid"].includes(statusParam)) {
      filters.push({ status: statusParam as InvoiceStatus });
    }

    if (contactId) {
      filters.push({ contactId });
    }

    if (search) {
      filters.push({
        OR: [
          { invoiceNumber: { contains: search } },
          { contact: { name: { contains: search } } }
        ]
      });
    }

    const invoices = await prisma.invoice.findMany({
      where: filters.length > 0 ? { AND: filters } : {},
      include: invoiceInclude,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
    });

    const legacyUsdInvoices = invoices.filter(
      (invoice) => normalizeCurrency(invoice.currency) === "USD" && !invoice.totalCzkAtIssue
    );
    const usdRateByIssueDate = await fetchLegacyUsdRateByIssueDate(legacyUsdInvoices);

    res.json(
      invoices.map((invoice) => {
        const serialized = serializeInvoice(invoice);
        return {
          ...serialized,
          statusDisplay: invoiceDerivedStatus(invoice.status, invoice.dueDate),
          convertedTotalCzk: convertedTotalCzk(invoice, usdRateByIssueDate)
        };
      })
    );
  })
);

invoicesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createInvoiceSchema.parse(req.body);
    const issueDate = parseISODate(data.issueDate);
    const dueDate = parseISODate(data.dueDate);

    if (dueDate < issueDate) {
      fail(400, "BAD_REQUEST", "Datum splatnosti nesmí být dříve než datum vystavení.");
    }

    const contact = await prisma.contact.findUnique({ where: { id: data.contactId } });
    if (!contact) {
      fail(400, "BAD_REQUEST", "Kontakt neexistuje.");
    }

    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: data.bankAccountId } });
    if (!bankAccount) {
      fail(400, "BAD_REQUEST", "Bankovní účet neexistuje.");
    }

    const invoiceCurrency = (data.currency || bankAccount.currency).trim().toUpperCase();
    const desiredStatus = data.status ?? "issued";
    const total = invoiceTotalFromItems(data.items);
    const usdSnapshot = await resolveUsdSnapshot({
      currency: invoiceCurrency,
      issueDate,
      total: toNumber(total)
    });

    const created = await prisma.$transaction(async (tx) => {
      const invoiceNumber = desiredStatus === "issued" ? await generateInvoiceNumber(tx, issueDate) : null;
      const variableSymbol = invoiceNumber ? variableSymbolFromInvoiceNumber(invoiceNumber) : null;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          variableSymbol,
          status: desiredStatus,
          issueDate,
          dueDate,
          currency: invoiceCurrency,
          note: data.note ?? null,
          pdfTemplate: data.pdfTemplate,
          total,
          contactId: data.contactId,
          bankAccountId: data.bankAccountId,
          fxRateCzk: usdSnapshot?.fxRateCzk ?? null,
          fxRateDate: usdSnapshot?.fxRateDate ?? null,
          totalCzkAtIssue: usdSnapshot?.totalCzkAtIssue ?? null,
          items: { create: createInvoiceItems(data.items) }
        },
        include: invoiceInclude
      });

      return invoice;
    });

    res.status(201).json(serializeInvoice(created));
  })
);

invoicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude
    });

    if (!invoice) {
      fail(404, "NOT_FOUND", "Faktura nebyla nalezena.");
    }

    res.json({
      ...serializeInvoice(invoice),
      statusDisplay: invoiceDerivedStatus(invoice.status, invoice.dueDate)
    });
  })
);

invoicesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    const data = updateInvoiceSchema.parse(req.body);
    const issueDate = parseISODate(data.issueDate);
    const dueDate = parseISODate(data.dueDate);

    if (dueDate < issueDate) {
      fail(400, "BAD_REQUEST", "Datum splatnosti nesmí být dříve než datum vystavení.");
    }

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      fail(404, "NOT_FOUND", "Faktura nebyla nalezena.");
    }

    const contact = await prisma.contact.findUnique({ where: { id: data.contactId } });
    if (!contact) {
      fail(400, "BAD_REQUEST", "Kontakt neexistuje.");
    }

    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: data.bankAccountId } });
    if (!bankAccount) {
      fail(400, "BAD_REQUEST", "Bankovní účet neexistuje.");
    }

    const invoiceCurrency = (data.currency || bankAccount.currency).trim().toUpperCase();
    const total = invoiceTotalFromItems(data.items);
    const requestedStatus = data.status ?? existing.status;

    if (existing.status !== "draft" && requestedStatus === "draft") {
      fail(409, "CONFLICT", "Již vystavenou fakturu nelze vrátit zpět do konceptu.");
    }

    const nextStatus =
      existing.status === "paid" || existing.status === "sent" ? existing.status : requestedStatus;
    const usdSnapshot = await resolveUsdSnapshot({
      currency: invoiceCurrency,
      issueDate,
      total: toNumber(total)
    });

    const updated = await prisma.$transaction(async (tx) => {
      const invoiceNumber =
        existing.invoiceNumber ?? (nextStatus !== "draft" ? await generateInvoiceNumber(tx, issueDate) : null);
      const variableSymbol = invoiceNumber ? variableSymbolFromInvoiceNumber(invoiceNumber) : null;

      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber,
          variableSymbol,
          status: nextStatus,
          issueDate,
          dueDate,
          contactId: data.contactId,
          bankAccountId: data.bankAccountId,
          currency: invoiceCurrency,
          note: data.note ?? null,
          pdfTemplate: data.pdfTemplate,
          total,
          fxRateCzk: usdSnapshot?.fxRateCzk ?? null,
          fxRateDate: usdSnapshot?.fxRateDate ?? null,
          totalCzkAtIssue: usdSnapshot?.totalCzkAtIssue ?? null,
          items: { create: createInvoiceItems(data.items) }
        },
        include: invoiceInclude
      });

      return invoice;
    });

    res.json(serializeInvoice(updated));
  })
);

invoicesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    await prisma.invoice.delete({ where: { id } });
    res.status(204).send();
  })
);

invoicesRouter.post(
  "/:id/duplicate",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude
    });

    if (!existing) {
      fail(404, "NOT_FOUND", "Faktura nebyla nalezena.");
    }

    const duplicatedIssueDate = startOfTodayUtc();
    const duplicatedDueDate = addDaysUtc(duplicatedIssueDate, 3);

    const duplicated = await prisma.invoice.create({
      data: {
        invoiceNumber: null,
        variableSymbol: null,
        status: "draft",
        issueDate: duplicatedIssueDate,
        dueDate: duplicatedDueDate,
        currency: existing.currency,
        pdfTemplate: existing.pdfTemplate,
        note: existing.note,
        total: existing.total,
        fxRateCzk: existing.fxRateCzk,
        fxRateDate: existing.fxRateDate,
        totalCzkAtIssue: existing.totalCzkAtIssue,
        contactId: existing.contactId,
        bankAccountId: existing.bankAccountId,
        items: {
          create: existing.items.map((item) => ({
            title: item.title,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal
          }))
        }
      },
      include: invoiceInclude
    });

    res.status(201).json(serializeInvoice(duplicated));
  })
);

invoicesRouter.patch(
  "/:id/mark-paid",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    const body = req.body as { paid?: boolean };
    const paid = Boolean(body.paid);

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { status: true, emailSentAt: true }
    });

    if (!existing) {
      fail(404, "NOT_FOUND", "Faktura nebyla nalezena.");
    }

    if (existing.status === "draft") {
      fail(409, "CONFLICT", "Koncept faktury nelze označit jako uhrazený.");
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: paid ? "paid" : existing.emailSentAt ? "sent" : "issued",
        paidAt: paid ? new Date() : null
      },
      include: invoiceInclude
    });

    res.json(serializeInvoice(invoice));
  })
);

invoicesRouter.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    const lang = singleValue(req.query.lang) === "en" ? "en" : "cs";
    const { generated } = await prepareInvoicePdf(id, lang);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${generated.filename}\"`);
    res.send(generated.bytes);
  })
);

invoicesRouter.post(
  "/:id/send-email",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    const data = sendEmailSchema.parse(req.body);
    const recipients = [data.to, data.additionalTo].filter((email): email is string => Boolean(email));
    const recipientsValue = recipients.join(", ");
    recipients.forEach((email) => assertSafeHeaderValue(email, "Příjemce"));
    assertSafeHeaderValue(data.subject, "Předmět");
    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { status: true, dueDate: true }
    });
    if (!existing) {
      fail(404, "NOT_FOUND", "Faktura nebyla nalezena.");
    }

    const nextStatus = existing.status === "paid" ? "paid" : "sent";
    const { generated } = await prepareInvoicePdf(id, data.lang);
    const sent = await sendInvoiceEmail({
      to: recipientsValue,
      subject: data.subject,
      body: data.body,
      filename: generated.filename,
      pdfBytes: generated.bytes
    });
    const sentAt = new Date();

    try {
      await prisma.invoice.update({
        where: { id },
        data: {
          status: nextStatus,
          emailSentAt: sentAt,
          emailSentTo: recipientsValue,
          emailMessageId: sent.messageId
        }
      });
    } catch (error) {
      console.error("Gmail zpráva byla odeslána, ale metadata faktury se nepodařilo uložit", {
        invoiceId: id,
        messageId: sent.messageId,
        error
      });
      fail(
        500,
        "EMAIL_METADATA_SAVE_FAILED",
        "Zpráva mohla být odeslána. Před opakováním zkontrolujte složku Odeslané v Gmailu."
      );
    }

    res.json({
      sentAt: sentAt.toISOString(),
      to: recipientsValue,
      messageId: sent.messageId,
      status: nextStatus,
      statusDisplay: invoiceDerivedStatus(nextStatus, existing.dueDate)
    });
  })
);

invoicesRouter.get(
  "/:id/exchange-rate-czk",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID faktury.");
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        currency: true,
        issueDate: true,
        total: true,
        fxRateCzk: true,
        fxRateDate: true,
        totalCzkAtIssue: true
      }
    });

    if (!invoice) {
      fail(404, "NOT_FOUND", "Faktura nebyla nalezena.");
    }

    if (normalizeCurrency(invoice.currency) !== "USD") {
      fail(400, "BAD_REQUEST", "Přepočet na Kč je dostupný pouze pro měnu USD.");
    }

    if (invoice.fxRateCzk && invoice.fxRateDate && invoice.totalCzkAtIssue) {
      res.json({
        currency: "USD",
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        rateDate: invoice.fxRateDate.toISOString().slice(0, 10),
        rateCzk: toNumber(invoice.fxRateCzk),
        totalOriginal: toNumber(invoice.total),
        totalCzk: toNumber(invoice.totalCzkAtIssue)
      });
      return;
    }

    try {
      const rate = await getCnbRateForDate("USD", invoice.issueDate);
      const totalOriginal = toNumber(invoice.total);
      const totalCzk = roundCurrency(totalOriginal * rate.rateCzk);

      res.json({
        currency: "USD",
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        rateDate: rate.rateDate,
        rateCzk: rate.rateCzk,
        totalOriginal,
        totalCzk
      });
    } catch {
      fail(502, "UPSTREAM_UNAVAILABLE", "Nelze načíst kurz ČNB, zkuste to prosím později.");
    }
  })
);
