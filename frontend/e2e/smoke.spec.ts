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

  await page.getByRole("link", { name: "Faktury" }).click();
  await expect(page.getByRole("heading", { name: "Faktury", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Kontakty" }).click();
  await expect(page.getByRole("heading", { name: "Kontakty", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Nastavení" }).click();
  await expect(page.getByRole("heading", { name: "Nastavení", exact: true })).toBeVisible();
});
