import { toNumber } from "../../utils/decimal.js";
import { classicColors, classicPage, currency, drawRule, type InvoiceForPdf, type Lang } from "./shared.js";

export const rowsPageBottom = 780;

// Keep the same typography and rules as Classic; reserve the bottom for its footer.
export function drawClassicRows(params: {
  doc: PDFKit.PDFDocument;
  invoice: InvoiceForPdf;
  lang: Lang;
  startY: number;
  newPage: () => void;
}): number {
  const { doc, invoice, lang, newPage } = params;
  const headings = lang === "cs"
    ? ["Položka", "Cena za položku"]
    : ["Item", "Item price"];
  const columns = [
    { x: classicPage.left, width: 365, align: "left" as const },
    { x: 415, width: 150, align: "right" as const }
  ];
  const font = () => doc.font("AppRegular").fontSize(10).fillColor(classicColors.slate960);
  const height = (text: string, index: number) => {
    font();
    return doc.heightOfString(text, { width: columns[index].width, lineGap: 2 });
  };
  const header = (top: number): number => {
    doc.font("AppExtraBold").fontSize(9).fillColor(classicColors.slate960);
    headings.forEach((text, index) => doc.text(text, columns[index].x, top, { ...columns[index], lineGap: 2 }));
    return top + 20;
  };
  let y = header(params.startY);
  const nextPage = () => {
    newPage();
    y = header(140);
  };

  for (const item of invoice.items) {
    const values = [item.title, currency(toNumber(item.lineTotal), invoice.currency)];
    const rowHeight = Math.max(...values.map(height)) + 20;
    if (y + rowHeight > rowsPageBottom) nextPage();

    // Very long descriptions can span pages. The item price appears once, alongside the first segment.
    let remaining = item.title;
    let firstSegment = true;
    do {
      const availableHeight = rowsPageBottom - y - 20;
      let segment = remaining;
      if (height(segment, 0) > availableHeight) {
        let low = 1;
        let high = segment.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (height(segment.slice(0, middle), 0) <= availableHeight) low = middle;
          else high = middle - 1;
        }
        const wordEnd = segment.lastIndexOf(" ", low);
        const splitAt = wordEnd > 0 ? wordEnd : low;
        segment = remaining.slice(0, splitAt);
      }
      const cells = [segment, ...values.slice(1).map(value => firstSegment ? value : "")];
      const segmentHeight = Math.max(...cells.map(height)) + 20;
      font();
      cells.forEach((text, index) => doc.text(text, columns[index].x, y, { ...columns[index], lineGap: 2 }));
      y += segmentHeight;
      remaining = remaining.slice(segment.length).trimStart();
      if (item !== invoice.items[invoice.items.length - 1] || remaining) {
        drawRule(doc, y - 10, classicPage.left, classicPage.right, "#CBD5E1", 0.5);
      }
      firstSegment = false;
      if (remaining) nextPage();
    } while (remaining);
  }
  return y;
}
