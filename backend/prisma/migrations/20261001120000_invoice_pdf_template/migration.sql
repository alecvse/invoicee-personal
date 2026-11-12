ALTER TABLE "Invoice" ADD COLUMN "pdfTemplate" TEXT;
UPDATE "Settings" SET "pdfTemplate" = 'classic' WHERE "pdfTemplate" = 'mondrian';
