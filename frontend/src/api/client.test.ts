import { describe, expect, it } from "vitest";
import { resolveDevApiBaseOverride } from "./client";

const PAGE_ORIGIN = "http://localhost:5173";

describe("resolveDevApiBaseOverride", () => {
  it("allows local development API origins", () => {
    expect(resolveDevApiBaseOverride("http://localhost:3001/api", PAGE_ORIGIN)).toBe("http://localhost:3001/api");
    expect(resolveDevApiBaseOverride("http://127.0.0.1:3001/api/", PAGE_ORIGIN)).toBe("http://127.0.0.1:3001/api");
    expect(resolveDevApiBaseOverride("http://[::1]:3001/api", PAGE_ORIGIN)).toBe("http://[::1]:3001/api");
  });

  it("allows relative same-origin paths", () => {
    expect(resolveDevApiBaseOverride("/api", PAGE_ORIGIN)).toBe("/api");
    expect(resolveDevApiBaseOverride("/custom-api/", PAGE_ORIGIN)).toBe("/custom-api");
  });

  it("rejects remote origins and ambiguous URLs", () => {
    expect(resolveDevApiBaseOverride("https://example.com/api", PAGE_ORIGIN)).toBeNull();
    expect(resolveDevApiBaseOverride("//example.com/api", PAGE_ORIGIN)).toBeNull();
    expect(resolveDevApiBaseOverride("http://localhost:3001@evil.example/api", PAGE_ORIGIN)).toBeNull();
    expect(resolveDevApiBaseOverride("javascript:alert(1)", PAGE_ORIGIN)).toBeNull();
    expect(resolveDevApiBaseOverride("", PAGE_ORIGIN)).toBeNull();
  });
});
