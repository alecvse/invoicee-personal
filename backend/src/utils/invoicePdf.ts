import { Prisma } from "@prisma/client";

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

export function decimalFromNumber(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(6));
}
