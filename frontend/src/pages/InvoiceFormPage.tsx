import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { BankAccount, Contact, ContactInvoiceTemplate, InvoiceItem, InvoiceStatus, LastInvoiceTemplate } from "../api/types";

type InvoiceFormState = {
  contactId: string;
  bankAccountId: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  note: string;
  items: InvoiceItem[];
};

const emptyItem = (): InvoiceItem => ({
  title: "",
  quantity: 1,
  unit: "ks",
  unitPrice: 0
});

const emptyContact = {
  name: "",
  street: "",
  city: "",
  zip: "",
  country: "Česká republika",
  ico: "",
  dic: "",
  phone: ""
};

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function cloneItems(items: Array<{ title: string; quantity: number; unit: string; unitPrice: number }>): InvoiceItem[] {
  if (items.length === 0) {
    return [emptyItem()];
  }

  return items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice
  }));
}

export function InvoiceFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedContactId = searchParams.get("contactId") ?? "";
  const isDuplicatedDraft = isEdit && searchParams.get("duplicated") === "1";
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [settingsDueDays, setSettingsDueDays] = useState<number>(14);
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [quickContact, setQuickContact] = useState(emptyContact);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingStatus, setExistingStatus] = useState<InvoiceStatus | null>(null);
  const [lastInvoiceTemplate, setLastInvoiceTemplate] = useState<LastInvoiceTemplate | null>(null);
  const [contactTemplate, setContactTemplate] = useState<ContactInvoiceTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [activeUnitPriceInputIndex, setActiveUnitPriceInputIndex] = useState<number | null>(null);
  const [form, setForm] = useState<InvoiceFormState>({
    contactId: "",
    bankAccountId: "",
    issueDate: formatDate(new Date()),
    dueDate: formatDate(addDays(new Date(), 14)),
    currency: "CZK",
    note: "",
    items: [emptyItem()]
  });

  useEffect(() => {
    Promise.all([api.contacts.list(), api.bankAccounts.list(), api.settings.get()])
      .then(([contactsResult, accountsResult, settings]) => {
        setContacts(contactsResult);
        setAccounts(accountsResult);
        setSettingsDueDays(settings.defaultDueDays);

        if (!isEdit && preselectedContactId) {
          setForm((prev) => ({ ...prev, contactId: prev.contactId || preselectedContactId }));
        }

        const defaultAccount = accountsResult.find((account) => account.isDefault) ?? accountsResult[0];
        if (!isEdit && defaultAccount) {
          setForm((prev) => ({
            ...prev,
            contactId: prev.contactId || preselectedContactId,
            bankAccountId: defaultAccount.id,
            currency: defaultAccount.currency
          }));
        }

        if (!isEdit) {
          setForm((prev) => ({
            ...prev,
            dueDate: formatDate(addDays(new Date(prev.issueDate), settings.defaultDueDays))
          }));
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [id, isEdit, preselectedContactId]);

  useEffect(() => {
    if (!isEdit || !id) {
      return;
    }

    api.invoices
      .detail(id)
      .then((invoice) => {
        setExistingStatus(invoice.status);
        setForm({
          contactId: invoice.contactId,
          bankAccountId: invoice.bankAccountId,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          note: invoice.note ?? "",
          items: invoice.items.map((item) => ({
            title: item.title,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice
          }))
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [id, isEdit]);

  useEffect(() => {
    if (!form.contactId) {
      setLastInvoiceTemplate(null);
      setContactTemplate(null);
      setTemplateLoading(false);
      return;
    }

    let cancelled = false;
    setTemplateLoading(true);
    setLastInvoiceTemplate(null);
    setContactTemplate(null);

    Promise.all([api.contacts.lastInvoiceTemplate(form.contactId), api.contacts.invoiceTemplate(form.contactId)])
      .then(([lastInvoicePayload, templatePayload]) => {
        if (cancelled) {
          return;
        }
        setLastInvoiceTemplate(lastInvoicePayload.template);
        setContactTemplate(templatePayload);

        if (!isEdit) {
          const preferredAccountId =
            templatePayload.bankAccountId && accounts.some((account) => account.id === templatePayload.bankAccountId)
              ? templatePayload.bankAccountId
              : null;
          const preferredCurrency = templatePayload.currency?.trim() || null;

          if (preferredAccountId || preferredCurrency) {
            setForm((prev) => ({
              ...prev,
              bankAccountId: preferredAccountId ?? prev.bankAccountId,
              currency: preferredCurrency ?? prev.currency
            }));
          }
        }
      })
      .catch((e: Error) => {
        if (cancelled) {
          return;
        }
        setLastInvoiceTemplate(null);
        setContactTemplate(null);
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) {
          setTemplateLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.contactId]);

  const total = useMemo(
    () => form.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0),
    [form.items]
  );

  function updateItem(index: number, patch: Partial<InvoiceItem>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    }));
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function removeItem(index: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  }

  function applyLastInvoiceTemplate(index: number) {
    if (!lastInvoiceTemplate) {
      return;
    }

    const previousItem = lastInvoiceTemplate.items.find((item) => item.title.trim());
    if (!previousItem) {
      return;
    }

    updateItem(index, {
      title: previousItem.title,
      quantity: previousItem.quantity,
      unitPrice: previousItem.unitPrice,
      unit: previousItem.unit
    });

    setForm((prev) => ({
      ...prev,
      note: lastInvoiceTemplate.note ?? prev.note,
      currency: lastInvoiceTemplate.currency || prev.currency,
      bankAccountId: lastInvoiceTemplate.bankAccountId || prev.bankAccountId
    }));
  }

  function applyContactTemplate() {
    if (!contactTemplate) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      note: contactTemplate.note ?? prev.note,
      currency: contactTemplate.currency || prev.currency,
      bankAccountId: contactTemplate.bankAccountId || prev.bankAccountId,
      items: cloneItems(contactTemplate.items)
    }));
  }

  function onIssueDateChange(value: string) {
    setForm((prev) => ({
      ...prev,
      issueDate: value,
      dueDate: formatDate(addDays(new Date(value), settingsDueDays))
    }));
  }

  async function createQuickContact() {
    if (
      !quickContact.name.trim() ||
      !quickContact.street.trim() ||
      !quickContact.city.trim() ||
      !quickContact.zip.trim() ||
      !quickContact.country.trim()
    ) {
      setError("Vyplňte prosím povinná pole kontaktu: název, ulice, město, PSČ a země.");
      return;
    }

    try {
      const created = await api.contacts.create({
        ...quickContact,
        ico: quickContact.ico || null,
        dic: quickContact.dic || null,
        email: null,
        phone: quickContact.phone || null
      });
      setContacts((prev) => [created, ...prev]);
      setForm((prev) => ({ ...prev, contactId: created.id }));
      setQuickContact(emptyContact);
      setQuickContactOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveInvoice(targetStatus?: "draft" | "issued") {
    setSaving(true);
    setError(null);

    if (!form.contactId || !form.bankAccountId || form.items.length === 0) {
      setError("Vyplňte prosím povinná pole: kontakt, bankovní účet a alespoň jednu položku.");
      setSaving(false);
      return;
    }

    if (form.items.some((item) => !item.title || item.quantity <= 0 || item.unitPrice < 0)) {
      setError("Každá položka musí mít název, množství > 0 a cenu >= 0.");
      setSaving(false);
      return;
    }

    const payload = {
      ...form,
      status: targetStatus,
      note: form.note || undefined
    };

    try {
      const saved = isEdit && id ? await api.invoices.update(id, payload) : await api.invoices.create(payload);
      navigate(`/invoices/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const isDraft = existingStatus === "draft";
  const showDraftActions = !isEdit || isDraft;

  return (
    <section>
      <div className="section-head">
        <h2>{isEdit ? (isDraft ? "Upravit koncept" : "Upravit fakturu") : "Vytvořit fakturu"}</h2>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void saveInvoice(showDraftActions ? "issued" : undefined);
        }}
      >
        <div className="grid-2">
          <label>
            Kontakt
            <select
              value={form.contactId}
              onChange={(e) => setForm((prev) => ({ ...prev, contactId: e.target.value }))}
              disabled={isDuplicatedDraft}
              required
            >
              <option value="">Vyberte kontakt</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>

          <div className="align-end">
            <button type="button" onClick={() => setQuickContactOpen((prev) => !prev)}>
              {quickContactOpen ? "Zavřít rychlý kontakt" : "Přidat kontakt rychle"}
            </button>
          </div>

          {quickContactOpen ? (
            <div className="box span-2">
              <h3>Rychlý kontakt</h3>
              <div className="grid-3">
                <label>
                  Název / Jméno
                  <input
                    value={quickContact.name}
                    onChange={(e) => setQuickContact((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </label>
                <label>
                  Ulice
                  <input
                    value={quickContact.street}
                    onChange={(e) => setQuickContact((prev) => ({ ...prev, street: e.target.value }))}
                  />
                </label>
                <label>
                  Město
                  <input
                    value={quickContact.city}
                    onChange={(e) => setQuickContact((prev) => ({ ...prev, city: e.target.value }))}
                  />
                </label>
                <label>
                  PSČ
                  <input
                    value={quickContact.zip}
                    onChange={(e) => setQuickContact((prev) => ({ ...prev, zip: e.target.value }))}
                  />
                </label>
                <label>
                  Země
                  <input
                    value={quickContact.country}
                    onChange={(e) => setQuickContact((prev) => ({ ...prev, country: e.target.value }))}
                  />
                </label>
                <label>
                  IČ
                  <input
                    value={quickContact.ico}
                    onChange={(e) => setQuickContact((prev) => ({ ...prev, ico: e.target.value }))}
                  />
                </label>
                <label>
                  DIČ
                  <input
                    value={quickContact.dic}
                    onChange={(e) => setQuickContact((prev) => ({ ...prev, dic: e.target.value }))}
                  />
                </label>
              </div>
              <button type="button" onClick={createQuickContact}>
                Uložit kontakt
              </button>
            </div>
          ) : null}

          <label>
            Datum vystavení
            <input type="date" value={form.issueDate} onChange={(e) => onIssueDateChange(e.target.value)} required />
          </label>
          <label>
            Datum splatnosti
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              required
            />
          </label>

          <label>
            Bankovní účet
            <select
              value={form.bankAccountId}
              onChange={(e) => {
                const account = accounts.find((entry) => entry.id === e.target.value);
                setForm((prev) => ({
                  ...prev,
                  bankAccountId: e.target.value,
                  currency: account?.currency ?? prev.currency
                }));
              }}
              disabled={isDuplicatedDraft}
              required
            >
              <option value="">Vyberte účet</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.currency})
                </option>
              ))}
            </select>
          </label>

          <label>
            Měna
            <input
              value={form.currency}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
              disabled={isDuplicatedDraft}
              required
            />
          </label>
        </div>

        <div className="box">
          <div className="section-head section-head-tight">
            <h3>Položky</h3>
            <div className="inline-controls">
              <button
                type="button"
                className="button-sm"
                onClick={applyContactTemplate}
                disabled={!form.contactId || templateLoading || !contactTemplate || contactTemplate.items.length === 0}
              >
                {templateLoading ? "Načítání..." : "Použít šablonu kontaktu"}
              </button>
            </div>
          </div>
          {form.items.map((item, index) => (
            <div className="item-row" key={index}>
              <textarea
                className="item-row-title"
                placeholder="Název"
                value={item.title}
                onChange={(e) => updateItem(index, { title: e.target.value })}
                rows={3}
              />
              <div className="item-row-meta">
                <label className="item-input-with-label">
                  <span>Množství</span>
                  <input
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  />
                </label>
                <label className="item-input-with-label">
                  <span>Cena za jednotku</span>
                  <input
                    type="number"
                    step="0.01"
                    value={activeUnitPriceInputIndex === index && item.unitPrice === 0 ? "" : item.unitPrice}
                    onFocus={() => setActiveUnitPriceInputIndex(index)}
                    onBlur={() => setActiveUnitPriceInputIndex((prev) => (prev === index ? null : prev))}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      updateItem(index, { unitPrice: nextValue === "" ? 0 : Number(nextValue) });
                    }}
                  />
                </label>
                <strong>{(item.quantity * item.unitPrice).toFixed(2)}</strong>
                {isDuplicatedDraft ? null : (
                  <button
                    type="button"
                    className="button-sm"
                    onClick={() => applyLastInvoiceTemplate(index)}
                    disabled={!form.contactId || !lastInvoiceTemplate || templateLoading}
                  >
                    {templateLoading ? "Načítání..." : "Přenést údaje minulé faktury"}
                  </button>
                )}
                <button type="button" className="button-sm danger" onClick={() => removeItem(index)} disabled={form.items.length === 1}>
                  Odebrat
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addItem}>
            Přidat položku
          </button>
        </div>

        <label>
          Poznámka
          <textarea value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} rows={3} />
        </label>

        <div className="submit-row">
          <strong>Celkem: {total.toFixed(2)} {form.currency}</strong>
          <div className="inline-controls">
            {showDraftActions ? (
              <button type="button" onClick={() => void saveInvoice("draft")} disabled={saving}>
                {saving && isDraft ? "Ukládání..." : "Uložit jako koncept"}
              </button>
            ) : null}
            <button type="submit" disabled={saving}>
              {saving ? "Ukládání..." : showDraftActions ? "Vystavit fakturu" : "Uložit změny"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
