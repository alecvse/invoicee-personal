import type { Prisma } from "@prisma/client";

export function toNumber(value: Prisma.Decimal | number | string): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number(value.toString());
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
