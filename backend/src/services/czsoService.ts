const CZSO_RSS_URL = "https://csu.gov.cz/rss/produkty?kodVlastnostiVystupu=RI&jazyk=CS";
const FETCH_TIMEOUT_MS = 8000;
const WAGE_ARTICLE_PREFIX = "Průměrné mzdy -";
const REQUIRED_WAGE_ARTICLE_COUNT = 8;

type CurrentStatistic<T> = {
  value: T | null;
  period: string | null;
};

type RssItem = {
  title: string;
  link: string;
  description: string;
};

export type WageArticlePayload = {
  item: RssItem;
  html: string;
  averageWageCzk: number | null;
  medianWageCzk: number | null;
  period: string | null;
};

export type WageHistoryPoint = {
  month: string;
  valueCzk: number;
  sourcePeriod: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u00a0/g, " ");
}

function normalizeWhitespace(value: string): string {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function parseIntegerWithSpaces(rawValue: string): number | null {
  const normalized = rawValue.replace(/\s+/g, "");
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/plain, text/html, application/rss+xml, application/xml"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractTagValues(xml: string, tagName: string): string[] {
  const matches = Array.from(xml.matchAll(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "g")));
  return matches.map((match) => normalizeWhitespace(match[1] ?? ""));
}

function parseRssItems(xml: string): RssItem[] {
  const itemMatches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g));

  return itemMatches.map((match) => {
    const itemXml = match[1] ?? "";
    const [title = ""] = extractTagValues(itemXml, "title");
    const [link = ""] = extractTagValues(itemXml, "link");
    const [description = ""] = extractTagValues(itemXml, "description");

    return { title, link, description };
  });
}

function stripHtmlToText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function isWageArticle(item: RssItem): boolean {
  return item.title.includes(WAGE_ARTICLE_PREFIX);
}

function normalizeArticleUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `https://csu.gov.cz${trimmed}`;
  }

  return `https://csu.gov.cz/${trimmed.replace(/^\.?\//, "")}`;
}

function isWageArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "csu.gov.cz" && /^\/rychle-informace\/prumerne-mzdy-[^/]+$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractWagePeriod(title: string): string | null {
  const normalizedTitle = normalizeWhitespace(title);
  const stripped = normalizedTitle.replace(/^\d{2}\.\s\d{2}\.\s\d{4}\s+/u, "");
  if (!stripped.startsWith(WAGE_ARTICLE_PREFIX)) {
    return null;
  }
  return normalizeWhitespace(stripped.replace(`${WAGE_ARTICLE_PREFIX}`, ""));
}

function parseQuarterPeriod(value: string | null): { quarter: number; year: number } | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)\.\s*čtvrtletí\s+(\d{4})/i);
  if (!match) {
    return null;
  }

  const quarter = Number(match[1]);
  const year = Number(match[2]);

  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4 || !Number.isInteger(year)) {
    return null;
  }

  return { quarter, year };
}

function startOfQuarterUtc(period: { quarter: number; year: number }): Date {
  return new Date(Date.UTC(period.year, (period.quarter - 1) * 3, 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sortWageArticlesDesc(left: WageArticlePayload, right: WageArticlePayload): number {
  const leftPeriod = parseQuarterPeriod(left.period);
  const rightPeriod = parseQuarterPeriod(right.period);

  if (!leftPeriod && !rightPeriod) {
    return 0;
  }

  if (!leftPeriod) {
    return 1;
  }

  if (!rightPeriod) {
    return -1;
  }

  if (leftPeriod.year !== rightPeriod.year) {
    return rightPeriod.year - leftPeriod.year;
  }

  return rightPeriod.quarter - leftPeriod.quarter;
}

function parseArchiveArticleUrls(html: string): string[] {
  const matches = Array.from(html.matchAll(/href="([^"]*prumerne-mzdy-[^"]*)"/gi));
  const urls = matches
    .map((match) => normalizeArticleUrl(decodeHtml(match[1] ?? "")))
    .filter((value): value is string => Boolean(value && isWageArticleUrl(value)));

  return Array.from(new Set(urls));
}

function parseWageFromArticle(html: string, fallbackPeriod: string | null): CurrentStatistic<number> {
  const text = stripHtmlToText(html);
  const amountMatch =
    text.match(/průměrná hrubá měsíční nominální mzda.*?(?:celkem|na)\s+([\d\s]+)\s*Kč/i) ??
    text.match(/průměrná mzda.*?(?:celkem|na)\s+([\d\s]+)\s*Kč/i);
  const periodMatch = text.match(/Ve\s+(\d+\.\s*čtvrtletí\s+\d{4})/i);

  return {
    value: amountMatch ? parseIntegerWithSpaces(amountMatch[1]) : null,
    period: fallbackPeriod ?? (periodMatch ? normalizeWhitespace(periodMatch[1]) : null)
  };
}

function parseMedianWageFromArticle(html: string, fallbackPeriod: string | null): CurrentStatistic<number> {
  const text = stripHtmlToText(html);
  const amountMatch =
    text.match(/Medián mezd(?: činil| dosáhl)?\s*\(?\s*([\d\s]+)\s*Kč/i) ??
    text.match(/mediánová mzda(?: činila| dosáhla)?\s*\(?\s*([\d\s]+)\s*Kč/i);
  const periodMatch = text.match(/Ve\s+(\d+\.\s*čtvrtletí\s+\d{4})/i);

  return {
    value: amountMatch ? parseIntegerWithSpaces(amountMatch[1]) : null,
    period: fallbackPeriod ?? (periodMatch ? normalizeWhitespace(periodMatch[1]) : null)
  };
}

async function fetchCzsoRssItems(): Promise<RssItem[]> {
  const rssXml = await fetchText(CZSO_RSS_URL);
  return parseRssItems(rssXml);
}

async function fetchCzsoArticle(item: RssItem): Promise<{ item: RssItem; html: string }> {
  if (!item.link) {
    throw new Error("Matching CZSO article not found");
  }

  const html = await fetchText(item.link);
  return { item, html };
}

function parseWageArticle(item: RssItem, html: string): WageArticlePayload {
  const periodFromTitle = extractWagePeriod(item.title);
  const wage = parseWageFromArticle(html, periodFromTitle);
  const medianWage = parseMedianWageFromArticle(html, periodFromTitle);

  return {
    item,
    html,
    averageWageCzk: wage.value,
    medianWageCzk: medianWage.value,
    period: wage.period ?? medianWage.period ?? periodFromTitle
  };
}

export async function fetchLatestWageArticle(): Promise<WageArticlePayload> {
  const rssItems = await fetchCzsoRssItems();
  const item = rssItems.find(isWageArticle);

  if (!item?.link) {
    throw new Error("Matching CZSO article not found");
  }

  const result = await fetchCzsoArticle(item);
  return parseWageArticle(result.item, result.html);
}

export async function fetchLatestWageArticles(): Promise<WageArticlePayload[]> {
  const rssItems = await fetchCzsoRssItems();
  const wageItems = rssItems.filter(isWageArticle);

  const primaryItems = wageItems.slice(0, REQUIRED_WAGE_ARTICLE_COUNT);
  const articleUrls = primaryItems.map((item) => item.link);

  if (primaryItems.length > 0 && primaryItems.length < REQUIRED_WAGE_ARTICLE_COUNT) {
    const latestArticle = await fetchCzsoArticle(primaryItems[0]);
    const archiveUrls = parseArchiveArticleUrls(latestArticle.html);

    for (const archiveUrl of archiveUrls) {
      if (articleUrls.length >= REQUIRED_WAGE_ARTICLE_COUNT) {
        break;
      }
      if (articleUrls.includes(archiveUrl)) {
        continue;
      }
      articleUrls.push(archiveUrl);
    }
  }

  if (articleUrls.length === 0) {
    throw new Error("Matching CZSO wage articles not found");
  }

  const itemsToFetch = articleUrls.slice(0, REQUIRED_WAGE_ARTICLE_COUNT).map((url, index) => ({
    title: primaryItems[index]?.title ?? "",
    link: url,
    description: primaryItems[index]?.description ?? ""
  }));

  const articleResults = await Promise.allSettled(
    itemsToFetch.map(async (item) => {
      const html = await fetchText(item.link);
      return parseWageArticle(item, html);
    })
  );

  const articles = articleResults
    .filter((result): result is PromiseFulfilledResult<WageArticlePayload> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((article) => article.period && (article.averageWageCzk !== null || article.medianWageCzk !== null));

  if (articles.length === 0) {
    throw new Error("Matching CZSO wage articles not found");
  }

  return articles.sort(sortWageArticlesDesc);
}

export function buildWageHistory(
  articles: WageArticlePayload[],
  pickValue: (article: WageArticlePayload) => number | null
): WageHistoryPoint[] {
  const uniquePeriods = new Set<string>();
  const result: WageHistoryPoint[] = [];

  for (const article of articles.sort(sortWageArticlesDesc)) {
    const value = pickValue(article);
    const period = article.period;
    const quarterPeriod = parseQuarterPeriod(period);

    if (value === null || !period || !quarterPeriod || uniquePeriods.has(period)) {
      continue;
    }

    uniquePeriods.add(period);
    result.push({
      month: monthKey(startOfQuarterUtc(quarterPeriod)),
      valueCzk: value,
      sourcePeriod: period
    });

    if (result.length >= REQUIRED_WAGE_ARTICLE_COUNT) {
      break;
    }
  }

  return result
    .slice(0, REQUIRED_WAGE_ARTICLE_COUNT)
    .sort((left, right) => left.month.localeCompare(right.month));
}
