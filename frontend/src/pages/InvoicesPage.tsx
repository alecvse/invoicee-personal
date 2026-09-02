import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Contact, Invoice, InvoiceStatus } from "../api/types";
import { formatDateCz, formatInvoiceNumber, formatMoney } from "../utils/format";
import { StatusBadge } from "../components/StatusBadge";

const monthLabels = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

type SortKey = "invoiceNumber" | "customer" | "issueDate" | "total";
type SortDirection = "asc" | "desc";
type ContactChartTooltip = {
  label: string;
  amountCzk: number;
  issuedInvoiceCount: number;
  x: number;
  y: number;
};

function DownloadPdfIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 11l5 5l5 -5" />
      <path d="M12 4l0 12" />
    </svg>
  );
}

export function InvoicesPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [status, setStatus] = useState<InvoiceStatus | "all" | "overdue">("all");
  const [contactId, setContactId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [markingInvoiceId, setMarkingInvoiceId] = useState<string | null>(null);
  const [duplicatingInvoiceId, setDuplicatingInvoiceId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("issueDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [contactChartTooltip, setContactChartTooltip] = useState<ContactChartTooltip | null>(null);

  const filters = useMemo(
    () => ({ year, status, contactId: contactId || undefined, search: search || undefined }),
    [year, status, contactId, search]
  );

  useEffect(() => {
    api.contacts.list().then(setContacts).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    api.invoices
      .list(filters)
      .then((result) => {
        setInvoices(result);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [filters]);

  async function markInvoicePaid(invoiceId: string) {
    try {
      setMarkingInvoiceId(invoiceId);
      await api.invoices.markPaid(invoiceId, true);
      const refreshed = await api.invoices.list(filters);
      setInvoices(refreshed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarkingInvoiceId(null);
    }
  }

  async function duplicateInvoice(invoiceId: string) {
    try {
      setDuplicatingInvoiceId(invoiceId);
      const duplicated = await api.invoices.duplicate(invoiceId);
      setError(null);
      navigate(`/invoices/${duplicated.id}/edit?duplicated=1`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDuplicatingInvoiceId(null);
    }
  }

  function toggleSort(key: SortKey) {
    setSortDirection((prevDirection) => {
      if (sortKey !== key) {
        setSortKey(key);
        return "asc";
      }
      return prevDirection === "asc" ? "desc" : "asc";
    });
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) {
      return "";
    }
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  const sortedInvoices = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...invoices].sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "invoiceNumber":
          result = formatInvoiceNumber(a.invoiceNumber).localeCompare(formatInvoiceNumber(b.invoiceNumber), "cs", {
            numeric: true,
            sensitivity: "base"
          });
          break;
        case "customer":
          result = a.contact.name.localeCompare(b.contact.name, "cs", { sensitivity: "base" });
          break;
        case "issueDate":
          result = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
          break;
        case "total":
          result = a.total - b.total;
          break;
      }
      return result * factor;
    });
  }, [invoices, sortDirection, sortKey]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === contactId) ?? null,
    [contacts, contactId]
  );

  const showConvertedCzkColumn = useMemo(() => {
    if (!contactId) {
      return true;
    }

    return invoices.some((invoice) => invoice.currency.trim().toUpperCase() === "USD");
  }, [contactId, invoices]);

  const contactMonthlyChart = useMemo(() => {
    if (!contactId) {
      return [];
    }

    const byMonth = Array.from({ length: 12 }, (_, index) => ({
      label: monthLabels[index] ?? String(index + 1),
      czk: 0,
      usdCzk: 0,
      totalCzk: 0,
      issuedInvoiceCount: 0
    }));

    for (const invoice of invoices) {
      const month = new Date(invoice.issueDate).getMonth();
      if (month < 0 || month > 11) {
        continue;
      }

      if (invoice.currency.trim().toUpperCase() === "USD") {
        const converted = invoice.convertedTotalCzk ?? 0;
        byMonth[month].usdCzk += converted;
        byMonth[month].totalCzk += converted;
      } else {
        byMonth[month].czk += invoice.total;
        byMonth[month].totalCzk += invoice.total;
      }

      if (invoice.status !== "draft") {
        byMonth[month].issuedInvoiceCount += 1;
      }
    }

    return byMonth;
  }, [contactId, invoices]);

  const contactChartMax = useMemo(
    () => (contactMonthlyChart.length > 0 ? Math.max(...contactMonthlyChart.map((entry) => entry.totalCzk), 0) : 0),
    [contactMonthlyChart]
  );

  const contactTotalInvoiced = useMemo(
    () => contactMonthlyChart.reduce((sum, entry) => sum + entry.totalCzk, 0),
    [contactMonthlyChart]
  );

  function showContactChartTooltip(
    target: HTMLElement,
    payload: Omit<ContactChartTooltip, "x" | "y">
  ) {
    const rect = target.getBoundingClientRect();
    setContactChartTooltip({
      ...payload,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  }

  return (
    <section>
      <div className="section-head">
        <h2>Faktury</h2>
        <div className="inline-controls">
          <a className="button" href={api.reports.invoicesCsvUrl(year)}>
            Export CSV
          </a>
          <Link className="button" to="/invoices/new">
            Nová faktura
          </Link>
        </div>
      </div>

      <div className="filters-row">
        <label>
          Rok
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <label>
          Stav
          <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | "all" | "overdue")}>
            <option value="all">Vše</option>
            <option value="draft">Koncept</option>
            <option value="issued">Vystaveno</option>
            <option value="sent">Odesláno</option>
            <option value="overdue">Po splatnosti</option>
            <option value="paid">Uhrazeno</option>
          </select>
        </label>
        <label>
          Kontakt
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Všechny kontakty</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hledat
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Číslo faktury nebo kontakt" />
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {contactId ? (
        <article className="card summary-chart-card">
          <div className="summary-chart-head">
            <div>
              <p>Celkem fakturováno {selectedContact ? `(${selectedContact.name})` : ""}</p>
              <strong>{formatMoney(contactTotalInvoiced, "CZK")}</strong>
            </div>
          </div>
          <div className="summary-chart-bars">
            {contactMonthlyChart.map((entry, index) => {
              const totalHeight = contactChartMax > 0 ? Math.max((entry.totalCzk / contactChartMax) * 100, 2) : 0;
              const czkPartHeight = entry.totalCzk > 0 ? (entry.czk / entry.totalCzk) * 100 : 0;
              const usdPartHeight = entry.totalCzk > 0 ? (entry.usdCzk / entry.totalCzk) * 100 : 0;
              const totalLabel = formatMoney(entry.totalCzk, "CZK");
              const isEmptyMonth = entry.totalCzk === 0;

              return (
                <div key={entry.label} className="summary-chart-col">
                  <span
                    className={`summary-chart-label summary-chart-label-value${isEmptyMonth ? " summary-chart-label-empty" : ""}`}
                  >
                    {totalLabel}
                  </span>
                  <div className="summary-chart-track">
                    <div
                      className="summary-chart-fill"
                      tabIndex={0}
                      style={{
                        height: `${totalHeight}%`,
                        animationDelay: `${index * 60}ms`
                      }}
                      onMouseEnter={(e) =>
                        showContactChartTooltip(e.currentTarget, {
                          label: entry.label,
                          amountCzk: entry.totalCzk,
                          issuedInvoiceCount: entry.issuedInvoiceCount
                        })
                      }
                      onFocus={(e) =>
                        showContactChartTooltip(e.currentTarget, {
                          label: entry.label,
                          amountCzk: entry.totalCzk,
                          issuedInvoiceCount: entry.issuedInvoiceCount
                        })
                      }
                      onMouseLeave={() => setContactChartTooltip(null)}
                      onBlur={() => setContactChartTooltip(null)}
                      aria-label={`${entry.label}: ${entry.issuedInvoiceCount} vydaných faktur, ${formatMoney(entry.totalCzk, "CZK")}`}
                    >
                      {czkPartHeight > 0 ? (
                        <div className="summary-chart-segment summary-chart-segment-czk" style={{ height: `${czkPartHeight}%` }} />
                      ) : null}
                      {usdPartHeight > 0 ? (
                        <div className="summary-chart-segment summary-chart-segment-usd" style={{ height: `${usdPartHeight}%` }} />
                      ) : null}
                    </div>
                  </div>
                  <span className="summary-chart-label">{entry.label}</span>
                </div>
              );
            })}
          </div>
        </article>
      ) : null}

      {contactChartTooltip
        ? createPortal(
            <div
              className="summary-chart-tooltip"
              style={{
                left: `${contactChartTooltip.x}px`,
                top: `${contactChartTooltip.y}px`
              }}
            >
              <div className="summary-chart-tooltip-value">{formatMoney(contactChartTooltip.amountCzk, "CZK")}</div>
              <div className="summary-chart-tooltip-sub">
                {contactChartTooltip.issuedInvoiceCount} vydaných faktur
              </div>
            </div>,
            document.body
          )
        : null}

      <table>
        <thead>
          <tr>
            <th>
              <button type="button" className="table-sort-button" onClick={() => toggleSort("invoiceNumber")}>
                Číslo{sortIndicator("invoiceNumber")}
              </button>
            </th>
            <th>Stav faktury</th>
            <th>
              <button type="button" className="table-sort-button" onClick={() => toggleSort("customer")}>
                Odběratel{sortIndicator("customer")}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort-button" onClick={() => toggleSort("issueDate")}>
                Datum vystavení{sortIndicator("issueDate")}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort-button" onClick={() => toggleSort("total")}>
                Celkem{sortIndicator("total")}
              </button>
            </th>
            {showConvertedCzkColumn ? <th>Přepočet CZK</th> : null}
            <th className="text-right" aria-label="Akce"></th>
          </tr>
        </thead>
        <tbody>
          {sortedInvoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <div className="table-invoice-cell">
                  <Link className="table-invoice-link" to={`/invoices/${invoice.id}`}>
                    {formatInvoiceNumber(invoice.invoiceNumber)}
                  </Link>
                </div>
              </td>
              <td>
                <StatusBadge status={invoice.statusDisplay ?? invoice.status} paidAt={invoice.paidAt} />
              </td>
              <td>{invoice.contact.name}</td>
              <td>{formatDateCz(invoice.issueDate)}</td>
              <td>
                <span className="font-semibold">{formatMoney(invoice.total, invoice.currency)}</span>
              </td>
              {showConvertedCzkColumn ? (
                <td>
                  {invoice.currency.trim().toUpperCase() === "USD" && typeof invoice.convertedTotalCzk === "number"
                    ? formatMoney(invoice.convertedTotalCzk, "CZK")
                    : "-"}
                </td>
              ) : null}
              <td>
                <div className="table-status-actions">
                  {invoice.status !== "draft" && (invoice.statusDisplay ?? invoice.status) !== "paid" ? (
                    <button
                      className="button-sm"
                      type="button"
                      onClick={() => markInvoicePaid(invoice.id)}
                      disabled={markingInvoiceId === invoice.id}
                    >
                      {markingInvoiceId === invoice.id ? "Ukládám..." : "Uhrazeno"}
                    </button>
                  ) : null}
                  <button
                    className="button-sm"
                    type="button"
                    onClick={() => void duplicateInvoice(invoice.id)}
                    disabled={duplicatingInvoiceId === invoice.id}
                  >
                    {duplicatingInvoiceId === invoice.id ? "Kopíruji..." : "Duplikovat"}
                  </button>
                  {invoice.status !== "draft" ? (
                    <a
                      className="icon-link-button"
                      href={api.invoices.pdfUrl(
                        invoice.id,
                        invoice.currency.trim().toUpperCase() === "USD" ? "en" : "cs"
                      )}
                      target="_blank"
                      rel="noreferrer"
                      title="Stáhnout PDF faktury"
                      aria-label={`Stáhnout PDF faktury ${formatInvoiceNumber(invoice.invoiceNumber)}`}
                    >
                      <DownloadPdfIcon />
                    </a>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
