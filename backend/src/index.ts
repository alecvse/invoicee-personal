import fs from "node:fs/promises";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { ensureDatabaseSchema } from "./services/databaseInit.js";
import { ensureSettings } from "./services/settingsService.js";
import { prisma } from "./prisma.js";

async function bootstrap() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.pdfOutputDir, { recursive: true });
  await fs.mkdir(config.backupDir, { recursive: true });
  await ensureDatabaseSchema();
  await ensureSettings();

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${config.port} is already in use. Stop the running process and retry.`);
    } else {
      console.error("Backend server failed to start", error);
    }
    process.exit(1);
  });

  const shutdown = async () => {
    await prisma.$disconnect();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap()
  .catch(async (error) => {
    console.error("Failed to start backend", error);
    await prisma.$disconnect();
    process.exit(1);
  });
