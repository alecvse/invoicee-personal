import fs from "node:fs/promises";
import path from "node:path";
import type { Settings } from "@prisma/client";
import { config } from "../../config.js";
import { renderClassicInvoicePdf } from "./classicTemplate.js";
import type { InvoiceForPdf, Lang } from "./shared.js";

async function renderByTemplate(params: {
  invoice: InvoiceForPdf;
  settings: Settings;
  lang: Lang;
}): Promise<Buffer> {
  const { invoice, settings, lang } = params;
  const effectiveSettings = { ...settings, pdfTemplate: invoice.pdfTemplate ?? settings.pdfTemplate };
  return renderClassicInvoicePdf({ invoice, settings: effectiveSettings, lang });
}

export async function generateInvoicePdf(params: {
  invoice: InvoiceForPdf;
  settings: Settings;
  lang: Lang;
}): Promise<{ filename: string; filePath: string; bytes: Buffer }> {
  const { invoice, lang } = params;
  const safeInvoiceNumber = invoice.invoiceNumber ?? "koncept";

  await fs.mkdir(config.pdfOutputDir, { recursive: true });

  const filename = `${safeInvoiceNumber}_${lang}.pdf`;
  const filePath = path.resolve(config.pdfOutputDir, filename);
  const bytes = await renderByTemplate(params);
  await fs.writeFile(filePath, bytes);

  return { filename, filePath, bytes };
}
