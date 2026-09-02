import { changelogEntries } from "../data/changelog";

function formatDateTime(value: string): string {
  const date = new Date(value);
  const hasExplicitTime = value.includes("T");

  const formatter = new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(hasExplicitTime
      ? {
          hour: "2-digit" as const,
          minute: "2-digit" as const
        }
      : {})
  });

  const formatted = formatter.format(date);
  if (hasExplicitTime) {
    return formatted.replace(/ (\d{2}:\d{2})$/, ", $1");
  }

  return formatted;
}

export function ChangelogPage() {
  const buildTime = formatDateTime(__BUILD_TIME__);

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Changelog</h2>
          <p className="page-intro">Přehled změn a verzí, které byly v aplikaci Invoicee postupně nasazeny.</p>
          <p className="page-intro">Poslední build: {buildTime}</p>
        </div>
      </div>

      <div className="stack">
        {changelogEntries.map((entry) => (
          <article key={entry.version} className="box changelog-entry">
            <div className="changelog-entry-head">
              <div className="changelog-meta">
                <div className="changelog-version-chip">{entry.version}</div>
                <h3 className="changelog-entry-title">{entry.title}</h3>
              </div>
              <div className="changelog-date">{formatDateTime(entry.releasedAt)}</div>
            </div>
            <ul className="changelog-list">
              {entry.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
