import { Router } from "express";
import { ensureSettings } from "../services/settingsService.js";
import { prisma } from "../prisma.js";
import { settingsSchema } from "../validation.js";
import { asyncHandler } from "../utils/http.js";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await ensureSettings();
    res.json(settings);
  })
);

settingsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = settingsSchema.parse(req.body);
    const fixedData = {
      ...data,
      defaultDueDays: 3,
      invoiceNumberFormat: "YYYY-NN" as const
    };

    const settings = await prisma.settings.upsert({
      where: { id: "singleton" },
      update: {
        ...fixedData,
        supplierEmail: fixedData.supplierEmail || null
      },
      create: {
        id: "singleton",
        ...fixedData,
        supplierEmail: fixedData.supplierEmail || null
      }
    });

    res.json(settings);
  })
);
