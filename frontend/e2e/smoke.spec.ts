import { expect, test } from "@playwright/test";

const emptyStats = {
  year: 2026,
  totalInvoiced: 0,
  totalPaid: 0,
  outstanding: 0,
  invoiceCount: 0,
  totalInvoicedCombinedCzk: 0,
  currencyTotals: {
    CZK: {
      totalInvoiced: 0,
      totalPaid: 0,
      outstanding: 0,
      invoiceCount: 0
    },
    USD: {
      totalInvoiced: 0,
      totalPaid: 0,
      outstanding: 0,
      invoiceCount: 0,
      convertedToCzk: {
        rateDate: null,
        rateCzk: null,
        totalInvoiced: 0,
        totalPaid: 0,
        outstanding: 0
      }
    }
  },
  lastInvoices: [],
  monthlyTotals: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, total: 0 })),
  monthlyCurrencyTotals: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    czk: 0,
    usd: 0,
    usdConvertedCzk: 0,
    totalConvertedCzk: 0
  }))
};

const currentMarketStats = {
  rates: {
    USD: {
      rateCzk: 23.45,
      rateDate: "2026-03-26"
    },
    EUR: {
      rateCzk: 25.12,
      rateDate: "2026-03-26"
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
      USD: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, "0")}`,
        valueCzk: 22.8 + index * 0.02,
        rateDate: `2026-03-${String(index + 1).padStart(2, "0")}`
      })),
      EUR: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, "0")}`,
        valueCzk: 24.6 + index * 0.015,
        rateDate: `2026-03-${String(index + 1).padStart(2, "0")}`
      }))
    },
    statistics: {
      medianWageCzk: [
        { month: "2024-01", valueCzk: 34908, sourcePeriod: "1. čtvrtletí 2024" },
        { month: "2024-04", valueCzk: 35812, sourcePeriod: "2. čtvrtletí 2024" },
        { month: "2024-07", valueCzk: 36250, sourcePeriod: "3. čtvrtletí 2024" },
        { month: "2024-10", valueCzk: 37104, sourcePeriod: "4. čtvrtletí 2024" },
        { month: "2025-01", valueCzk: 38385, sourcePeriod: "1. čtvrtletí 2025" },
        { month: "2025-04", valueCzk: 42890, sourcePeriod: "2. čtvrtletí 2025" },
        { month: "2025-07", valueCzk: 44101, sourcePeriod: "3. čtvrtletí 2025" },
        { month: "2025-10", valueCzk: 45523, sourcePeriod: "4. čtvrtletí 2025" }
      ],
      averageWageCzk: [
        { month: "2024-01", valueCzk: 42955, sourcePeriod: "1. čtvrtletí 2024" },
        { month: "2024-04", valueCzk: 43480, sourcePeriod: "2. čtvrtletí 2024" },
        { month: "2024-07", valueCzk: 44210, sourcePeriod: "3. čtvrtletí 2024" },
        { month: "2024-10", valueCzk: 45678, sourcePeriod: "4. čtvrtletí 2024" },
        { month: "2025-01", valueCzk: 46924, sourcePeriod: "1. čtvrtletí 2025" },
        { month: "2025-04", valueCzk: 49877, sourcePeriod: "2. čtvrtletí 2025" },
        { month: "2025-07", valueCzk: 51212, sourcePeriod: "3. čtvrtletí 2025" },
        { month: "2025-10", valueCzk: 52283, sourcePeriod: "4. čtvrtletí 2025" }
      ]
    }
  },
  fetchedAt: new Date().toISOString()
};

test.beforeEach(async ({ page }) => {
  await page.route("http://localhost:3001/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathname = requestUrl.pathname;

    if (pathname === "/api/stats") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyStats)
      });
      return;
    }

    if (pathname === "/api/stats/current-market") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentMarketStats)
      });
      return;
    }

    if (pathname === "/api/contacts") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
      return;
    }

    if (pathname === "/api/invoices") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
      return;
    }

    if (pathname === "/api/settings") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "singleton",
          supplierName: "Invoicee",
          supplierStreet: "Ulice 1",
          supplierCity: "Praha",
          supplierZip: "11000",
          supplierCountry: "Česká republika",
          supplierICO: null,
          supplierEmail: null,
          supplierPhone: null,
          defaultDueDays: 3,
          invoiceNumberFormat: "YYYY-NN",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      });
      return;
    }

    if (pathname === "/api/bank-accounts") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
      return;
    }

    if (pathname === "/api/backup") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });
});

test("navigates through key pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Přehled", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kurzy a statistiky", exact: true })).toBeVisible();
  await expect(page.getByText("Kurz CZK/USD")).toBeVisible();
  await expect(page.getByText("Kurz CZK/EUR")).toBeVisible();
  await expect(page.getByText("Mediánová mzda v ČR")).toBeVisible();
  await expect(page.getByText("Průměrná hrubá mzda v ČR")).toBeVisible();
  await expect(page.locator(".market-sparkline")).toHaveCount(4);
  await expect(page.locator(".market-stat-card").filter({ hasText: "Mediánová mzda v ČR" })).toContainText("ČSÚ, za 4. čtvrtletí 2025");

  await page.getByRole("link", { name: "Faktury" }).click();
  await expect(page.getByRole("heading", { name: "Faktury", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Kontakty" }).click();
  await expect(page.getByRole("heading", { name: "Kontakty", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Nastavení" }).click();
  await expect(page.getByRole("heading", { name: "Nastavení", exact: true })).toBeVisible();
});

test("shows the last known median when the latest CZSO article has no median", async ({ page }) => {
  await page.route("http://localhost:3001/api/stats/current-market", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...currentMarketStats,
        statistics: {
          ...currentMarketStats.statistics,
          medianWageCzk: null,
          medianWagePeriod: null,
          averageWageCzk: 51966,
          averageWagePeriod: "2. čtvrtletí 2026"
        }
      })
    });
  });

  await page.goto("/");

  const medianCard = page.locator(".market-stat-card").filter({ hasText: "Mediánová mzda v ČR" });
  await expect(medianCard).toContainText(/45\s?523,00\s?Kč/);
  await expect(medianCard).toContainText("ČSÚ, za 4. čtvrtletí 2025");
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`selects and retains Classic Rows at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let settings = {
      id: "singleton", supplierName: "Invoicee", supplierStreet: "Ulice 1", supplierCity: "Praha", supplierZip: "11000", supplierCountry: "Česká republika", supplierICO: null, supplierEmail: null, supplierPhone: null, defaultDueDays: 3, invoiceNumberFormat: "YYYY-NN", pdfTemplate: "classic"
    };
    await page.route("http://localhost:3001/api/settings", async route => {
      if (route.request().method() === "PUT") settings = { ...settings, ...route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) });
    });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Nastavení", exact: true })).toBeVisible();
    const select = page.getByLabel("PDF šablona");
    await select.selectOption("classic_rows");
    await page.getByRole("button", { name: "Uložit údaje dodavatele" }).click();
    await expect.poll(() => settings.pdfTemplate).toBe("classic_rows");
    await page.reload();
    await expect(select).toHaveValue("classic_rows");
    await select.focus();
    await expect(select).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await select.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/invoicee-classic-rows/settings-${viewport.width}.png` });
  });
}
