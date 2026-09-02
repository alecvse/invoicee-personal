ALTER TABLE "Invoice" ADD COLUMN "fxRateCzk" DECIMAL;
ALTER TABLE "Invoice" ADD COLUMN "fxRateDate" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "totalCzkAtIssue" DECIMAL;

CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
  "year" INTEGER NOT NULL PRIMARY KEY,
  "nextSeq" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "InvoiceSequence" ("year", "nextSeq", "createdAt", "updatedAt")
SELECT
  CAST(substr("invoiceNumber", 1, 4) AS INTEGER) AS "year",
  MAX(CAST(substr("invoiceNumber", 6) AS INTEGER)) + 1 AS "nextSeq",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Invoice"
WHERE "invoiceNumber" LIKE '____-%'
GROUP BY substr("invoiceNumber", 1, 4)
ON CONFLICT("year") DO UPDATE SET
  "nextSeq" = excluded."nextSeq",
  "updatedAt" = CURRENT_TIMESTAMP;
