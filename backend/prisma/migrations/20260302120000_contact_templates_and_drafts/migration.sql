PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Invoice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invoiceNumber" TEXT,
  "variableSymbol" TEXT,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "issueDate" DATETIME NOT NULL,
  "dueDate" DATETIME NOT NULL,
  "currency" TEXT NOT NULL,
  "note" TEXT,
  "fxRateCzk" DECIMAL,
  "fxRateDate" DATETIME,
  "totalCzkAtIssue" DECIMAL,
  "contactId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "total" DECIMAL NOT NULL,
  "paidAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Invoice_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Invoice" (
  "id",
  "invoiceNumber",
  "variableSymbol",
  "status",
  "issueDate",
  "dueDate",
  "currency",
  "note",
  "fxRateCzk",
  "fxRateDate",
  "totalCzkAtIssue",
  "contactId",
  "bankAccountId",
  "total",
  "paidAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "invoiceNumber",
  "variableSymbol",
  "status",
  "issueDate",
  "dueDate",
  "currency",
  "note",
  "fxRateCzk",
  "fxRateDate",
  "totalCzkAtIssue",
  "contactId",
  "bankAccountId",
  "total",
  "paidAt",
  "createdAt",
  "updatedAt"
FROM "Invoice";

DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_contactId_idx" ON "Invoice"("contactId");

CREATE TABLE "ContactInvoiceTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "bankAccountId" TEXT,
  "currency" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ContactInvoiceTemplate_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactInvoiceTemplate_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ContactInvoiceTemplate_contactId_key" ON "ContactInvoiceTemplate"("contactId");

CREATE TABLE "ContactInvoiceTemplateItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "quantity" DECIMAL NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPrice" DECIMAL NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ContactInvoiceTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContactInvoiceTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ContactInvoiceTemplateItem_templateId_sortOrder_idx" ON "ContactInvoiceTemplateItem"("templateId", "sortOrder");

PRAGMA foreign_keys=ON;
