import type {
  ApiErrorEnvelope,
  BackupRestoreResult,
  BackupSummary,
  BankAccount,
  Contact,
  ContactDetailPayload,
  CurrentMarketStats,
  ContactLastInvoiceTemplate,
  ContactInvoiceTemplate,
  ContactLookupResult,
  DashboardStats,
  GmailStatus,
  Invoice,
  InvoiceCzkConversion,
  InvoiceItem,
  InvoiceStatus,
  SendEmailResponse,
  Settings
} from "./types";

export class ApiClientError extends Error {
  code: string;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(params: { message: string; code?: string; details?: Record<string, unknown>; requestId?: string }) {
    super(params.message);
    this.code = params.code ?? "UNKNOWN";
    this.details = params.details;
    this.requestId = params.requestId;
  }
}

function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export function resolveDevApiBaseOverride(value: string | null, pageOrigin: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed, pageOrigin);
    const isRelativePath = trimmed.startsWith("/") && !trimmed.startsWith("//");
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const hasCredentials = Boolean(url.username || url.password);

    if (isRelativePath) {
      return `${url.pathname}${url.search}${url.hash}`.replace(/\/+$/, "");
    }

    if (isHttp && !hasCredentials && isLocalhostHostname(url.hostname)) {
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return null;
  }

  return null;
}

function resolveApiBase(): string {
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = resolveDevApiBaseOverride(searchParams.get("apiBase"), window.location.origin);
    if (fromQuery) {
      return fromQuery;
    }
  }

  return import.meta.env.VITE_API_BASE ?? "http://localhost:3001/api";
}

const API_BASE = resolveApiBase();

function normalizeMessage(envelope: ApiErrorEnvelope, fallbackStatus: number): string {
  if (envelope.message?.trim()) {
    return envelope.message;
  }

  if (fallbackStatus === 404) {
    return "Požadovaný záznam nebyl nalezen.";
  }

  if (fallbackStatus >= 500) {
    return "Došlo k chybě serveru, zkuste to prosím později.";
  }

  return "Požadavek se nepodařilo zpracovat.";
}

async function parseApiError(response: Response): Promise<ApiClientError> {
  const bodyText = await response.text();

  if (!bodyText) {
    return new ApiClientError({
      message: `HTTP ${response.status}`,
      code: "HTTP_ERROR"
    });
  }

  try {
    const envelope = JSON.parse(bodyText) as ApiErrorEnvelope;
    return new ApiClientError({
      message: normalizeMessage(envelope, response.status),
      code: envelope.code || "HTTP_ERROR",
      details: envelope.details,
      requestId: envelope.requestId
    });
  } catch {
    return new ApiClientError({
      message: bodyText,
      code: "HTTP_ERROR"
    });
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  contacts: {
    list: () => request<Contact[]>("/contacts"),
    lookupByIco: (ico: string) => request<ContactLookupResult>(`/contacts/lookup?ico=${encodeURIComponent(ico)}`),
    lastInvoiceTemplate: (id: string) => request<ContactLastInvoiceTemplate>(`/contacts/${id}/last-invoice-template`),
    invoiceTemplate: (id: string) => request<ContactInvoiceTemplate>(`/contacts/${id}/invoice-template`),
    detail: (id: string) => request<ContactDetailPayload>(`/contacts/${id}/detail`),
    saveInvoiceTemplate: (id: string, payload: ContactInvoiceTemplate) =>
      request<ContactInvoiceTemplate>(`/contacts/${id}/invoice-template`, {
        method: "PUT",
        body: JSON.stringify(payload)
      }),
    create: (payload: Omit<Contact, "id" | "createdAt" | "updatedAt">) =>
      request<Contact>("/contacts", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Omit<Contact, "id" | "createdAt" | "updatedAt">) =>
      request<Contact>(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/contacts/${id}`, { method: "DELETE" })
  },
  bankAccounts: {
    list: () => request<BankAccount[]>("/bank-accounts"),
    create: (payload: Omit<BankAccount, "id" | "createdAt" | "updatedAt">) =>
      request<BankAccount>("/bank-accounts", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Omit<BankAccount, "id" | "createdAt" | "updatedAt">) =>
      request<BankAccount>(`/bank-accounts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/bank-accounts/${id}`, { method: "DELETE" })
  },
  invoices: {
    list: (params: {
      year?: number;
      status?: InvoiceStatus | "all" | "overdue";
      contactId?: string;
      search?: string;
    }) => {
      const query = new URLSearchParams();
      if (params.year) query.set("year", String(params.year));
      if (params.status && params.status !== "all") query.set("status", params.status);
      if (params.contactId) query.set("contactId", params.contactId);
      if (params.search) query.set("search", params.search);
      return request<Invoice[]>(`/invoices?${query.toString()}`);
    },
    detail: (id: string) => request<Invoice>(`/invoices/${id}`),
    create: (payload: {
      contactId: string;
      bankAccountId: string;
      issueDate: string;
        dueDate: string;
        currency?: string;
        status?: "draft" | "issued";
        note?: string;
        items: InvoiceItem[];
      }) => request<Invoice>("/invoices", { method: "POST", body: JSON.stringify(payload) }),
    update: (
      id: string,
      payload: {
        contactId: string;
        bankAccountId: string;
        issueDate: string;
        dueDate: string;
        currency?: string;
        status?: "draft" | "issued";
        note?: string;
        items: InvoiceItem[];
      }
    ) => request<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    duplicate: (id: string) => request<Invoice>(`/invoices/${id}/duplicate`, { method: "POST" }),
    remove: (id: string) => request<void>(`/invoices/${id}`, { method: "DELETE" }),
    markPaid: (id: string, paid: boolean) =>
      request<Invoice>(`/invoices/${id}/mark-paid`, {
        method: "PATCH",
        body: JSON.stringify({ paid })
      }),
    exchangeRateCzk: (id: string) => request<InvoiceCzkConversion>(`/invoices/${id}/exchange-rate-czk`),
    sendEmail: (id: string, payload: { to: string; additionalTo?: string; lang: "cs" | "en"; subject: string; body: string }) =>
      request<SendEmailResponse>(`/invoices/${id}/send-email`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    pdfUrl: (id: string, lang: "cs" | "en") => `${API_BASE}/invoices/${id}/pdf?lang=${lang}`
  },
  stats: {
    byYear: (year: number) => request<DashboardStats>(`/stats?year=${year}`),
    currentMarket: () => request<CurrentMarketStats>("/stats/current-market")
  },
  settings: {
    get: () => request<Settings>("/settings"),
    update: (payload: Omit<Settings, "id" | "createdAt" | "updatedAt">) =>
      request<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      })
  },
  gmail: {
    status: () => request<GmailStatus>("/gmail/status"),
    connectUrl: `${API_BASE}/gmail/connect`,
    disconnect: () => request<GmailStatus>("/gmail/disconnect", { method: "POST" })
  },
  reports: {
    invoicesCsvUrl: (year: number, month?: number) => {
      const query = new URLSearchParams();
      query.set("year", String(year));
      if (typeof month === "number") {
        query.set("month", String(month));
      }
      return `${API_BASE}/reports/invoices.csv?${query.toString()}`;
    }
  },
  backup: {
    list: () => request<BackupSummary[]>("/backup"),
    create: (includePdfs = true) =>
      request<BackupSummary & { includePdfs: boolean }>("/backup/export", {
        method: "POST",
        body: JSON.stringify({ includePdfs })
      }),
    restore: (backupId: string, includePdfs = true) =>
      request<BackupRestoreResult>("/backup/import", {
        method: "POST",
        body: JSON.stringify({ backupId, includePdfs })
      }),
    remove: (backupId: string) => request<void>(`/backup/${backupId}`, { method: "DELETE" })
  }
};
