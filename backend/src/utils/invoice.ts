import type { Prisma } from "@prisma/client";

const INVOICE_NUMBER_REGEX = /^(\d{4})-(\d+)$/;

export function parseInvoiceSequence(invoiceNumber: string): { year: number; sequence: number } | null {
  const match = invoiceNumber.match(INVOICE_NUMBER_REGEX);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    sequence: Number(match[2])
  };
}

export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  issueDate: Date
): Promise<string> {
  const year = issueDate.getUTCFullYear();
  const prefix = `${year}-`;
  const records = await tx.invoice.findMany({
    where: { invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true }
  });

  const usedSequences = new Set<number>();
  let maxSequence = 0;

  for (const record of records) {
    if (!record.invoiceNumber) {
      continue;
    }

    const parsed = parseInvoiceSequence(record.invoiceNumber);
    if (!parsed || parsed.year !== year || parsed.sequence < 1) {
      continue;
    }

    usedSequences.add(parsed.sequence);
    if (parsed.sequence > maxSequence) {
      maxSequence = parsed.sequence;
    }
  }

  let nextSequence = 1;
  while (usedSequences.has(nextSequence)) {
    nextSequence += 1;
  }

  const nextSeqForBookkeeping = Math.max(maxSequence, nextSequence) + 1;
  await tx.invoiceSequence.upsert({
    where: { year },
    update: { nextSeq: nextSeqForBookkeeping },
    create: {
      year,
      nextSeq: nextSeqForBookkeeping
    }
  });

  const sequencePart = nextSequence < 100 ? String(nextSequence).padStart(2, "0") : String(nextSequence);
  return `${year}-${sequencePart}`;
}

export function variableSymbolFromInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.replace("-", "");
}
