import { Prisma, type BankAccount, type Contact, type Invoice, type InvoiceItem, type Settings } from "@prisma/client";
import { toNumber } from "../utils/decimal.js";
import { formatDate } from "../utils/date.js";

type InvoiceWithRelations = Invoice & {
  items: InvoiceItem[];
  contact: Contact;
  bankAccount: BankAccount;
};

export function serializeContact(contact: Contact) {
  return contact;
}

export function serializeBankAccount(account: BankAccount) {
  return account;
}

export function serializeSettings(settings: Settings) {
  return settings;
}

export function serializeInvoice(invoice: InvoiceWithRelations) {
  return {
    ...invoice,
    issueDate: formatDate(invoice.issueDate),
    dueDate: formatDate(invoice.dueDate),
    fxRateDate: invoice.fxRateDate ? formatDate(invoice.fxRateDate) : null,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    fxRateCzk: invoice.fxRateCzk ? toNumber(invoice.fxRateCzk) : null,
    totalCzkAtIssue: invoice.totalCzkAtIssue ? toNumber(invoice.totalCzkAtIssue) : null,
    total: toNumber(invoice.total),
    items: invoice.items.map((item) => ({
      ...item,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      lineTotal: toNumber(item.lineTotal)
    }))
  };
}

export function invoiceTotalFromItems(items: Array<{ quantity: number; unitPrice: number }>): Prisma.Decimal {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return new Prisma.Decimal(total.toFixed(2));
}

export function lineTotal(quantity: number, unitPrice: number): Prisma.Decimal {
  return new Prisma.Decimal((quantity * unitPrice).toFixed(2));
}
