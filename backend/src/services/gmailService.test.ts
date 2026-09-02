import { describe, expect, it } from "vitest";
import { buildMimeMessage } from "./gmailService.js";

describe("buildMimeMessage", () => {
  it("keeps UTF-8 subject and PDF attachment in one MIME message", () => {
    const mime = buildMimeMessage({
      from: "sender@gmail.com",
      to: "client@example.com",
      subject: "Faktura č. 1",
      body: "Dobrý den",
      filename: "2026-01_cs.pdf",
      pdfBytes: Buffer.from("%PDF-test")
    });

    expect(mime).toContain(`Subject: =?UTF-8?B?${Buffer.from("Faktura č. 1").toString("base64")}?=`);
    expect(mime).toContain("Content-Type: application/pdf");
    expect(mime).toContain(Buffer.from("%PDF-test").toString("base64"));
    expect(mime).toContain("Dobrý den");
  });
});
