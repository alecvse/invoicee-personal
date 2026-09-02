import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Invoice, InvoiceCzkConversion } from "../api/types";
import { formatDateCz, formatInvoiceNumber, formatMoney } from "../utils/format";
import { StatusBadge } from "../components/StatusBadge";

function emailDefaults(invoice: Invoice, lang: "cs" | "en") {
  const number = formatInvoiceNumber(invoice.invoiceNumber);
  return lang === "en"
    ? {
        subject: `Invoice ${number}`,
        body: `Hello,\n\nplease find attached invoice ${number}. The due date is ${invoice.dueDate}.\n\nBest regards`
      }
    : {
        subject: `Faktura ${number}`,
        body: `Dobrý den,\n\nv příloze zasílám fakturu ${number}. Datum splatnosti je ${invoice.dueDate}.\n\nS pozdravem`
      };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString("cs-CZ")} ${date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

export function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exchange, setExchange] = useState<InvoiceCzkConversion | null>(null);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailAdditionalTo, setEmailAdditionalTo] = useState("");
  const [emailLang, setEmailLang] = useState<"cs" | "en">("cs");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const emailTriggerRef = useRef<HTMLButtonElement>(null);
  const emailToRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    api.invoices
      .detail(id)
      .then((result) => {
        setInvoice(result);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!invoice || invoice.status === "draft" || invoice.currency.trim().toUpperCase() !== "USD") {
      setExchange(null);
      setExchangeLoading(false);
      setExchangeError(null);
      return;
    }

    let cancelled = false;
    setExchangeLoading(true);
    setExchangeError(null);

    api.invoices
      .exchangeRateCzk(invoice.id)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setExchange(result);
      })
      .catch((e: Error) => {
        if (cancelled) {
          return;
        }
        setExchange(null);
        setExchangeError(e.message || "Nelze načíst kurz ČNB.");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setExchangeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [invoice]);

  async function togglePaid() {
    if (!invoice) {
      return;
    }

    try {
      const updated = await api.invoices.markPaid(invoice.id, invoice.status !== "paid");
      setInvoice(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeInvoice() {
    if (!invoice) {
      return;
    }

    const accepted = window.confirm("Opravdu chcete fakturu trvale smazat?");
    if (!accepted) {
      return;
    }

    try {
      await api.invoices.remove(invoice.id);
      navigate("/invoices");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function duplicateInvoice() {
    if (!invoice) {
      return;
    }

    try {
      setDuplicating(true);
      const duplicated = await api.invoices.duplicate(invoice.id);
      navigate(`/invoices/${duplicated.id}/edit?duplicated=1`);
    } catch (e) {
      setError((e as Error).message);
      setDuplicating(false);
    }
  }

  function openEmailDialog() {
    if (!invoice) {
      return;
    }

    const lang = invoice.currency.trim().toUpperCase() === "USD" ? "en" : "cs";
    const defaults = emailDefaults(invoice, lang);
    setEmailLang(lang);
    setEmailTo(invoice.contact.email ?? "");
    setEmailAdditionalTo("");
    setEmailSubject(defaults.subject);
    setEmailBody(defaults.body);
    setEmailError(null);
    setEmailResult(null);
    setEmailDialogOpen(true);
  }

  function closeEmailDialog() {
    if (emailLoading) {
      return;
    }
    setEmailDialogOpen(false);
    window.requestAnimationFrame(() => emailTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!emailDialogOpen) {
      return;
    }

    emailToRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeEmailDialog();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [emailDialogOpen, emailLoading]);

  function changeEmailLanguage(lang: "cs" | "en") {
    if (!invoice) {
      return;
    }
    const defaults = emailDefaults(invoice, lang);
    setEmailLang(lang);
    setEmailSubject(defaults.subject);
    setEmailBody(defaults.body);
  }

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    if (!invoice) {
      return;
    }

    try {
      setEmailLoading(true);
      setEmailError(null);
      const result = await api.invoices.sendEmail(invoice.id, {
        to: emailTo,
        ...(emailAdditionalTo.trim() ? { additionalTo: emailAdditionalTo } : {}),
        lang: emailLang,
        subject: emailSubject,
        body: emailBody
      });
      setInvoice((current) =>
        current
          ? {
              ...current,
              status: result.status,
              statusDisplay: result.statusDisplay,
              emailSentAt: result.sentAt,
              emailSentTo: result.to,
              emailMessageId: result.messageId
            }
          : current
      );
      setEmailDialogOpen(false);
      setEmailResult(`Faktura byla odeslána na ${result.to}.`);
      window.requestAnimationFrame(() => emailTriggerRef.current?.focus());
    } catch (e) {
      setEmailError((e as Error).message);
    } finally {
      setEmailLoading(false);
    }
  }

  if (!invoice) {
    return <p>{error ? `Chyba: ${error}` : "Načítání..."}</p>;
  }

  return (
    <section>
      <div className="section-head">
        <h2>{invoice.status === "draft" ? "Koncept faktury" : `Faktura ${formatInvoiceNumber(invoice.invoiceNumber)}`}</h2>
        <div className="inline-controls">
          <Link className="button" to={`/invoices/${invoice.id}/edit`}>
            Upravit
          </Link>
          <button type="button" onClick={duplicateInvoice} disabled={duplicating}>
            {duplicating ? "Kopíruji..." : "Duplikovat do konceptu"}
          </button>
          {invoice.status !== "draft" ? (
            <>
              <a className="button" href={api.invoices.pdfUrl(invoice.id, "cs")}>
                PDF CZ
              </a>
              <a className="button" href={api.invoices.pdfUrl(invoice.id, "en")}>
                PDF EN
              </a>
              <button ref={emailTriggerRef} type="button" onClick={openEmailDialog}>
                {invoice.emailSentAt ? "Odeslat znovu" : "Odeslat e-mailem"}
              </button>
            </>
          ) : null}
          {invoice.status !== "draft" ? (
            <button type="button" onClick={togglePaid}>
              {(invoice.statusDisplay ?? invoice.status) === "paid" ? "Označit jako vystavenou" : "Označit jako uhrazenou"}
            </button>
          ) : null}
          <button type="button" className="danger" onClick={removeInvoice}>
            Smazat
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {emailResult ? <p className="success" role="status">{emailResult}</p> : null}

      <div className="grid-2">
        <article className="card">
          <p>
            Stav: <StatusBadge status={invoice.statusDisplay ?? invoice.status} paidAt={invoice.paidAt} />
          </p>
          <p>Datum vystavení: {formatDateCz(invoice.issueDate)}</p>
          <p>Datum splatnosti: {formatDateCz(invoice.dueDate)}</p>
          <p>Variabilní symbol: {invoice.variableSymbol ?? "-"}</p>
          <p>Celkem: {formatMoney(invoice.total, invoice.currency)}</p>
          {invoice.emailSentAt && invoice.emailSentTo ? (
            <p>
              Poslední odeslání: {invoice.emailSentTo} ({formatDateTime(invoice.emailSentAt)})
            </p>
          ) : null}
          {invoice.status !== "draft" && invoice.currency.trim().toUpperCase() === "USD" ? (
            <p>
              Přepočet dle kurzu ČNB ({exchange?.rateDate ? formatDateCz(exchange.rateDate) : "-"})
              :{" "}
              {exchangeLoading
                ? "Načítání..."
                : exchange
                  ? formatMoney(exchange.totalCzk, "CZK")
                  : exchangeError || "Nedostupné"}
            </p>
          ) : null}
        </article>

        <article className="card">
          <p>Odběratel: {invoice.contact.name}</p>
          <p>
            {invoice.contact.street}, {invoice.contact.zip} {invoice.contact.city}
          </p>
          <p>{invoice.contact.country}</p>
          <p>Platební účet: {invoice.bankAccount.label}</p>
        </article>
      </div>

      <h3>Položky</h3>
      <table>
        <thead>
          <tr>
            <th>Název</th>
            <th>Množství</th>
            <th>Jednotka</th>
            <th>Cena za jednotku</th>
            <th>Celkem za položku</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>{item.quantity}</td>
              <td>{item.unit}</td>
              <td>{formatMoney(item.unitPrice, invoice.currency)}</td>
              <td>{formatMoney(item.lineTotal, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {invoice.note ? (
        <div className="box">
          <h3>Poznámka</h3>
          <p>{invoice.note}</p>
        </div>
      ) : null}

      {emailDialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeEmailDialog}
        >
          <div
            className="modal-dialog box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-dialog-title"
            aria-describedby="email-dialog-description"
            onClick={(event) => event.stopPropagation()}
          >
            <form className="stack-tight" onSubmit={sendEmail}>
              <div>
                <h3 id="email-dialog-title">Odeslat fakturu e-mailem</h3>
                <p id="email-dialog-description" className="field-hint">
                  Zkontrolujte příjemce, text a jazyk PDF před odesláním.
                </p>
              </div>
              {invoice.emailSentAt ? (
                <p className="field-hint">Tato faktura už byla odeslána. Nyní ji posíláte znovu.</p>
              ) : null}
              {emailError ? <p className="error">{emailError}</p> : null}
              <label>
                Komu
                <input
                  ref={emailToRef}
                  type="email"
                  required
                  value={emailTo}
                  onChange={(event) => setEmailTo(event.target.value)}
                  autoComplete="email"
                />
              </label>
              <label>
                Další příjemce (volitelné)
                <input
                  type="email"
                  value={emailAdditionalTo}
                  onChange={(event) => setEmailAdditionalTo(event.target.value)}
                  autoComplete="email"
                />
              </label>
              <label>
                Jazyk PDF
                <select value={emailLang} onChange={(event) => changeEmailLanguage(event.target.value as "cs" | "en")}>
                  <option value="cs">Čeština</option>
                  <option value="en">Angličtina</option>
                </select>
              </label>
              <p className="field-hint">Příloha: {invoice.invoiceNumber}_{emailLang}.pdf</p>
              <label>
                Předmět
                <input value={emailSubject} required onChange={(event) => setEmailSubject(event.target.value)} />
              </label>
              <label>
                Zpráva
                <textarea rows={7} required value={emailBody} onChange={(event) => setEmailBody(event.target.value)} />
              </label>
              <div className="modal-actions">
                <button type="submit" disabled={emailLoading}>
                  {emailLoading ? "Odesílám..." : invoice.emailSentAt ? "Odeslat znovu" : "Odeslat"}
                </button>
                <button type="button" onClick={closeEmailDialog} disabled={emailLoading}>
                  Zrušit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
