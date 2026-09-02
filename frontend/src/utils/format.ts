import type { InvoiceStatusDisplay } from "../api/types";

export function formatInvoiceNumber(value: string | null): string {
  return value?.trim() ? value : "Koncept";
}

export function formatMoney(value: number, currency: string): string {
  if (currency.trim().toUpperCase() === "USD") {
    return `${new Intl.NumberFormat("cs-CZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)} USD`;
  }

  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency
  }).format(value);
}

export function formatExchangeRate(value: number, currency: string): string {
  return `1 ${currency.trim().toUpperCase()} = ${formatMoney(value, "CZK")}`;
}

export function formatDateCz(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}.${month}.${year}`;
}

export function formatDateTimeCz(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";

  if (!day || !month || !year || !hour || !minute) {
    return value;
  }

  return `${day}. ${month}. ${year} ${hour}:${minute}`;
}

export function formatMonthCz(value: string): string {
  const [year, month] = value.split("-");
  if (!year || !month) {
    return value;
  }

  const date = new Date(`${year}-${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function formatPaidAtTooltip(paidAt: string | null): string | null {
  if (!paidAt) {
    return null;
  }

  return `Označeno jako uhrazeno: ${formatDateTimeCz(paidAt)}`;
}

export function formatStatusLabel(value: InvoiceStatusDisplay): string {
  if (value === "draft") {
    return "Koncept";
  }

  if (value === "paid") {
    return "Uhrazeno";
  }

  if (value === "sent") {
    return "Odesláno";
  }

  if (value === "overdue") {
    return "Po splatnosti";
  }

  return "Vystaveno";
}
