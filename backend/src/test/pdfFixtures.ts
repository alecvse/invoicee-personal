import { Prisma, type Settings } from "@prisma/client";
import type { InvoiceForPdf } from "../services/pdf/shared.js";

export function pdfFixture(code = "CZK", count = 3): { invoice: InvoiceForPdf; settings: Settings } {
  const now = new Date("2026-10-01T00:00:00Z");
  const decimal = (value: number) => new Prisma.Decimal(value);
  const items = Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`, invoiceId: "sample", title: ["Návrh uživatelského rozhraní", "Příprava reklamních vizuálů pro kampaň", "Konzultace a předání podkladů"][index % 3] + (count > 3 ? ` ${index + 1}` : ""),
    quantity: decimal(index + 1), unit: "hod", unitPrice: decimal(1250.5), lineTotal: decimal((index + 1) * 1250.5)
  }));
  const total = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
  return {
    settings: {
      id: "singleton", supplierName: "Ukázkový dodavatel", supplierStreet: "Ulice 1", supplierCity: "Praha", supplierZip: "11000", supplierCountry: "Česká republika", supplierICO: "12345678", supplierEmail: null, supplierPhone: null, defaultDueDays: 3, invoiceNumberFormat: "YYYY-NN", pdfTemplate: "classic_rows", createdAt: now, updatedAt: now
    },
    invoice: {
      id: "sample", pdfTemplate: null, invoiceNumber: "2026-01", variableSymbol: "202601", status: "issued", issueDate: now, dueDate: new Date("2026-10-04T00:00:00Z"), currency: code, note: "Děkujeme za spolupráci.", fxRateCzk: code === "USD" ? decimal(23.45) : null, fxRateDate: code === "USD" ? now : null, totalCzkAtIssue: code === "USD" ? decimal(total * 23.45) : null, contactId: "client", bankAccountId: "bank", total: decimal(total), paidAt: null, emailSentAt: null, emailSentTo: null, emailMessageId: null, createdAt: now, updatedAt: now, items,
      contact: { id: "client", name: "Ukázkový odběratel", street: "Ulice 2", city: "Brno", zip: "60200", country: "Česká republika", ico: "87654321", dic: null, email: null, phone: null, createdAt: now, updatedAt: now },
      bankAccount: { id: "bank", label: "Účet", currency: code, accountType: "local", iban: null, bic: "TRWIUS35XXX", routingNumber: "084009519", accountNumber: "27-6226430297", bankCode: "0100", isDefault: true, createdAt: now, updatedAt: now }
    }
  };
}
