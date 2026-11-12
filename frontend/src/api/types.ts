export type InvoiceStatus = "draft" | "issued" | "sent" | "paid";
export type InvoiceStatusDisplay = InvoiceStatus | "overdue";
export type PdfTemplate = "classic" | "classic_rows";

export interface ApiErrorEnvelope {
  message: string;
  code: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface Contact {
  id: string;
  name: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  ico: string | null;
  dic: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactLookupResult {
  ico: string;
  name: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  dic: string | null;
}

export type AccountType = "iban" | "local";

export interface BankAccount {
  id: string;
  label: string;
  currency: string;
  accountType: AccountType;
  iban: string | null;
  bic: string | null;
  routingNumber: string | null;
  accountNumber: string | null;
  bankCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id?: string;
  title: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string | null;
  variableSymbol: string | null;
  pdfTemplate: PdfTemplate | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: string;
  note: string | null;
  fxRateCzk?: number | null;
  fxRateDate?: string | null;
  totalCzkAtIssue?: number | null;
  contactId: string;
  bankAccountId: string;
  total: number;
  convertedTotalCzk?: number | null;
  emailSentAt: string | null;
  emailSentTo: string | null;
  emailMessageId: string | null;
  statusDisplay?: InvoiceStatusDisplay;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  bankAccount: BankAccount;
  items: Required<InvoiceItem>[];
}

export interface InvoiceCzkConversion {
  currency: "USD";
  issueDate: string;
  rateDate: string;
  rateCzk: number;
  totalOriginal: number;
  totalCzk: number;
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export interface SendEmailResponse {
  sentAt: string;
  to: string;
  messageId: string;
  status: InvoiceStatus;
  statusDisplay: InvoiceStatusDisplay;
}

export interface Settings {
  id: string;
  supplierName: string;
  supplierStreet: string;
  supplierCity: string;
  supplierZip: string;
  supplierCountry: string;
  supplierICO: string | null;
  supplierEmail: string | null;
  supplierPhone: string | null;
  defaultDueDays: number;
  invoiceNumberFormat: "YYYY-NN";
  pdfTemplate: PdfTemplate;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalInvoicedCombinedCzk: number | null;
  currencyTotals: {
    CZK: {
      totalInvoiced: number;
      totalPaid: number;
      outstanding: number;
      invoiceCount: number;
    };
    USD: {
      totalInvoiced: number;
      totalPaid: number;
      outstanding: number;
      invoiceCount: number;
      convertedToCzk: {
        rateDate: string | null;
        rateCzk: number | null;
        totalInvoiced: number;
        totalPaid: number;
        outstanding: number;
      } | null;
    };
  };
  year: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
  lastInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customer: string;
    issueDate: string;
    paidAt: string | null;
    total: number;
    convertedTotalCzk: number | null;
    currency: string;
    status: InvoiceStatus;
    statusDisplay: InvoiceStatusDisplay;
  }>;
  monthlyTotals: Array<{
    month: number;
    total: number;
  }>;
  monthlyCurrencyTotals: Array<{
    month: number;
    czk: number;
    usd: number;
    usdConvertedCzk: number | null;
    totalConvertedCzk: number | null;
  }>;
}

export interface CurrentMarketStats {
  rates: {
    USD: {
      rateCzk: number | null;
      rateDate: string | null;
    };
    EUR: {
      rateCzk: number | null;
      rateDate: string | null;
    };
  };
  statistics: {
    medianWageCzk: number | null;
    medianWagePeriod: string | null;
    averageWageCzk: number | null;
    averageWagePeriod: string | null;
  };
  history: {
    rates: {
      USD: Array<{
        date: string;
        valueCzk: number;
        rateDate: string;
      }>;
      EUR: Array<{
        date: string;
        valueCzk: number;
        rateDate: string;
      }>;
    };
    statistics: {
      medianWageCzk: Array<{
        month: string;
        valueCzk: number;
        sourcePeriod: string;
      }>;
      averageWageCzk: Array<{
        month: string;
        valueCzk: number;
        sourcePeriod: string;
      }>;
    };
  };
  fetchedAt: string;
}

export interface LastInvoiceTemplate {
  currency: string;
  note: string | null;
  bankAccountId: string;
  items: Array<{
    title: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }>;
}

export interface ContactLastInvoiceTemplate {
  contactId: string;
  template: LastInvoiceTemplate | null;
}

export interface ContactInvoiceTemplate {
  id?: string | null;
  bankAccountId: string | null;
  currency: string | null;
  note: string | null;
  items: Array<{
    id?: string;
    title: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }>;
}

export interface ContactInvoiceHistoryRow {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  total: number;
  currency: string;
  bankAccountLabel: string;
  status: InvoiceStatus;
  statusDisplay: InvoiceStatusDisplay;
}

export interface ContactDetailPayload {
  contact: Contact;
  invoiceTemplate: ContactInvoiceTemplate | null;
  invoices: ContactInvoiceHistoryRow[];
}

export interface BackupSummary {
  id: string;
  createdAt: string;
}

export interface BackupRestoreResult {
  ok: true;
  restoredBackupId: string;
  safetyBackupId: string | null;
  includePdfs: boolean;
}
