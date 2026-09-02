import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(currentFile), "..");
const projectRoot = path.resolve(backendRoot, "..");

try {
  process.loadEnvFile(path.resolve(backendRoot, ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  pdfOutputDir: process.env.PDF_OUTPUT_DIR
    ? path.resolve(backendRoot, process.env.PDF_OUTPUT_DIR)
    : path.resolve(projectRoot, "data", "pdfs"),
  dataDir: path.resolve(projectRoot, "data"),
  backupDir: process.env.BACKUP_OUTPUT_DIR
    ? path.resolve(backendRoot, process.env.BACKUP_OUTPUT_DIR)
    : path.resolve(projectRoot, "data", "backups"),
  gmailClientId: process.env.GMAIL_CLIENT_ID?.trim() ?? "",
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET?.trim() ?? "",
  gmailRedirectUri:
    process.env.GMAIL_REDIRECT_URI?.trim() ?? "http://localhost:3001/api/gmail/oauth/callback",
  gmailFrontendUrl: process.env.GMAIL_FRONTEND_URL?.trim() ?? "http://localhost:5173",
  gmailTokenPath: process.env.GMAIL_TOKEN_PATH
    ? path.resolve(backendRoot, process.env.GMAIL_TOKEN_PATH)
    : path.resolve(projectRoot, "data", "gmail-auth.json"),
  corsAllowedOrigins:
    process.env.CORS_ALLOWED_ORIGINS
      ?.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0) ?? []
};
