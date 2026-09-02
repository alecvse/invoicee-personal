export interface ContactLookupResult {
  ico: string;
  name: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  dic: string | null;
}

export class AresLookupError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ARES_TIMEOUT_MS = 5000;
const ARES_SUBJECT_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeZip(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/\s+/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function pickAddressCandidate(data: Record<string, unknown>): Record<string, unknown> | null {
  const direct = asRecord(data.sidlo) ?? asRecord(data.adresa);
  if (direct) {
    return direct;
  }

  const addresses = Array.isArray(data.adresy) ? data.adresy : [];
  for (const entry of addresses) {
    const record = asRecord(entry);
    if (record) {
      return record;
    }
  }

  return null;
}

function composeStreet(address: Record<string, unknown> | null): string | null {
  if (!address) {
    return null;
  }

  const streetName =
    textOrNull(address.nazevUlice) ??
    textOrNull(address.ulice) ??
    textOrNull(address.nazevCastiObce) ??
    textOrNull(address.castObce);

  const houseNumber =
    textOrNull(address.cisloDomovni) ??
    textOrNull(address.cisloPopisne) ??
    textOrNull(address.cisloDomovniText);

  const orientation = textOrNull(address.cisloOrientacni) ?? textOrNull(address.cisloOrientacniPismeno);

  const number = houseNumber && orientation ? `${houseNumber}/${orientation}` : houseNumber ?? orientation;
  const merged = [streetName, number].filter((part): part is string => Boolean(part)).join(" ");
  return textOrNull(merged);
}

export function normalizeIco(input: string): string {
  return input.replace(/\D+/g, "");
}

export function validateIcoFormat(ico: string): boolean {
  return /^\d{8}$/.test(ico);
}

export async function fetchAresSubject(inputIco: string): Promise<ContactLookupResult> {
  const ico = normalizeIco(inputIco);
  if (!validateIcoFormat(ico)) {
    throw new AresLookupError(400, "Neplatné IČ.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARES_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${ARES_SUBJECT_URL}/${encodeURIComponent(ico)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } catch {
    throw new AresLookupError(502, "Nelze načíst data z registru, zkuste to prosím později.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new AresLookupError(404, "IČ nebylo v registru nalezeno.");
  }

  if (!response.ok) {
    throw new AresLookupError(502, "Nelze načíst data z registru, zkuste to prosím později.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AresLookupError(502, "Nelze načíst data z registru, zkuste to prosím později.");
  }

  const data = asRecord(payload);
  if (!data) {
    throw new AresLookupError(502, "Nelze načíst data z registru, zkuste to prosím později.");
  }

  const address = pickAddressCandidate(data);
  const result: ContactLookupResult = {
    ico,
    name: textOrNull(data.obchodniJmeno) ?? textOrNull(data.obchodniFirma) ?? textOrNull(data.nazev),
    street: composeStreet(address),
    city:
      textOrNull(address?.nazevObce) ??
      textOrNull(address?.obec) ??
      textOrNull(address?.nazevMestskeCasti),
    zip: normalizeZip(textOrNull(address?.psc) ?? textOrNull(address?.postalCode)),
    country: textOrNull(address?.nazevStatu) ?? "Česká republika",
    dic: textOrNull(data.dic) ?? textOrNull(data.danoveIdentifikacniCislo)
  };

  return result;
}
