import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { bankAccountsRouter } from "./routes/bankAccounts.js";
import { backupRouter } from "./routes/backup.js";
import { contactsRouter } from "./routes/contacts.js";
import { invoicesRouter } from "./routes/invoices.js";
import { gmailRouter } from "./routes/gmail.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";
import { statsRouter } from "./routes/stats.js";
import { handleError } from "./utils/http.js";

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(
    config.corsAllowedOrigins.length > 0
      ? config.corsAllowedOrigins
      : [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:5174",
          "http://127.0.0.1:5174"
        ]
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS origin not allowed: ${origin}`));
      }
    })
  );
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/contacts", contactsRouter);
  app.use("/api/bank-accounts", bankAccountsRouter);
  app.use("/api/invoices", invoicesRouter);
  app.use("/api/gmail", gmailRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/backup", backupRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (process.env.NODE_ENV !== "test") {
      console.error("Unhandled request error", {
        requestId: res.locals?.requestId,
        err
      });
    }
    handleError(err, res);
  });

  app.use((_req, res) => {
    res.status(404).json({
      message: "Požadovaná cesta nebyla nalezena.",
      code: "NOT_FOUND",
      ...(typeof res.locals?.requestId === "string" ? { requestId: res.locals.requestId } : {})
    });
  });

  return app;
}
