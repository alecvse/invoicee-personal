import PDFDocument from "pdfkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderClassicInvoicePdf } from "../services/pdf/classicTemplate.js";
import { currency } from "../services/pdf/shared.js";
import { pdfFixture } from "./pdfFixtures.js";

afterEach(() => vi.restoreAllMocks());

describe("Classic Rows PDF", () => {
  it.each(["cs", "en"] as const)("prints separate item prices in %s", async lang => {
    const text = vi.spyOn(PDFDocument.prototype, "text");
    const fixture = pdfFixture(lang === "en" ? "USD" : "CZK");
    const bytes = await renderClassicInvoicePdf({ ...fixture, lang });
    const printed = text.mock.calls.map(call => call[0]);
    for (const item of fixture.invoice.items) {
      expect(printed).toContain(item.title);
      expect(printed).toContain(currency(Number(item.lineTotal), fixture.invoice.currency));
    }
    expect(printed).toContain(lang === "cs" ? "Cena za položku" : "Item price");
    expect(printed).not.toContain("Množství");
    expect(printed).not.toContain("Quantity");
    expect(printed).not.toContain("hod");
    expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("paginates long lists and repeats column headings without losing rows", async () => {
    const text = vi.spyOn(PDFDocument.prototype, "text");
    const fixture = pdfFixture("CZK", 45);
    const bytes = await renderClassicInvoicePdf({ ...fixture, lang: "cs" });
    const printed = text.mock.calls.map(call => call[0]);
    for (const item of fixture.invoice.items) expect(printed.filter(value => value === item.title)).toHaveLength(1);
    expect(printed.filter(value => value === "Cena za položku").length).toBeGreaterThan(1);
    expect(printed).toContain(currency(Number(fixture.invoice.total), "CZK"));
    expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });

  it("splits exceptionally long descriptions across pages", async () => {
    const text = vi.spyOn(PDFDocument.prototype, "text");
    const fixture = pdfFixture("CZK", 1);
    fixture.invoice.items[0].title = "Podrobný popis služby ".repeat(500).trim();
    await renderClassicInvoicePdf({ ...fixture, lang: "cs" });
    const segments = text.mock.calls.map(call => call[0]).map(String).filter(value => value.startsWith("Podrobný") || value.includes("popis služby"));
    expect(segments.join(" ").replace(/\s+/g, " ")).toBe(fixture.invoice.items[0].title);
  });

  it("omits notes from Classic Rows", async () => {
    const text = vi.spyOn(PDFDocument.prototype, "text");
    const fixture = pdfFixture("CZK", 1);
    fixture.invoice.note = "Doplňující informace ".repeat(800).trim();
    const bytes = await renderClassicInvoicePdf({ ...fixture, lang: "cs" });
    expect(text.mock.calls.some(call => String(call[0]).includes("Doplňující informace"))).toBe(false);
    expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("keeps the existing Classic service description", async () => {
    const text = vi.spyOn(PDFDocument.prototype, "text");
    const fixture = pdfFixture();
    fixture.settings.pdfTemplate = "classic";
    await renderClassicInvoicePdf({ ...fixture, lang: "cs" });
    expect(text.mock.calls.map(call => call[0])).toContain(fixture.invoice.items.map(item => item.title).join(", "));
  });
});
