import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`saves an invoice PDF template and can return to the default at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const contact = { id: "client", name: "Ukázkový klient", street: "Ulice 1", city: "Praha", zip: "11000", country: "Česká republika", ico: null, dic: null, email: null, phone: null };
    const account = { id: "bank", label: "CZK účet", currency: "CZK", accountType: "local", accountNumber: "123456", bankCode: "0100", isDefault: true };
    let invoice = {
      id: "sample", invoiceNumber: "2026-01", variableSymbol: "202601", status: "issued", statusDisplay: "issued", issueDate: "2026-10-01", dueDate: "2026-10-04", currency: "CZK", note: null, pdfTemplate: null as string | null, contactId: contact.id, bankAccountId: account.id, contact, bankAccount: account, total: 2000, paidAt: null, emailSentAt: null, items: [{ id: "item", title: "Design", quantity: 2, unit: "hod", unitPrice: 1000, lineTotal: 2000 }]
    };
    let rejectSave = true;
    await page.route("http://localhost:3001/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path === "/api/settings") body = { defaultDueDays: 3, pdfTemplate: "classic" };
      if (path === "/api/contacts") body = [contact];
      if (path === "/api/bank-accounts") body = [account];
      if (path.includes("last-invoice-template")) body = { contactId: contact.id, template: null };
      if (path.includes("invoice-template")) body = { bankAccountId: null, currency: null, note: null, items: [] };
      if (path === "/api/invoices/sample") {
        if (route.request().method() === "PUT") {
          if (rejectSave) {
            rejectSave = false;
            await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL_ERROR", message: "Testovací chyba uložení." }) });
            return;
          }
          invoice = { ...invoice, ...route.request().postDataJSON() };
        }
        body = invoice;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("/invoices/sample/edit");
    await expect(page.getByRole("heading", { name: "Upravit fakturu", exact: true })).toBeVisible();
    const select = page.getByLabel("PDF šablona");
    await expect(select).toHaveValue("");
    await expect(select.locator("option")).toHaveCount(3);
    await expect(select).not.toContainText("Mondrian");
    await select.selectOption("classic_rows");
    await page.getByRole("button", { name: "Uložit změny" }).click();
    await expect(page.getByText("Testovací chyba uložení.")).toBeVisible();
    await expect(select).toHaveValue("classic_rows");
    await page.getByRole("button", { name: "Uložit změny" }).click();
    await expect(page).toHaveURL(/\/invoices\/sample$/);
    expect(invoice.pdfTemplate).toBe("classic_rows");
    await page.goto("/invoices/sample/edit");
    await expect(select).toHaveValue("classic_rows");
    await select.focus();
    await expect(select).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await select.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/invoicee-classic-rows/invoice-edit-${width}.png` });
    await select.selectOption("");
    await page.getByRole("button", { name: "Uložit změny" }).click();
    await expect(page).toHaveURL(/\/invoices\/sample$/);
    expect(invoice.pdfTemplate).toBeNull();
    expect(invoice.total).toBe(2000);
    expect(errors).toEqual([]);
  });
}
