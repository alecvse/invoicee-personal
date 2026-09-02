import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { getCnbRateForDate } from "../services/cnbService.js";
import { roundCurrency, toNumber } from "../utils/decimal.js";

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(6));
}

async function run() {
  const invoices = await prisma.invoice.findMany({
    where: {
      currency: "USD",
      OR: [{ fxRateCzk: null }, { fxRateDate: null }, { totalCzkAtIssue: null }]
    },
    select: {
      id: true,
      issueDate: true,
      total: true
    }
  });

  let updated = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    try {
      const rate = await getCnbRateForDate("USD", invoice.issueDate);
      const totalCzk = roundCurrency(toNumber(invoice.total) * rate.rateCzk);
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          fxRateCzk: decimal(rate.rateCzk),
          fxRateDate: new Date(`${rate.rateDate}T00:00:00.000Z`),
          totalCzkAtIssue: decimal(totalCzk)
        }
      });
      updated += 1;
    } catch {
      skipped += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        total: invoices.length,
        updated,
        skipped
      },
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error("USD FX snapshot backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
