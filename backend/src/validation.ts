import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(1),
  street: z.string().min(1),
  city: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().min(1),
  ico: z.string().optional().nullable(),
  dic: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable()
});

const accountBaseSchema = z.object({
  label: z.string().min(1),
  currency: z.string().min(1),
  accountType: z.enum(["iban", "local"]),
  iban: z.string().optional().nullable(),
  bic: z.string().optional().nullable(),
  routingNumber: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  bankCode: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false)
});

export const bankAccountSchema = accountBaseSchema.superRefine((value, ctx) => {
  const hasValue = (input?: string | null) => Boolean(input && input.trim().length > 0);
  const currency = value.currency.trim().toUpperCase();

  if (value.accountType === "iban" && !hasValue(value.iban)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "IBAN is required for IBAN account type",
      path: ["iban"]
    });
  }

  if (value.accountType === "local" && !hasValue(value.accountNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Account number is required for local account type",
      path: ["accountNumber"]
    });
  }

  if (currency === "USD" && !hasValue(value.routingNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Routing number is required for USD accounts",
      path: ["routingNumber"]
    });
  }

  if (currency === "USD" && !hasValue(value.bic)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SWIFT/BIC is required for USD accounts",
      path: ["bic"]
    });
  }
});

export const invoiceItemSchema = z.object({
  title: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().nonnegative()
});

export const templateInvoiceItemSchema = z.object({
  title: z.string().trim().min(1),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
  unitPrice: z.number().nonnegative()
});

export const contactInvoiceTemplateSchema = z.object({
  bankAccountId: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  items: z.array(templateInvoiceItemSchema).default([])
});

export const createInvoiceSchema = z.object({
  contactId: z.string().min(1),
  bankAccountId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  currency: z.string().optional(),
  status: z.enum(["draft", "issued"]).optional(),
  pdfTemplate: z.enum(["classic", "classic_rows"]).optional().nullable(),
  note: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1)
});

export const updateInvoiceSchema = z.object({
  contactId: z.string().min(1),
  bankAccountId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  currency: z.string().optional(),
  status: z.enum(["draft", "issued"]).optional(),
  pdfTemplate: z.enum(["classic", "classic_rows"]).optional().nullable(),
  note: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1)
});

export const settingsSchema = z.object({
  supplierName: z.string().min(1),
  supplierStreet: z.string().min(1),
  supplierCity: z.string().min(1),
  supplierZip: z.string().min(1),
  supplierCountry: z.string().min(1),
  supplierICO: z.string().optional().nullable(),
  supplierEmail: z.string().email().optional().nullable().or(z.literal("")),
  supplierPhone: z.string().optional().nullable(),
  defaultDueDays: z.number().int().positive(),
  invoiceNumberFormat: z.literal("YYYY-NN"),
  pdfTemplate: z.enum(["classic", "classic_rows"])
});

export const sendEmailSchema = z.object({
  to: z.string().trim().email().max(320),
  additionalTo: z.string().trim().email().max(320).optional(),
  lang: z.enum(["cs", "en"]),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000)
});
