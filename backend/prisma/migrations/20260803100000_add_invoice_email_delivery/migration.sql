ALTER TABLE "Invoice" ADD COLUMN "emailSentAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "emailSentTo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "emailMessageId" TEXT;
