import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { BankAccount, ContactDetailPayload, ContactInvoiceTemplate } from "../api/types";
import { formatDateCz, formatInvoiceNumber, formatMoney } from "../utils/format";
import { StatusBadge } from "../components/StatusBadge";

function emptyTemplate(): ContactInvoiceTemplate {
  return {
    bankAccountId: null,
    currency: null,
    note: null,
    items: []
  };
}

function emptyTemplateItem() {
  return {
    title: "",
    quantity: 1,
    unit: "ks",
    unitPrice: 0
  };
}

export function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ContactDetailPayload | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [template, setTemplate] = useState<ContactInvoiceTemplate>(emptyTemplate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicatingInvoiceId, setDuplicatingInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) {
      return;
    }

    try {
      setLoading(true);
      const [detailPayload, bankAccounts] = await Promise.all([api.contacts.detail(id), api.bankAccounts.list()]);
      setDetail(detailPayload);
      setAccounts(bankAccounts);
      setTemplate(
        detailPayload.invoiceTemplate
          ? {
              ...detailPayload.invoiceTemplate,
              items: detailPayload.invoiceTemplate.items.map((item) => ({ ...item }))
            }
          : emptyTemplate()
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  function updateTemplateItem(index: number, patch: Partial<ContactInvoiceTemplate["items"][number]>) {
    setTemplate((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }));
  }

  function addTemplateItem() {
    setTemplate((prev) => ({
      ...prev,
      items: [...prev.items, emptyTemplateItem()]
    }));
  }

  function removeTemplateItem(index: number) {
    setTemplate((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function saveTemplate() {
    if (!id) {
      return;
    }

    const sanitized = {
      ...template,
      currency: template.currency?.trim() || null,
      note: template.note?.trim() || null,
      bankAccountId: template.bankAccountId || null,
      items: template.items
        .filter((item) => item.title.trim().length > 0)
        .map((item) => ({
          title: item.title.trim(),
          quantity: Number(item.quantity),
          unit: item.unit.trim() || "ks",
          unitPrice: Number(item.unitPrice)
        }))
    };

    try {
      setSaving(true);
      const savedTemplate = await api.contacts.saveInvoiceTemplate(id, sanitized);
      setTemplate(savedTemplate);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function duplicateInvoice(invoiceId: string) {
    try {
      setDuplicatingInvoiceId(invoiceId);
      const duplicated = await api.invoices.duplicate(invoiceId);
      navigate(`/invoices/${duplicated.id}/edit?duplicated=1`);
    } catch (e) {
      setError((e as Error).message);
      setDuplicatingInvoiceId(null);
    }
  }

  if (loading) {
    return <p>Načítání...</p>;
  }

  if (!detail) {
    return <p>{error ? `Chyba: ${error}` : "Kontakt nebyl nalezen."}</p>;
  }

  return (
    <section>
      <div className="section-head">
        <h2>{detail.contact.name}</h2>
        <div className="inline-controls">
          <Link className="button" to={`/invoices/new?contactId=${detail.contact.id}`}>
            Nová faktura
          </Link>
          <Link className="button" to={`/contacts?contact=${detail.contact.id}`}>
            Upravit kontakt
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="grid-2">
        <article className="card">
          <p>{detail.contact.street}</p>
          <p>
            {detail.contact.zip} {detail.contact.city}
          </p>
          <p>{detail.contact.country}</p>
          <p>IČ: {detail.contact.ico ?? "-"}</p>
          <p>DIČ: {detail.contact.dic ?? "-"}</p>
        </article>
        <article className="card">
          <p>Vystaveno faktur: {detail.invoices.length}</p>
          <p>
            Poslední faktura: {detail.invoices[0] ? formatInvoiceNumber(detail.invoices[0].invoiceNumber) : "-"}
          </p>
          <p>
            Poslední vystavení: {detail.invoices[0] ? formatDateCz(detail.invoices[0].issueDate) : "-"}
          </p>
        </article>
      </div>

      <div className="box">
        <div className="section-head section-head-tight">
          <h3>Šablona faktury</h3>
          <div className="inline-controls">
            <button type="button" onClick={saveTemplate} disabled={saving}>
              {saving ? "Ukládání..." : "Uložit šablonu"}
            </button>
          </div>
        </div>

        <div className="grid-2">
          <label>
            Bankovní účet
            <select
              value={template.bankAccountId ?? ""}
              onChange={(e) => setTemplate((prev) => ({ ...prev, bankAccountId: e.target.value || null }))}
            >
              <option value="">Bez výchozího účtu</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.currency})
                </option>
              ))}
            </select>
          </label>
          <label>
            Měna
            <select
              value={template.currency ?? ""}
              onChange={(e) => setTemplate((prev) => ({ ...prev, currency: e.target.value || null }))}
            >
              <option value="">Bez výchozí měny</option>
              <option value="CZK">CZK</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>

        <label className="mt-3">
          Poznámka
          <textarea
            value={template.note ?? ""}
            rows={3}
            onChange={(e) => setTemplate((prev) => ({ ...prev, note: e.target.value || null }))}
          />
        </label>

        <div className="stack-tight template-items-stack">
          <div className="template-items-actions">
            <button type="button" onClick={addTemplateItem}>
              Přidat položku do šablony
            </button>
          </div>
          {template.items.map((item, index) => (
            <div className="item-row" key={item.id ?? index}>
              <textarea
                className="item-row-title"
                rows={3}
                placeholder="Název položky šablony"
                value={item.title}
                onChange={(e) => updateTemplateItem(index, { title: e.target.value })}
              />
              <div className="item-row-meta">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Množ."
                  value={item.quantity}
                  onChange={(e) => updateTemplateItem(index, { quantity: Number(e.target.value) })}
                />
                <input
                  type="text"
                  placeholder="Jednotka"
                  value={item.unit}
                  onChange={(e) => updateTemplateItem(index, { unit: e.target.value })}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Cena"
                  value={item.unitPrice}
                  onChange={(e) => updateTemplateItem(index, { unitPrice: Number(e.target.value) })}
                />
                <button type="button" className="button-sm danger" onClick={() => removeTemplateItem(index)}>
                  Odebrat
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-head section-head-tight">
        <h3>Historie faktur</h3>
      </div>

      <table>
        <thead>
          <tr>
            <th>Číslo</th>
            <th>Stav faktury</th>
            <th>Datum vystavení</th>
            <th>Datum splatnosti</th>
            <th>Účet</th>
            <th>Celkem</th>
            <th aria-label="Akce"></th>
          </tr>
        </thead>
        <tbody>
          {detail.invoices.length === 0 ? (
            <tr>
              <td colSpan={7}>Kontakt zatím nemá žádné faktury.</td>
            </tr>
          ) : (
            detail.invoices.map((invoice) => (
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
                <td>{formatDateCz(invoice.issueDate)}</td>
                <td>{formatDateCz(invoice.dueDate)}</td>
                <td>{invoice.bankAccountLabel}</td>
                <td>
                  <span className="font-semibold">{formatMoney(invoice.total, invoice.currency)}</span>
                </td>
                <td>
                  <div className="table-status-actions">
                    <button
                      className="button-sm"
                      type="button"
                      onClick={() => void duplicateInvoice(invoice.id)}
                      disabled={duplicatingInvoiceId === invoice.id}
                    >
                      {duplicatingInvoiceId === invoice.id ? "Kopíruji..." : "Duplikovat"}
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
