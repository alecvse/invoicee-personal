import { Router } from "express";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { contactInvoiceTemplateSchema, contactSchema } from "../validation.js";
import { asyncHandler, fail, singleValue } from "../utils/http.js";
import { AresLookupError, fetchAresSubject } from "../services/aresService.js";
import { toNumber } from "../utils/decimal.js";

export const contactsRouter = Router();

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function invoiceDerivedStatus(status: InvoiceStatus, dueDate: Date): InvoiceStatus | "overdue" {
  if (status === "draft") {
    return "draft";
  }

  if (status === "paid") {
    return "paid";
  }

  if (dueDate.getTime() < startOfTodayUtc().getTime()) {
    return "overdue";
  }

  return status;
}

contactsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const contacts = await prisma.contact.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json(contacts);
  })
);

contactsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = contactSchema.parse(req.body);
    const contact = await prisma.contact.create({
      data: {
        ...data,
        email: data.email || null
      }
    });

    res.status(201).json(contact);
  })
);

contactsRouter.get(
  "/lookup",
  asyncHandler(async (req, res) => {
    const icoParam = singleValue(req.query.ico);
    if (typeof icoParam !== "string" || icoParam.trim().length === 0) {
      fail(400, "BAD_REQUEST", "Neplatné IČ.");
    }

    try {
      const result = await fetchAresSubject(icoParam);
      res.json(result);
    } catch (error) {
      if (error instanceof AresLookupError) {
        fail(
          error.statusCode,
          error.statusCode === 404 ? "NOT_FOUND" : error.statusCode === 400 ? "BAD_REQUEST" : "UPSTREAM_UNAVAILABLE",
          error.message
        );
      }

      fail(502, "UPSTREAM_UNAVAILABLE", "Nelze načíst data z registru, zkuste to prosím později.");
    }
  })
);

contactsRouter.get(
  "/:id/last-invoice-template",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID kontaktu.");
    }

    const contact = await prisma.contact.findUnique({
      where: { id }
    });

    if (!contact) {
      fail(404, "NOT_FOUND", "Kontakt nebyl nalezen.");
    }

    const invoice = await prisma.invoice.findFirst({
      where: { contactId: id },
      include: {
        items: true
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
    });

    if (!invoice) {
      res.json({
        contactId: id,
        template: null
      });
      return;
    }

    res.json({
      contactId: id,
      template: {
        currency: invoice.currency,
        note: invoice.note,
        bankAccountId: invoice.bankAccountId,
        items: invoice.items.map((item) => ({
          title: item.title,
          quantity: toNumber(item.quantity),
          unit: item.unit,
          unitPrice: toNumber(item.unitPrice)
        }))
      }
    });
  })
);

contactsRouter.get(
  "/:id/detail",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID kontaktu.");
    }

    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        invoiceTemplate: {
          include: {
            items: {
              orderBy: { sortOrder: "asc" }
            }
          }
        },
        invoices: {
          include: {
            bankAccount: true
          },
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
        }
      }
    });

    if (!contact) {
      fail(404, "NOT_FOUND", "Kontakt nebyl nalezen.");
    }

    res.json({
      contact: {
        ...contact,
        invoiceTemplate: undefined,
        invoices: undefined
      },
      invoiceTemplate: contact.invoiceTemplate
        ? {
            id: contact.invoiceTemplate.id,
            bankAccountId: contact.invoiceTemplate.bankAccountId,
            currency: contact.invoiceTemplate.currency,
            note: contact.invoiceTemplate.note,
            items: contact.invoiceTemplate.items.map((item) => ({
              id: item.id,
              title: item.title,
              quantity: toNumber(item.quantity),
              unit: item.unit,
              unitPrice: toNumber(item.unitPrice)
            }))
          }
        : null,
      invoices: contact.invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? "Koncept",
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
        total: toNumber(invoice.total),
        currency: invoice.currency,
        bankAccountLabel: invoice.bankAccount.label,
        status: invoice.status,
        statusDisplay: invoiceDerivedStatus(invoice.status, invoice.dueDate)
      }))
    });
  })
);

contactsRouter.put(
  "/:id/invoice-template",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID kontaktu.");
    }

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      fail(404, "NOT_FOUND", "Kontakt nebyl nalezen.");
    }

    const data = contactInvoiceTemplateSchema.parse(req.body);

    if (data.bankAccountId) {
      const bankAccount = await prisma.bankAccount.findUnique({ where: { id: data.bankAccountId } });
      if (!bankAccount) {
        fail(400, "BAD_REQUEST", "Bankovní účet neexistuje.");
      }
    }

    const template = await prisma.$transaction(async (tx) => {
      const existing = await tx.contactInvoiceTemplate.findUnique({
        where: { contactId: id },
        select: { id: true }
      });

      const upserted = existing
        ? await tx.contactInvoiceTemplate.update({
            where: { contactId: id },
            data: {
              bankAccountId: data.bankAccountId || null,
              currency: data.currency?.trim() || null,
              note: data.note?.trim() || null
            }
          })
        : await tx.contactInvoiceTemplate.create({
            data: {
              contactId: id,
              bankAccountId: data.bankAccountId || null,
              currency: data.currency?.trim() || null,
              note: data.note?.trim() || null
            }
          });

      await tx.contactInvoiceTemplateItem.deleteMany({
        where: { templateId: upserted.id }
      });

      if (data.items.length > 0) {
        await tx.contactInvoiceTemplateItem.createMany({
          data: data.items.map((item, index) => ({
            templateId: upserted.id,
            title: item.title.trim(),
            quantity: new Prisma.Decimal(item.quantity.toFixed(2)),
            unit: item.unit.trim(),
            unitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2)),
            sortOrder: index
          }))
        });
      }

      return tx.contactInvoiceTemplate.findUniqueOrThrow({
        where: { id: upserted.id },
        include: {
          items: {
            orderBy: { sortOrder: "asc" }
          }
        }
      });
    });

    res.json({
      id: template.id,
      bankAccountId: template.bankAccountId,
      currency: template.currency,
      note: template.note,
      items: template.items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: toNumber(item.quantity),
        unit: item.unit,
        unitPrice: toNumber(item.unitPrice)
      }))
    });
  })
);

contactsRouter.get(
  "/:id/invoice-template",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID kontaktu.");
    }

    const template = await prisma.contactInvoiceTemplate.findUnique({
      where: { contactId: id },
      include: {
        items: {
          orderBy: { sortOrder: "asc" }
        }
      }
    });

    if (!template) {
      res.json({
        id: null,
        bankAccountId: null,
        currency: null,
        note: null,
        items: []
      });
      return;
    }

    res.json({
      id: template.id,
      bankAccountId: template.bankAccountId,
      currency: template.currency,
      note: template.note,
      items: template.items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: toNumber(item.quantity),
        unit: item.unit,
        unitPrice: toNumber(item.unitPrice)
      }))
    });
  })
);

contactsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID kontaktu.");
    }

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      fail(404, "NOT_FOUND", "Kontakt nebyl nalezen.");
    }

    res.json(contact);
  })
);

contactsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID kontaktu.");
    }

    const data = contactSchema.parse(req.body);

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...data,
        email: data.email || null
      }
    });

    res.json(contact);
  })
);

contactsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = singleValue(req.params.id);
    if (!id) {
      fail(400, "BAD_REQUEST", "Neplatné ID kontaktu.");
    }

    try {
      await prisma.contact.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        fail(409, "CONFLICT", "Nelze smazat kontakt s vystavenou fakturou.");
      }

      throw error;
    }

    res.status(204).send();
  })
);
