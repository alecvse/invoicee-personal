import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { resetCnbRateCacheForTests } from "../services/cnbService.js";
import { ensureDatabaseSchema } from "../services/databaseInit.js";
import { resetCurrentMarketStatsCacheForTests } from "../services/marketStatsService.js";
import { ensureSettings } from "../services/settingsService.js";

const testDbPath = path.resolve(process.cwd(), "data/test.db");
const testBackupDir = path.resolve(process.cwd(), "data/test-backups");
const testPdfDir = path.resolve(process.cwd(), "data/test-pdfs");
const originalBackupDir = config.backupDir;
const originalPdfOutputDir = config.pdfOutputDir;
const originalGmailTokenPath = config.gmailTokenPath;
const originalGmailClientId = config.gmailClientId;
const originalGmailClientSecret = config.gmailClientSecret;
const originalGmailRedirectUri = config.gmailRedirectUri;

config.backupDir = testBackupDir;
config.pdfOutputDir = testPdfDir;

const app = createApp();

async function readContactNamesFromDatabase(dbPath: string): Promise<string[]> {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`
      }
    }
  });

  try {
    const contacts = await client.contact.findMany({
      select: { name: true },
      orderBy: { name: "asc" }
    });
    return contacts.map((contact) => contact.name);
  } finally {
    await client.$disconnect();
  }
}

function dailyRatesText(usdRate = "23,45", eurRate = "25,12"): string {
  return [
    "26 Mar 2026 #58",
    "Country|Currency|Amount|Code|Rate",
    `USA|dollar|1|USD|${usdRate}`,
    `EMU|euro|1|EUR|${eurRate}`
  ].join("\n");
}

function singleWageRss(articleUrl = "https://csu.gov.cz/rychle-informace/prumerne-mzdy-4-ctvrtleti-2025"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>06. 03. 2026 Průměrné mzdy - 4. čtvrtletí 2025</title>
          <link>${articleUrl}</link>
          <description>Průměrná mzda vzrostla reálně o 5,1 %</description>
        </item>
      </channel>
    </rss>`;
}

function wageArticleHtml(averageWage = 52283, medianWage = 45523): string {
  return `<!DOCTYPE html><html><body>
    Ve 4. čtvrtletí 2025 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem ${averageWage.toLocaleString("cs-CZ")} Kč.
    Medián mezd činil ${medianWage.toLocaleString("cs-CZ")} Kč.
  </body></html>`;
}

describe("API integration", () => {
  beforeAll(async () => {
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    await ensureDatabaseSchema();
    await ensureSettings();
  });

  beforeEach(async () => {
    resetCnbRateCacheForTests();
    resetCurrentMarketStatsCacheForTests();
    vi.restoreAllMocks();
    await fs.rm(testBackupDir, { recursive: true, force: true });
    await fs.rm(testPdfDir, { recursive: true, force: true });
    await fs.mkdir(testPdfDir, { recursive: true });

    await prisma.contactInvoiceTemplateItem.deleteMany();
    await prisma.contactInvoiceTemplate.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.invoiceSequence.deleteMany();
    await prisma.bankAccount.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.settings.upsert({
      where: { id: "singleton" },
      update: {
        supplierName: "Your Company",
        supplierStreet: "Street 1",
        supplierCity: "City",
        supplierZip: "10000",
        supplierCountry: "Czech Republic",
        supplierICO: null,
        supplierEmail: null,
        supplierPhone: null,
        defaultDueDays: 3,
        invoiceNumberFormat: "YYYY-NN",
        pdfTemplate: "classic"
      },
      create: {
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
        invoiceNumberFormat: "YYYY-NN",
        pdfTemplate: "classic"
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    config.backupDir = originalBackupDir;
    config.pdfOutputDir = originalPdfOutputDir;
    await fs.rm(testBackupDir, { recursive: true, force: true });
    await fs.rm(testPdfDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unified envelope for validation errors", async () => {
    const response = await request(app).post("/api/contacts").send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.any(String)
    });
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it("returns envelope for not found routes", async () => {
    const response = await request(app).get("/api/not-existing");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Požadovaná cesta nebyla nalezena.",
      requestId: expect.any(String)
    });
  });

  it("returns BAD_REQUEST for invalid ARES lookup input", async () => {
    const response = await request(app).get("/api/contacts/lookup?ico=abc");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "BAD_REQUEST",
      message: "Neplatné IČ."
    });
  });

  it("returns settings with classic PDF template by default and allows switching to mondrian", async () => {
    const initial = await request(app).get("/api/settings");

    expect(initial.status).toBe(200);
    expect(initial.body.pdfTemplate).toBe("classic");

    const updated = await request(app).put("/api/settings").send({
      supplierName: "Your Company",
      supplierStreet: "Street 1",
      supplierCity: "City",
      supplierZip: "10000",
      supplierCountry: "Czech Republic",
      supplierICO: "73078841",
      supplierEmail: null,
      supplierPhone: null,
      defaultDueDays: 3,
      invoiceNumberFormat: "YYYY-NN",
      pdfTemplate: "mondrian"
    });

    expect(updated.status).toBe(200);
    expect(updated.body.pdfTemplate).toBe("mondrian");
  });

  it("returns null template when contact has no invoices", async () => {
    const contact = await prisma.contact.create({
      data: {
        name: "Test kontakt",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika"
      }
    });

    const response = await request(app).get(`/api/contacts/${contact.id}/last-invoice-template`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      contactId: contact.id,
      template: null
    });
  });

  it("returns current market stats with rates and wage statistics", async () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>06. 03. 2026 Průměrné mzdy - 4. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-4-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 5,1 %</description>
          </item>
          <item>
            <title>03. 12. 2025 Průměrné mzdy - 3. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-3-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 4,8 %</description>
          </item>
          <item>
            <title>03. 09. 2025 Průměrné mzdy - 2. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-2-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 4,5 %</description>
          </item>
          <item>
            <title>04. 06. 2025 Průměrné mzdy - 1. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 3,9 %</description>
          </item>
          <item>
            <title>04. 03. 2025 Průměrné mzdy - 4. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-4-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 4,2 %</description>
          </item>
          <item>
            <title>04. 12. 2024 Průměrné mzdy - 3. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-3-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 4,0 %</description>
          </item>
          <item>
            <title>04. 09. 2024 Průměrné mzdy - 2. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-2-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 3,7 %</description>
          </item>
          <item>
            <title>04. 06. 2024 Průměrné mzdy - 1. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 3,2 %</description>
          </item>
        </channel>
      </rss>`;

    const wageArticles = new Map<string, string>([
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-4-ctvrtleti-2025",
        `<!DOCTYPE html><html><body>
      Ve 4. čtvrtletí 2025 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 52 283 Kč.
      Medián mezd činil 45 523 Kč.
    </body></html>`
      ],
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-3-ctvrtleti-2025",
        `<!DOCTYPE html><html><body>
      Ve 3. čtvrtletí 2025 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 51 212 Kč.
      Medián mezd činil 44 101 Kč.
    </body></html>`
      ],
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-2-ctvrtleti-2025",
        `<!DOCTYPE html><html><body>
      Ve 2. čtvrtletí 2025 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 49 877 Kč.
      Medián mezd činil 42 890 Kč.
    </body></html>`
      ],
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2025",
        `<!DOCTYPE html><html><body>
      Ve 1. čtvrtletí 2025 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 46 924 Kč.
      Medián mezd činil 38 385 Kč.
    </body></html>`
      ],
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-4-ctvrtleti-2024",
        `<!DOCTYPE html><html><body>
      Ve 4. čtvrtletí 2024 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 45 678 Kč.
      Medián mezd činil 37 104 Kč.
    </body></html>`
      ],
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-3-ctvrtleti-2024",
        `<!DOCTYPE html><html><body>
      Ve 3. čtvrtletí 2024 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 44 210 Kč.
      Medián mezd činil 36 250 Kč.
    </body></html>`
      ],
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-2-ctvrtleti-2024",
        `<!DOCTYPE html><html><body>
      Ve 2. čtvrtletí 2024 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 43 480 Kč.
      Medián mezd činil 35 812 Kč.
    </body></html>`
      ],
      [
        "https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2024",
        `<!DOCTYPE html><html><body>
      Ve 1. čtvrtletí 2024 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 42 955 Kč.
      Medián mezd činil 34 908 Kč.
    </body></html>`
      ]
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("cnb.cz")) {
        const parsedUrl = new URL(url);
        const dateParam = parsedUrl.searchParams.get("date") ?? "26.03.2026";
        const month = dateParam.split(".")[1] ?? "03";
        const usdRate = month === "12" ? "23,00" : month === "01" ? "23,10" : month === "02" ? "23,30" : "23,45";
        const eurRate = month === "12" ? "24,60" : month === "01" ? "24,80" : month === "02" ? "24,95" : "25,12";

        return new Response(
          [
            "26 Mar 2026 #58",
            "Country|Currency|Amount|Code|Rate",
            `USA|dollar|1|USD|${usdRate}`,
            `EMU|euro|1|EUR|${eurRate}`
          ].join("\n"),
          { status: 200 }
        );
      }

      if (url === "https://csu.gov.cz/rss/produkty?kodVlastnostiVystupu=RI&jazyk=CS") {
        return new Response(rssXml, { status: 200 });
      }

      const wageHtml = wageArticles.get(url);
      if (wageHtml) {
        return new Response(wageHtml, { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    });

    const response = await request(app).get("/api/stats/current-market");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      rates: {
        USD: {
          rateCzk: 23.45,
          rateDate: expect.any(String)
        },
        EUR: {
          rateCzk: 25.12,
          rateDate: expect.any(String)
        }
      },
      statistics: {
        medianWageCzk: 45523,
        medianWagePeriod: "4. čtvrtletí 2025",
        averageWageCzk: 52283,
        averageWagePeriod: "4. čtvrtletí 2025"
      },
      history: {
        rates: {
          USD: expect.any(Array),
          EUR: expect.any(Array)
        },
        statistics: {
          medianWageCzk: expect.any(Array),
          averageWageCzk: expect.any(Array)
        }
      },
      fetchedAt: expect.any(String)
    });

    expect(response.body.history.rates.USD).toHaveLength(30);
    expect(response.body.history.rates.EUR).toHaveLength(30);
    expect(response.body.history.statistics.medianWageCzk).toHaveLength(8);
    expect(response.body.history.statistics.averageWageCzk).toHaveLength(8);
    expect(response.body.history.statistics.medianWageCzk[0]).toEqual({
      month: "2024-01",
      valueCzk: 34908,
      sourcePeriod: "1. čtvrtletí 2024"
    });
    expect(response.body.history.statistics.averageWageCzk[7]).toEqual({
      month: "2025-10",
      valueCzk: 52283,
      sourcePeriod: "4. čtvrtletí 2025"
    });
  });

  it("falls back to cached market stats when refreshed history fetch fails", async () => {
    const dailyRatesText = [
      "26 Mar 2026 #58",
      "Country|Currency|Amount|Code|Rate",
      "USA|dollar|1|USD|23,45",
      "EMU|euro|1|EUR|25,12"
    ].join("\n");

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>06. 03. 2026 Průměrné mzdy - 4. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-4-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 5,1 %</description>
          </item>
          <item>
            <title>03. 12. 2025 Průměrné mzdy - 3. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-3-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 4,8 %</description>
          </item>
          <item>
            <title>03. 09. 2025 Průměrné mzdy - 2. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-2-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 4,5 %</description>
          </item>
          <item>
            <title>04. 06. 2025 Průměrné mzdy - 1. čtvrtletí 2025</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2025</link>
            <description>Průměrná mzda vzrostla reálně o 3,9 %</description>
          </item>
          <item>
            <title>04. 03. 2025 Průměrné mzdy - 4. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-4-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 4,2 %</description>
          </item>
          <item>
            <title>04. 12. 2024 Průměrné mzdy - 3. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-3-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 4,0 %</description>
          </item>
          <item>
            <title>04. 09. 2024 Průměrné mzdy - 2. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-2-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 3,7 %</description>
          </item>
          <item>
            <title>04. 06. 2024 Průměrné mzdy - 1. čtvrtletí 2024</title>
            <link>https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2024</link>
            <description>Průměrná mzda vzrostla reálně o 3,2 %</description>
          </item>
        </channel>
      </rss>`;

    const wageHtml = `<!DOCTYPE html><html><body>
      Ve 4. čtvrtletí 2025 činila průměrná hrubá měsíční nominální mzda na přepočtené počty zaměstnanců v národním hospodářství celkem 52 283 Kč.
      Medián mezd činil 45 523 Kč.
    </body></html>`;

    let shouldFail = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (shouldFail) {
        throw new Error("upstream unavailable");
      }

      if (url.includes("cnb.cz")) {
        return new Response(dailyRatesText, { status: 200 });
      }

      if (url === "https://csu.gov.cz/rss/produkty?kodVlastnostiVystupu=RI&jazyk=CS") {
        return new Response(rssXml, { status: 200 });
      }

      if (url.includes("prumerne-mzdy-")) {
        return new Response(wageHtml, { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    });

    const initial = await request(app).get("/api/stats/current-market");
    expect(initial.status).toBe(200);
    expect(initial.body.history.statistics.averageWageCzk).toHaveLength(8);

    resetCnbRateCacheForTests();
    shouldFail = true;
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-27T12:00:00.000Z").getTime());

    const fallback = await request(app).get("/api/stats/current-market");
    expect(fallback.status).toBe(200);
    expect(fallback.body).toEqual(initial.body);
  });

  it("preserves cached wage statistics when CZSO article parsing returns no wage values", async () => {
    const rssXml = singleWageRss();
    let articleHtml = wageArticleHtml();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("cnb.cz")) {
        return new Response(dailyRatesText(), { status: 200 });
      }

      if (url === "https://csu.gov.cz/rss/produkty?kodVlastnostiVystupu=RI&jazyk=CS") {
        return new Response(rssXml, { status: 200 });
      }

      if (url.includes("prumerne-mzdy-")) {
        return new Response(articleHtml, { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    });

    const initial = await request(app).get("/api/stats/current-market");
    expect(initial.status).toBe(200);
    expect(initial.body.statistics).toEqual({
      medianWageCzk: 45523,
      medianWagePeriod: "4. čtvrtletí 2025",
      averageWageCzk: 52283,
      averageWagePeriod: "4. čtvrtletí 2025"
    });

    resetCnbRateCacheForTests();
    articleHtml = "<!DOCTYPE html><html><body>ČSÚ změnil strukturu článku bez číselných hodnot.</body></html>";
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-27T12:00:00.000Z").getTime());

    const refreshed = await request(app).get("/api/stats/current-market");

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.statistics).toEqual(initial.body.statistics);
    expect(refreshed.body.rates.USD.rateCzk).toBe(23.45);
    expect(refreshed.body.rates.EUR.rateCzk).toBe(25.12);
  });

  it("shares one in-flight market stats refresh across concurrent requests", async () => {
    const rssXml = singleWageRss();
    let rssRequestCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("cnb.cz")) {
        return new Response(dailyRatesText(), { status: 200 });
      }

      if (url === "https://csu.gov.cz/rss/produkty?kodVlastnostiVystupu=RI&jazyk=CS") {
        rssRequestCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(rssXml, { status: 200 });
      }

      if (url.includes("prumerne-mzdy-")) {
        return new Response(wageArticleHtml(), { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    });

    const responses = await Promise.all([
      request(app).get("/api/stats/current-market"),
      request(app).get("/api/stats/current-market"),
      request(app).get("/api/stats/current-market")
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.statistics.medianWageCzk).toBe(45523);
    }
    expect(responses[1]?.body).toEqual(responses[0]?.body);
    expect(responses[2]?.body).toEqual(responses[0]?.body);
    expect(rssRequestCount).toBe(2);
  });

  it("creates a safety backup before restoring database and PDFs", async () => {
    await prisma.contact.create({
      data: {
        name: "Stav v záloze",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika"
      }
    });
    await fs.writeFile(path.resolve(testPdfDir, "before-restore.pdf"), "pdf before restore");

    const exported = await request(app).post("/api/backup/export").send({ includePdfs: true });
    expect(exported.status).toBe(201);

    await prisma.contact.create({
      data: {
        name: "Bezpečnostní stav",
        street: "Ulice 2",
        city: "Brno",
        zip: "60200",
        country: "Česká republika"
      }
    });
    await fs.writeFile(path.resolve(testPdfDir, "safety-state.pdf"), "pdf safety state");

    const restored = await request(app).post("/api/backup/import").send({
      backupId: exported.body.id,
      includePdfs: true
    });

    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      ok: true,
      restoredBackupId: exported.body.id,
      includePdfs: true
    });
    expect(restored.body.safetyBackupId).toEqual(expect.stringMatching(/^pre-restore-\d{8}-\d{6}/));

    const activeContactNames = await prisma.contact.findMany({
      select: { name: true },
      orderBy: { name: "asc" }
    });
    expect(activeContactNames.map((contact) => contact.name)).toEqual(["Stav v záloze"]);
    await expect(fs.access(path.resolve(testPdfDir, "before-restore.pdf"))).resolves.toBeUndefined();
    await expect(fs.access(path.resolve(testPdfDir, "safety-state.pdf"))).rejects.toMatchObject({ code: "ENOENT" });

    const safetyBackupDir = path.resolve(testBackupDir, restored.body.safetyBackupId);
    await expect(fs.access(path.resolve(safetyBackupDir, "app.db"))).resolves.toBeUndefined();
    await expect(fs.access(path.resolve(safetyBackupDir, "pdfs/safety-state.pdf"))).resolves.toBeUndefined();
    const safetyContactNames = await readContactNamesFromDatabase(path.resolve(safetyBackupDir, "app.db"));
    expect(safetyContactNames).toEqual(["Bezpečnostní stav", "Stav v záloze"]);
  });

  it("keeps current database and PDFs when restore fails after creating the safety backup", async () => {
    await prisma.contact.create({
      data: {
        name: "Aktuální stav",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika"
      }
    });
    await fs.writeFile(path.resolve(testPdfDir, "current.pdf"), "current pdf");

    const brokenBackupId = "broken-backup";
    const brokenBackupDir = path.resolve(testBackupDir, brokenBackupId);
    await fs.mkdir(path.resolve(brokenBackupDir, "app.db"), { recursive: true });

    const restored = await request(app).post("/api/backup/import").send({
      backupId: brokenBackupId,
      includePdfs: true
    });

    expect(restored.status).toBe(500);
    expect(restored.body).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Obnovení zálohy selhalo."
    });

    const activeContactNames = await prisma.contact.findMany({
      select: { name: true },
      orderBy: { name: "asc" }
    });
    expect(activeContactNames.map((contact) => contact.name)).toEqual(["Aktuální stav"]);
    await expect(fs.access(path.resolve(testPdfDir, "current.pdf"))).resolves.toBeUndefined();

    const entries = await fs.readdir(testBackupDir, { withFileTypes: true });
    const safetyBackup = entries.find((entry) => entry.isDirectory() && entry.name.startsWith("pre-restore-"));
    expect(safetyBackup?.name).toEqual(expect.any(String));
    const safetyBackupDir = path.resolve(testBackupDir, safetyBackup?.name ?? "");
    await expect(fs.access(path.resolve(safetyBackupDir, "app.db"))).resolves.toBeUndefined();
    await expect(fs.access(path.resolve(safetyBackupDir, "pdfs/current.pdf"))).resolves.toBeUndefined();
  });

  it("blocks draft invoice email and header injection before Gmail is called", async () => {
    const contact = await prisma.contact.create({
      data: {
        name: "E-mail test",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika",
        email: "client@example.com"
      }
    });
    const bankAccount = await prisma.bankAccount.create({
      data: {
        label: "Test účet",
        currency: "CZK",
        accountType: "local",
        accountNumber: "123456789",
        bankCode: "0100",
        isDefault: true
      }
    });
    const created = await request(app).post("/api/invoices").send({
      contactId: contact.id,
      bankAccountId: bankAccount.id,
      issueDate: "2026-02-01",
      dueDate: "2026-02-04",
      currency: "CZK",
      status: "draft",
      items: [{ title: "Služba", quantity: 1, unit: "ks", unitPrice: 1000 }]
    });

    const draftSend = await request(app).post(`/api/invoices/${created.body.id}/send-email`).send({
      to: "client@example.com",
      lang: "cs",
      subject: "Faktura",
      body: "Test"
    });
    expect(draftSend.status).toBe(409);
    expect(draftSend.body.code).toBe("CONFLICT");

    const injection = await request(app).post(`/api/invoices/${created.body.id}/send-email`).send({
      to: "client@example.com",
      lang: "cs",
      subject: "Faktura\r\nX-Injected: yes",
      body: "Test"
    });
    expect(injection.status).toBe(400);
    expect(injection.body.code).toBe("VALIDATION_ERROR");
  });

  it("marks a sent invoice as sent and restores that state after unpaying", async () => {
    const testGmailTokenPath = path.resolve(process.cwd(), "data/test-gmail-auth.json");
    config.gmailTokenPath = testGmailTokenPath;
    config.gmailClientId = "test-client-id";
    config.gmailClientSecret = "test-client-secret";
    config.gmailRedirectUri = "http://localhost:3001/api/gmail/oauth/callback";
    await fs.writeFile(
      testGmailTokenPath,
      JSON.stringify({
        refreshToken: "refresh-token",
        email: "sender@gmail.com",
        connectedAt: new Date().toISOString()
      })
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
      }
      if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
        return new Response(JSON.stringify({ id: "gmail-message-id" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    try {
      const contact = await prisma.contact.create({
        data: {
          name: "Odeslaný kontakt",
          street: "Ulice 1",
          city: "Praha",
          zip: "11000",
          country: "Česká republika",
          email: "client@example.com"
        }
      });
      const bankAccount = await prisma.bankAccount.create({
        data: {
          label: "Test účet",
          currency: "CZK",
          accountType: "local",
          accountNumber: "123456789",
          bankCode: "0100",
          isDefault: true
        }
      });
      const issueDate = new Date();
      issueDate.setUTCDate(issueDate.getUTCDate() + 1);
      const dueDate = new Date(issueDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + 4);
      const created = await request(app).post("/api/invoices").send({
        contactId: contact.id,
        bankAccountId: bankAccount.id,
        issueDate: issueDate.toISOString().slice(0, 10),
        dueDate: dueDate.toISOString().slice(0, 10),
        currency: "CZK",
        items: [{ title: "Služba", quantity: 1, unit: "ks", unitPrice: 1000 }]
      });

      const sent = await request(app).post(`/api/invoices/${created.body.id}/send-email`).send({
        to: "client@example.com",
        additionalTo: "accounting@example.com",
        lang: "cs",
        subject: "Faktura",
        body: "Test"
      });

      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({
        status: "sent",
        statusDisplay: "sent",
        to: "client@example.com, accounting@example.com"
      });

      const paid = await request(app).patch(`/api/invoices/${created.body.id}/mark-paid`).send({ paid: true });
      expect(paid.body.status).toBe("paid");

      const unpaid = await request(app).patch(`/api/invoices/${created.body.id}/mark-paid`).send({ paid: false });
      expect(unpaid.body.status).toBe("sent");
    } finally {
      config.gmailTokenPath = originalGmailTokenPath;
      config.gmailClientId = originalGmailClientId;
      config.gmailClientSecret = originalGmailClientSecret;
      config.gmailRedirectUri = originalGmailRedirectUri;
      await fs.rm(testGmailTokenPath, { force: true });
    }
  });

  it("generates sequential invoice numbers without collision", async () => {
    const contact = await prisma.contact.create({
      data: {
        name: "Test kontakt",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika"
      }
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        label: "Test účet",
        currency: "CZK",
        accountType: "local",
        accountNumber: "123456789",
        bankCode: "0100",
        isDefault: true
      }
    });

    const payload = {
      contactId: contact.id,
      bankAccountId: bankAccount.id,
      issueDate: "2026-02-01",
      dueDate: "2026-02-04",
      currency: "CZK",
      items: [{ title: "Služba", quantity: 1, unit: "ks", unitPrice: 1000 }]
    };

    const first = await request(app).post("/api/invoices").send(payload);
    const second = await request(app).post("/api/invoices").send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.invoiceNumber).toBe("2026-01");
    expect(second.body.invoiceNumber).toBe("2026-02");
  });

  it("reuses the first free invoice number after deleting an issued invoice", async () => {
    const contact = await prisma.contact.create({
      data: {
        name: "Mazací kontakt",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika"
      }
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        label: "Test účet",
        currency: "CZK",
        accountType: "local",
        accountNumber: "123456789",
        bankCode: "0100",
        isDefault: true
      }
    });

    const payload = {
      contactId: contact.id,
      bankAccountId: bankAccount.id,
      issueDate: "2026-02-01",
      dueDate: "2026-02-04",
      currency: "CZK",
      items: [{ title: "Služba", quantity: 1, unit: "ks", unitPrice: 1000 }]
    };

    const first = await request(app).post("/api/invoices").send(payload);
    const second = await request(app).post("/api/invoices").send(payload);
    const third = await request(app).post("/api/invoices").send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(201);
    expect(first.body.invoiceNumber).toBe("2026-01");
    expect(second.body.invoiceNumber).toBe("2026-02");
    expect(third.body.invoiceNumber).toBe("2026-03");

    const deleted = await request(app).delete(`/api/invoices/${second.body.id}`);
    expect(deleted.status).toBe(204);

    const replacement = await request(app).post("/api/invoices").send(payload);
    expect(replacement.status).toBe(201);
    expect(replacement.body.invoiceNumber).toBe("2026-02");
  });

  it("creates draft invoice without invoice number and can duplicate invoice into draft", async () => {
    const contact = await prisma.contact.create({
      data: {
        name: "Test kontakt",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika"
      }
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        label: "Test účet",
        currency: "CZK",
        accountType: "local",
        accountNumber: "123456789",
        bankCode: "0100",
        isDefault: true
      }
    });

    const payload = {
      contactId: contact.id,
      bankAccountId: bankAccount.id,
      issueDate: "2026-02-01",
      dueDate: "2026-02-04",
      currency: "CZK",
      status: "draft",
      items: [{ title: "Služba", quantity: 1, unit: "ks", unitPrice: 1000 }]
    };

    const draftResponse = await request(app).post("/api/invoices").send(payload);
    expect(draftResponse.status).toBe(201);
    expect(draftResponse.body.status).toBe("draft");
    expect(draftResponse.body.invoiceNumber).toBeNull();
    expect(draftResponse.body.variableSymbol).toBeNull();

    const issuedResponse = await request(app).post("/api/invoices").send({
      ...payload,
      status: "issued"
    });
    expect(issuedResponse.status).toBe(201);
    expect(issuedResponse.body.invoiceNumber).toBe("2026-01");

    const duplicateResponse = await request(app).post(`/api/invoices/${issuedResponse.body.id}/duplicate`).send();
    const today = new Date();
    const dueInThreeDays = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 3));
    expect(duplicateResponse.status).toBe(201);
    expect(duplicateResponse.body.status).toBe("draft");
    expect(duplicateResponse.body.issueDate).toBe(today.toISOString().slice(0, 10));
    expect(duplicateResponse.body.dueDate).toBe(dueInThreeDays.toISOString().slice(0, 10));
    expect(duplicateResponse.body.invoiceNumber).toBeNull();
    expect(duplicateResponse.body.variableSymbol).toBeNull();
    expect(duplicateResponse.body.items).toHaveLength(1);
    expect(duplicateResponse.body.items[0]).toMatchObject({
      title: "Služba",
      quantity: 1,
      unitPrice: 1000
    });
  });

  it("generates invoice PDF using the selected mondrian template", async () => {
    await prisma.settings.update({
      where: { id: "singleton" },
      data: { pdfTemplate: "mondrian" }
    });

    const contact = await prisma.contact.create({
      data: {
        name: "USD Client",
        street: "Wall Street 1",
        city: "New York",
        zip: "10005",
        country: "USA"
      }
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        label: "USD účet",
        currency: "USD",
        accountType: "local",
        accountNumber: "533368118325811",
        bankCode: null,
        bic: "TRWIUS35XXX",
        routingNumber: "084009519",
        isDefault: true
      }
    });

    const created = await request(app).post("/api/invoices").send({
      contactId: contact.id,
      bankAccountId: bankAccount.id,
      issueDate: "2026-02-23",
      dueDate: "2026-02-26",
      currency: "USD",
      items: [{ title: "Design work", quantity: 1, unit: "job", unitPrice: 700 }]
    });

    expect(created.status).toBe(201);

    const pdfResponse = await request(app).get(`/api/invoices/${created.body.id}/pdf?lang=en`);

    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers["content-type"]).toContain("application/pdf");
    expect(pdfResponse.body).toBeInstanceOf(Buffer);
    expect(pdfResponse.body.length).toBeGreaterThan(1000);
  });

  it("generates Czech CZK PDF with mondrian template and QR-compatible data", async () => {
    await prisma.settings.update({
      where: { id: "singleton" },
      data: { pdfTemplate: "mondrian" }
    });

    const contact = await prisma.contact.create({
      data: {
        name: "Český klient",
        street: "Jiráskova 12",
        city: "Praha",
        zip: "11000",
        country: "Česká republika",
        ico: "26340933",
        dic: "CZ26340933"
      }
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        label: "CZK účet",
        currency: "CZK",
        accountType: "local",
        accountNumber: "27-6226430297",
        bankCode: "0100",
        isDefault: true
      }
    });

    const created = await request(app).post("/api/invoices").send({
      contactId: contact.id,
      bankAccountId: bankAccount.id,
      issueDate: "2026-03-02",
      dueDate: "2026-03-05",
      currency: "CZK",
      items: [{ title: "Grafický návrh", quantity: 1, unit: "zakázka", unitPrice: 46990 }]
    });

    expect(created.status).toBe(201);

    const pdfResponse = await request(app).get(`/api/invoices/${created.body.id}/pdf?lang=cs`);

    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers["content-type"]).toContain("application/pdf");
    expect(pdfResponse.body).toBeInstanceOf(Buffer);
    expect(pdfResponse.body.length).toBeGreaterThan(1000);
  });

  it("returns contact detail including invoice history and saved invoice template", async () => {
    const contact = await prisma.contact.create({
      data: {
        name: "Historický kontakt",
        street: "Ulice 1",
        city: "Praha",
        zip: "11000",
        country: "Česká republika"
      }
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        label: "Hlavní účet",
        currency: "CZK",
        accountType: "local",
        accountNumber: "123456789",
        bankCode: "0100",
        isDefault: true
      }
    });

    await prisma.contactInvoiceTemplate.create({
      data: {
        contactId: contact.id,
        bankAccountId: bankAccount.id,
        currency: "CZK",
        note: "Stálá spolupráce",
        items: {
          create: [
            {
              title: "Paušál",
              quantity: 1,
              unit: "ks",
              unitPrice: 25000,
              sortOrder: 0
            }
          ]
        }
      }
    });

    await prisma.invoice.create({
      data: {
        invoiceNumber: "2026-01",
        variableSymbol: "202601",
        status: "issued",
        issueDate: new Date("2026-02-01T00:00:00.000Z"),
        dueDate: new Date("2026-02-04T00:00:00.000Z"),
        currency: "CZK",
        total: 25000,
        contactId: contact.id,
        bankAccountId: bankAccount.id,
        items: {
          create: [
            {
              title: "Paušál",
              quantity: 1,
              unit: "ks",
              unitPrice: 25000,
              lineTotal: 25000
            }
          ]
        }
      }
    });

    const response = await request(app).get(`/api/contacts/${contact.id}/detail`);

    expect(response.status).toBe(200);
    expect(response.body.contact).toMatchObject({
      id: contact.id,
      name: "Historický kontakt"
    });
    expect(response.body.invoiceTemplate).toMatchObject({
      bankAccountId: bankAccount.id,
      currency: "CZK",
      note: "Stálá spolupráce"
    });
    expect(response.body.invoiceTemplate.items).toEqual([
      expect.objectContaining({
        title: "Paušál",
        quantity: 1,
        unitPrice: 25000
      })
    ]);
    expect(response.body.invoices).toEqual([
      expect.objectContaining({
        invoiceNumber: "2026-01",
        bankAccountLabel: "Hlavní účet",
        status: "issued"
      })
    ]);
  });
});
