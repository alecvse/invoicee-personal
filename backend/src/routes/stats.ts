import { InvoiceStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../prisma.js";
import { getCnbRateForDate } from "../services/cnbService.js";
import { getCurrentMarketStats } from "../services/marketStatsService.js";
import { roundCurrency, toNumber } from "../utils/decimal.js";
import { yearBounds } from "../utils/date.js";
import { asyncHandler, fail } from "../utils/http.js";

export const statsRouter = Router();

statsRouter.get(
  "/current-market",
  asyncHandler(async (_req, res) => {
    const marketStats = await getCurrentMarketStats();
    res.json(marketStats);
  })
);

type CurrencySummary = {
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
};

type InvoiceRow = {
  id: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  status: "draft" | "issued" | "sent" | "paid";
  total: Prisma.Decimal;
  totalCzkAtIssue: Prisma.Decimal | null;
  contact: {
    name: string;
  };
  invoiceNumber: string | null;
};

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function invoiceStatusDisplay(invoice: Pick<InvoiceRow, "status" | "dueDate">): InvoiceStatus | "overdue" {
  if (invoice.status === "draft") {
    return "issued";
  }

  if (invoice.status === "paid") {
    return "paid";
  }

  if (invoice.dueDate.getTime() < startOfTodayUtc().getTime()) {
    return "overdue";
  }

  return invoice.status;
}

function summarizeByCurrency(currency: string, invoices: InvoiceRow[]): CurrencySummary {
  const filtered = invoices.filter((invoice) => normalizeCurrency(invoice.currency) === currency);
  const totalInvoiced = filtered.reduce((sum, invoice) => sum + toNumber(invoice.total), 0);
  const totalPaid = filtered
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + toNumber(invoice.total), 0);

  return {
    totalInvoiced: roundCurrency(totalInvoiced),
    totalPaid: roundCurrency(totalPaid),
    outstanding: roundCurrency(totalInvoiced - totalPaid),
    invoiceCount: filtered.length
  };
}

async function fetchLegacyUsdRateByIssueDate(invoices: InvoiceRow[]): Promise<Map<string, number>> {
  const usdRateByIssueDate = new Map<string, number>();
  const issueDateKeys = Array.from(new Set(invoices.map((invoice) => invoice.issueDate.toISOString().slice(0, 10))));

  await Promise.all(
    issueDateKeys.map(async (dateKey) => {
      try {
        const rate = await getCnbRateForDate("USD", new Date(`${dateKey}T00:00:00.000Z`));
        usdRateByIssueDate.set(dateKey, rate.rateCzk);
      } catch {
        // Legacy fallback lookup is best effort only.
      }
    })
  );

  return usdRateByIssueDate;
}

function convertedUsdInvoiceTotal(invoice: Pick<InvoiceRow, "currency" | "issueDate" | "total" | "totalCzkAtIssue">, rates: Map<string, number>): number | null {
  if (normalizeCurrency(invoice.currency) !== "USD") {
    return null;
  }

  if (invoice.totalCzkAtIssue) {
    return roundCurrency(toNumber(invoice.totalCzkAtIssue));
  }

  const rate = rates.get(invoice.issueDate.toISOString().slice(0, 10));
  if (!rate) {
    return null;
  }

  return roundCurrency(toNumber(invoice.total) * rate);
}

statsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year);
    if (!year || Number.isNaN(year)) {
      fail(400, "BAD_REQUEST", "Parametr 'year' je povinný.");
    }

    const { start, end } = yearBounds(year);
    const invoices = await prisma.invoice.findMany({
      where: {
        status: {
          not: "draft"
        },
        issueDate: {
          gte: start,
          lt: end
        }
      },
      include: {
        contact: true
      },
      orderBy: {
        issueDate: "desc"
      }
    });

    const invoiceRows = invoices as InvoiceRow[];

    const totalInvoiced = invoiceRows.reduce((sum, invoice) => sum + toNumber(invoice.total), 0);
    const totalPaid = invoiceRows
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + toNumber(invoice.total), 0);

    const usdInvoices = invoiceRows.filter((invoice) => normalizeCurrency(invoice.currency) === "USD");
    const legacyUsdInvoices = usdInvoices.filter((invoice) => !invoice.totalCzkAtIssue);
    const usdRateByIssueDate = await fetchLegacyUsdRateByIssueDate(legacyUsdInvoices);

    const usdSummary = summarizeByCurrency("USD", invoiceRows);

    const usdInvoicedCzk = usdInvoices.reduce((sum, invoice) => {
      const converted = convertedUsdInvoiceTotal(invoice, usdRateByIssueDate);
      return converted === null ? sum : sum + converted;
    }, 0);

    const usdPaidCzk = usdInvoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => {
        const converted = convertedUsdInvoiceTotal(invoice, usdRateByIssueDate);
        return converted === null ? sum : sum + converted;
      }, 0);

    const usdHasMissingConversions = usdInvoices.some(
      (invoice) => convertedUsdInvoiceTotal(invoice, usdRateByIssueDate) === null
    );

    const usdCzkConversion = usdHasMissingConversions
      ? null
      : {
          rateDate: null,
          rateCzk: null,
          totalInvoiced: roundCurrency(usdInvoicedCzk),
          totalPaid: roundCurrency(usdPaidCzk),
          outstanding: roundCurrency(usdInvoicedCzk - usdPaidCzk)
        };

    const czkInvoiced = invoiceRows
      .filter((invoice) => normalizeCurrency(invoice.currency) === "CZK")
      .reduce((sum, invoice) => sum + toNumber(invoice.total), 0);

    const totalInvoicedCombinedCzk = usdHasMissingConversions ? null : roundCurrency(czkInvoiced + usdInvoicedCzk);

    const currencyTotals = {
      CZK: summarizeByCurrency("CZK", invoiceRows),
      USD: {
        ...usdSummary,
        convertedToCzk: usdCzkConversion
      }
    };

    const monthlyCurrencyTotals = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const monthInvoices = invoiceRows.filter((invoice) => invoice.issueDate.getUTCMonth() + 1 === month);
      const czk = monthInvoices
        .filter((invoice) => normalizeCurrency(invoice.currency) === "CZK")
        .reduce((sum, invoice) => sum + toNumber(invoice.total), 0);
      const usd = monthInvoices
        .filter((invoice) => normalizeCurrency(invoice.currency) === "USD")
        .reduce((sum, invoice) => sum + toNumber(invoice.total), 0);

      const convertedValues = monthInvoices
        .filter((invoice) => normalizeCurrency(invoice.currency) === "USD")
        .map((invoice) => convertedUsdInvoiceTotal(invoice, usdRateByIssueDate));

      const hasMissingUsdRate = convertedValues.some((value) => value === null);
      const usdConvertedRaw = convertedValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);

      const usdConvertedCzk = hasMissingUsdRate ? null : roundCurrency(usdConvertedRaw);
      const totalConvertedCzk = hasMissingUsdRate ? null : roundCurrency(czk + usdConvertedRaw);

      return {
        month,
        czk: roundCurrency(czk),
        usd: roundCurrency(usd),
        usdConvertedCzk,
        totalConvertedCzk
      };
    });

    res.json({
      year,
      totalInvoiced: roundCurrency(totalInvoiced),
      totalPaid: roundCurrency(totalPaid),
      outstanding: roundCurrency(totalInvoiced - totalPaid),
      invoiceCount: invoices.length,
      totalInvoicedCombinedCzk,
      currencyTotals,
      lastInvoices: invoices.slice(0, 10).map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? "Koncept",
        customer: invoice.contact.name,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
        total: toNumber(invoice.total),
        convertedTotalCzk: convertedUsdInvoiceTotal(invoice as InvoiceRow, usdRateByIssueDate),
        currency: invoice.currency,
        status: invoice.status,
        statusDisplay: invoiceStatusDisplay(invoice as InvoiceRow)
      })),
      monthlyCurrencyTotals,
      monthlyTotals: monthlyCurrencyTotals.map((entry) => ({
        month: entry.month,
        total: entry.totalConvertedCzk ?? entry.czk
      }))
    });
  })
);
