import { Router } from "express";
import { prisma } from "../prisma.js";
import { getCnbRateForDate } from "../services/cnbService.js";
import { roundCurrency, toNumber } from "../utils/decimal.js";
import { yearBounds } from "../utils/date.js";
import { asyncHandler, fail } from "../utils/http.js";

export const reportsRouter = Router();

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function csvEscape(value: string): string {
  if (value.includes("\"") || value.includes(";") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

async function convertUsdTotalCzk(params: {
  currency: string;
  issueDate: Date;
  total: number;
  totalCzkAtIssue: number | null;
}): Promise<number | null> {
  if (normalizeCurrency(params.currency) !== "USD") {
    return null;
  }

  if (typeof params.totalCzkAtIssue === "number") {
    return roundCurrency(params.totalCzkAtIssue);
  }

  try {
    const rate = await getCnbRateForDate("USD", params.issueDate);
    return roundCurrency(params.total * rate.rateCzk);
  } catch {
    return null;
  }
}

reportsRouter.get(
  "/invoices.csv",
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year);
    if (!year || Number.isNaN(year)) {
      fail(400, "BAD_REQUEST", "Parametr 'year' je povinný.");
    }

    const monthQuery = req.query.month ? Number(req.query.month) : null;
    if (monthQuery !== null && (Number.isNaN(monthQuery) || monthQuery < 1 || monthQuery > 12)) {
      fail(400, "BAD_REQUEST", "Parametr 'month' musí být v rozsahu 1-12.");
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
        },
        ...(monthQuery
          ? {
              AND: [
                {
                  issueDate: {
                    gte: new Date(Date.UTC(year, monthQuery - 1, 1)),
                    lt: new Date(Date.UTC(year, monthQuery, 1))
                  }
                }
              ]
            }
          : {})
      },
      include: {
        contact: true
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
    });

    const rows = await Promise.all(
      invoices.map(async (invoice) => ({
        cisloFaktury: invoice.invoiceNumber ?? "Koncept",
        odberatel: invoice.contact.name,
        datumVystaveni: invoice.issueDate.toISOString().slice(0, 10),
        datumSplatnosti: invoice.dueDate.toISOString().slice(0, 10),
        stav: invoice.status,
        mena: invoice.currency,
        castka: toNumber(invoice.total),
        prepocetCzk: await convertUsdTotalCzk({
          currency: invoice.currency,
          issueDate: invoice.issueDate,
          total: toNumber(invoice.total),
          totalCzkAtIssue: invoice.totalCzkAtIssue ? toNumber(invoice.totalCzkAtIssue) : null
        }),
        variabilniSymbol: invoice.variableSymbol ?? ""
      }))
    );

    const header = [
      "Číslo faktury",
      "Odběratel",
      "Datum vystavení",
      "Datum splatnosti",
      "Stav",
      "Měna",
      "Částka",
      "Přepočet CZK",
      "Variabilní symbol"
    ];

    const lines = [
      header.join(";"),
      ...rows.map((row) =>
        [
          row.cisloFaktury,
          row.odberatel,
          row.datumVystaveni,
          row.datumSplatnosti,
          row.stav,
          row.mena,
          row.castka.toFixed(2),
          row.prepocetCzk !== null ? row.prepocetCzk.toFixed(2) : "",
          row.variabilniSymbol
        ]
          .map((value) => csvEscape(String(value)))
          .join(";")
      )
    ];

    const filename = monthQuery ? `report_faktury_${year}-${String(monthQuery).padStart(2, "0")}.csv` : `report_faktury_${year}.csv`;
    const csv = `\uFEFF${lines.join("\n")}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  })
);
