import { prisma } from "../prisma.js";

const defaultSettings = {
  id: "singleton",
  supplierName: "Your Company",
  supplierStreet: "Street 1",
  supplierCity: "City",
  supplierZip: "10000",
  supplierCountry: "Czech Republic",
  supplierICO: null,
  supplierEmail: null,
  supplierPhone: null,
  defaultDueDays: 3,
  invoiceNumberFormat: "YYYY-NN" as const,
  pdfTemplate: "classic" as const
};

export async function ensureSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (existing) {
    const hasSupportedTemplate = ["classic", "classic_rows"].includes(existing.pdfTemplate);
    if (
      existing.defaultDueDays !== 3 ||
      existing.invoiceNumberFormat !== "YYYY-NN" ||
      !hasSupportedTemplate
    ) {
      return prisma.settings.update({
        where: { id: "singleton" },
        data: {
          defaultDueDays: 3,
          invoiceNumberFormat: "YYYY-NN",
          pdfTemplate: hasSupportedTemplate ? existing.pdfTemplate : "classic"
        }
      });
    }
    return existing;
  }

  return prisma.settings.create({ data: defaultSettings });
}
