import { prisma } from "../prisma.js";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "ico" TEXT,
    "dic" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "iban" TEXT,
    "bic" TEXT,
    "routingNumber" TEXT,
    "accountNumber" TEXT,
    "bankCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Invoice" (
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
    "emailSentAt" DATETIME,
    "emailSentTo" TEXT,
    "emailMessageId" TEXT,
    "contactId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "total" DECIMAL NOT NULL,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "supplierName" TEXT NOT NULL,
    "supplierStreet" TEXT NOT NULL,
    "supplierCity" TEXT NOT NULL,
    "supplierZip" TEXT NOT NULL,
    "supplierCountry" TEXT NOT NULL,
    "supplierICO" TEXT,
    "supplierEmail" TEXT,
    "supplierPhone" TEXT,
    "defaultDueDays" INTEGER NOT NULL DEFAULT 14,
    "invoiceNumberFormat" TEXT NOT NULL DEFAULT 'YYYY-NN',
    "pdfTemplate" TEXT NOT NULL DEFAULT 'classic',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
    "year" INTEGER NOT NULL PRIMARY KEY,
    "nextSeq" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ContactInvoiceTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL UNIQUE,
    "bankAccountId" TEXT,
    "currency" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ContactInvoiceTemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY ("templateId") REFERENCES "ContactInvoiceTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber")`,
  `CREATE INDEX IF NOT EXISTS "Invoice_issueDate_idx" ON "Invoice"("issueDate")`,
  `CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status")`,
  `CREATE INDEX IF NOT EXISTS "Invoice_contactId_idx" ON "Invoice"("contactId")`,
  `CREATE INDEX IF NOT EXISTS "ContactInvoiceTemplateItem_templateId_sortOrder_idx" ON "ContactInvoiceTemplateItem"("templateId", "sortOrder")`
];

export async function ensureDatabaseSchema(): Promise<void> {
  for (const statement of schemaStatements) {
    await prisma.$executeRawUnsafe(statement);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Settings" ADD COLUMN "pdfTemplate" TEXT NOT NULL DEFAULT 'classic'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate column name")) {
      throw error;
    }
  }

  for (const column of [
    `ALTER TABLE "Invoice" ADD COLUMN "emailSentAt" DATETIME`,
    `ALTER TABLE "Invoice" ADD COLUMN "emailSentTo" TEXT`,
    `ALTER TABLE "Invoice" ADD COLUMN "emailMessageId" TEXT`
  ]) {
    try {
      await prisma.$executeRawUnsafe(column);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("duplicate column name")) {
        throw error;
      }
    }
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "Invoice" SET "status" = 'sent' WHERE "emailSentAt" IS NOT NULL AND "status" = 'issued'`
  );
}
