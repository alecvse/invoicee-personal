import { Router } from "express";
import { prisma } from "../prisma.js";
import { bankAccountSchema } from "../validation.js";
import { asyncHandler, fail, singleValue } from "../utils/http.js";

export const bankAccountsRouter = Router();

async function clearDefaultIfNeeded(isDefault: boolean, excludedId?: string) {
  if (!isDefault) {
    return;
  }

  await prisma.bankAccount.updateMany({
    where: excludedId ? { id: { not: excludedId } } : {},
    data: { isDefault: false }
  });
}

bankAccountsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.bankAccount.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
    });
    res.json(rows);
  })
);

bankAccountsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = bankAccountSchema.parse(req.body);
    const normalizedCurrency = data.currency.trim().toUpperCase();
    const normalizedBic = data.bic?.trim() || null;
    const normalizedRoutingNumber = data.routingNumber?.trim() || null;
    await clearDefaultIfNeeded(Boolean(data.isDefault));

    const created = await prisma.bankAccount.create({
      data: {
        ...data,
        currency: normalizedCurrency,
        iban: data.accountType === "iban" ? data.iban?.trim() || null : null,
        bic: data.accountType === "iban" || normalizedCurrency === "USD" ? normalizedBic : null,
        routingNumber: normalizedCurrency === "USD" ? normalizedRoutingNumber : null,
        accountNumber: data.accountType === "local" ? data.accountNumber?.trim() || null : null,
        bankCode: data.accountType === "local" ? data.bankCode?.trim() || null : null
      }
    });

    res.status(201).json(created);
  })
);

bankAccountsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID bankovního účtu.");
    }

    const data = bankAccountSchema.parse(req.body);
    const normalizedCurrency = data.currency.trim().toUpperCase();
    const normalizedBic = data.bic?.trim() || null;
    const normalizedRoutingNumber = data.routingNumber?.trim() || null;
    await clearDefaultIfNeeded(Boolean(data.isDefault), id);

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: {
        ...data,
        currency: normalizedCurrency,
        iban: data.accountType === "iban" ? data.iban?.trim() || null : null,
        bic: data.accountType === "iban" || normalizedCurrency === "USD" ? normalizedBic : null,
        routingNumber: normalizedCurrency === "USD" ? normalizedRoutingNumber : null,
        accountNumber: data.accountType === "local" ? data.accountNumber?.trim() || null : null,
        bankCode: data.accountType === "local" ? data.bankCode?.trim() || null : null
      }
    });

    res.json(updated);
  })
);

bankAccountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID bankovního účtu.");
    }

    const hasInvoices = await prisma.invoice.count({
      where: { bankAccountId: id }
    });

    if (hasInvoices > 0) {
      fail(409, "CONFLICT", "Nelze smazat bankovní účet, který je použitý na fakturách.");
    }

    await prisma.bankAccount.delete({ where: { id } });
    res.status(204).send();
  })
);
