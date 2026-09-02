-- SQLite stores Invoice.status as TEXT, so adding the Prisma enum value needs no table rewrite.
UPDATE "Invoice" SET "status" = 'sent' WHERE "emailSentAt" IS NOT NULL AND "status" = 'issued';
