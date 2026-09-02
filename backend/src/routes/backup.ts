import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { asyncHandler, fail } from "../utils/http.js";

export const backupRouter = Router();

const DATABASE_FILENAME = "app.db";
const PDF_DIRNAME = "pdfs";
const currentFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(currentFile), "..", "..");
const prismaDir = path.resolve(backendRoot, "prisma");

function backupPath(backupId: string): string {
  return path.resolve(config.backupDir, backupId);
}

function validateBackupId(backupId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(backupId)) {
    fail(400, "BAD_REQUEST", "Neplatné ID zálohy.");
  }
  return backupId;
}

function nowBackupId(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function activeDatabasePath(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl?.startsWith("file:")) {
    const filePath = databaseUrl.slice("file:".length);
    return path.isAbsolute(filePath) ? filePath : path.resolve(prismaDir, filePath);
  }

  return path.resolve(config.dataDir, DATABASE_FILENAME);
}

async function createUniqueBackupDirectory(prefix?: string): Promise<{ backupId: string; destination: string }> {
  await fs.mkdir(config.backupDir, { recursive: true });

  const baseId = prefix ? `${prefix}-${nowBackupId()}` : nowBackupId();
  for (let index = 0; index < 100; index += 1) {
    const backupId = index === 0 ? baseId : `${baseId}-${index + 1}`;
    const destination = backupPath(backupId);
    try {
      await fs.mkdir(destination);
      return { backupId, destination };
    } catch (error) {
      if (!isNotFound(error) && typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to create a unique backup directory");
}

async function copyPdfDirectoryIfPresent(sourceDir: string, destinationDir: string): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  try {
    await fs.cp(sourceDir, destinationDir, { recursive: true });
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
}

async function createBackupSnapshot(params: {
  includePdfs: boolean;
  idPrefix?: string;
}): Promise<{ backupId: string; createdAt: string; includePdfs: boolean }> {
  const { backupId, destination } = await createUniqueBackupDirectory(params.idPrefix);
  const sourceDb = activeDatabasePath();

  await fs.copyFile(sourceDb, path.resolve(destination, DATABASE_FILENAME));

  if (params.includePdfs) {
    await copyPdfDirectoryIfPresent(config.pdfOutputDir, path.resolve(destination, PDF_DIRNAME));
  }

  return {
    backupId,
    createdAt: new Date().toISOString(),
    includePdfs: params.includePdfs
  };
}

async function replaceFileFromSource(sourceFile: string, targetFile: string): Promise<void> {
  await fs.mkdir(path.dirname(targetFile), { recursive: true });

  const suffix = `${process.pid}-${Date.now()}`;
  const nextFile = path.resolve(path.dirname(targetFile), `.${path.basename(targetFile)}.restore-next-${suffix}`);
  const oldFile = path.resolve(path.dirname(targetFile), `.${path.basename(targetFile)}.restore-old-${suffix}`);
  let movedCurrent = false;

  try {
    await fs.copyFile(sourceFile, nextFile);

    try {
      await fs.rename(targetFile, oldFile);
      movedCurrent = true;
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    try {
      await fs.rename(nextFile, targetFile);
    } catch (error) {
      if (movedCurrent) {
        await fs.rename(oldFile, targetFile).catch(() => undefined);
      }
      throw error;
    }

    if (movedCurrent) {
      await fs.rm(oldFile, { force: true });
    }
  } finally {
    await fs.rm(nextFile, { force: true }).catch(() => undefined);
    if (movedCurrent) {
      await fs.rm(oldFile, { force: true }).catch(() => undefined);
    }
  }
}

async function replaceDirectoryFromSource(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });

  const suffix = `${process.pid}-${Date.now()}`;
  const nextDir = path.resolve(path.dirname(targetDir), `.${path.basename(targetDir)}.restore-next-${suffix}`);
  const oldDir = path.resolve(path.dirname(targetDir), `.${path.basename(targetDir)}.restore-old-${suffix}`);
  let movedCurrent = false;

  try {
    await fs.rm(nextDir, { recursive: true, force: true });
    await fs.mkdir(nextDir, { recursive: true });

    try {
      await fs.cp(sourceDir, nextDir, { recursive: true });
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    try {
      await fs.rename(targetDir, oldDir);
      movedCurrent = true;
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    try {
      await fs.rename(nextDir, targetDir);
    } catch (error) {
      if (movedCurrent) {
        await fs.rename(oldDir, targetDir).catch(() => undefined);
      }
      throw error;
    }

    if (movedCurrent) {
      await fs.rm(oldDir, { recursive: true, force: true });
    }
  } finally {
    await fs.rm(nextDir, { recursive: true, force: true }).catch(() => undefined);
    if (movedCurrent) {
      await fs.rm(oldDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

backupRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    await fs.mkdir(config.backupDir, { recursive: true });
    const entries = await fs.readdir(config.backupDir, { withFileTypes: true });
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const fullPath = backupPath(entry.name);
          const stat = await fs.stat(fullPath);
          return {
            id: entry.name,
            createdAt: stat.birthtime.toISOString()
          };
        })
    );

    backups.sort((a, b) => b.id.localeCompare(a.id));
    res.json(backups);
  })
);

backupRouter.post(
  "/export",
  asyncHandler(async (req, res) => {
    const includePdfs = req.body?.includePdfs !== false;
    const backup = await createBackupSnapshot({ includePdfs });

    res.status(201).json({
      id: backup.backupId,
      createdAt: backup.createdAt,
      includePdfs: backup.includePdfs
    });
  })
);

backupRouter.post(
  "/import",
  asyncHandler(async (req, res) => {
    const backupId = typeof req.body?.backupId === "string" ? req.body.backupId.trim() : "";
    if (!backupId) {
      fail(400, "BAD_REQUEST", "Parametr 'backupId' je povinný.");
    }
    const safeBackupId = validateBackupId(backupId);

    const sourceDir = backupPath(safeBackupId);
    const sourceDb = path.resolve(sourceDir, DATABASE_FILENAME);
    const sourcePdfs = path.resolve(sourceDir, PDF_DIRNAME);
    const targetDb = activeDatabasePath();

    try {
      await fs.access(sourceDb);
    } catch {
      fail(404, "NOT_FOUND", "Požadovaná záloha nebyla nalezena.");
    }

    const includePdfs = req.body?.includePdfs !== false;
    let safetyBackupId: string | null = null;

    try {
      await prisma.$disconnect();
      const safetyBackup = await createBackupSnapshot({
        includePdfs,
        idPrefix: "pre-restore"
      });
      safetyBackupId = safetyBackup.backupId;

      await replaceFileFromSource(sourceDb, targetDb);

      if (includePdfs) {
        await replaceDirectoryFromSource(sourcePdfs, config.pdfOutputDir);
      }
    } catch {
      fail(500, "INTERNAL_ERROR", "Obnovení zálohy selhalo.");
    } finally {
      await prisma.$connect();
    }

    res.json({
      ok: true,
      restoredBackupId: safeBackupId,
      safetyBackupId,
      includePdfs
    });
  })
);

backupRouter.delete(
  "/:backupId",
  asyncHandler(async (req, res) => {
    const backupId = typeof req.params.backupId === "string" ? req.params.backupId.trim() : "";
    if (!backupId) {
      fail(400, "BAD_REQUEST", "Parametr 'backupId' je povinný.");
    }

    const safeBackupId = validateBackupId(backupId);
    const targetDir = backupPath(safeBackupId);

    try {
      await fs.access(targetDir);
    } catch {
      fail(404, "NOT_FOUND", "Požadovaná záloha nebyla nalezena.");
    }

    try {
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch {
      fail(500, "INTERNAL_ERROR", "Smazání zálohy selhalo.");
    }

    res.status(204).send();
  })
);
