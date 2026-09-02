import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError, api } from "../api/client";
import type { Contact, ContactLookupResult } from "../api/types";

type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

const initial: ContactInput = {
  name: "",
  street: "",
  city: "",
  zip: "",
  country: "Česká republika",
  ico: null,
  dic: null,
  email: null,
  phone: null
};

export function ContactsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Contact[]>([]);
  const [form, setForm] = useState<ContactInput>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lastLookupIco, setLastLookupIco] = useState<string | null>(null);

  function toUserError(error: unknown): string {
    const fallback = "Nepodařilo se uložit kontakt.";
    if (!(error instanceof Error)) {
      return fallback;
    }

    if (error instanceof ApiClientError && error.code === "VALIDATION_ERROR") {
      const details = error.details as { issues?: { fieldErrors?: Record<string, string[]> } } | undefined;
      const fieldErrors = details?.issues?.fieldErrors;
      const fieldLabels: Record<string, string> = {
        name: "název/jméno",
        street: "ulice",
        city: "město",
        zip: "PSČ",
        country: "země"
      };

      if (fieldErrors) {
        const fields = Object.keys(fieldErrors);
        if (fields.length > 0) {
          return `Doplňte prosím povinná pole: ${fields.map((f) => fieldLabels[f] ?? f).join(", ")}.`;
        }
      }
    }

    return error.message || fallback;
  }

  function normalizeIco(value: string): string {
    return value.replace(/\D+/g, "");
  }

  function fillOnlyEmpty(current: ContactInput, lookup: ContactLookupResult): ContactInput {
    const next = { ...current };
    const maybeFill = (field: keyof ContactInput, value: string | null) => {
      const currentValue = next[field];
      const isEmpty =
        currentValue === null || (typeof currentValue === "string" && currentValue.trim().length === 0);
      if (isEmpty && value && value.trim().length > 0) {
        (next[field] as string | null) = value.trim();
      }
    };

    maybeFill("name", lookup.name);
    maybeFill("street", lookup.street);
    maybeFill("city", lookup.city);
    maybeFill("zip", lookup.zip);
    maybeFill("country", lookup.country ?? "Česká republika");
    maybeFill("dic", lookup.dic);
    return next;
  }

  async function load() {
    try {
      setRows(await api.contacts.list());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const contactId = searchParams.get("contact");
    if (!contactId || rows.length === 0) {
      return;
    }

    const selectedContact = rows.find((contact) => contact.id === contactId);
    if (!selectedContact) {
      return;
    }

    edit(selectedContact);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("contact");
    setSearchParams(nextParams, { replace: true });
  }, [rows, searchParams, setSearchParams]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!form.name.trim() || !form.street.trim() || !form.city.trim() || !form.zip.trim() || !form.country.trim()) {
      setError("Doplňte prosím povinná pole: název/jméno, ulice, město, PSČ, země.");
      return;
    }

    try {
      if (editingId) {
        await api.contacts.update(editingId, form);
      } else {
        await api.contacts.create(form);
      }
      setForm(initial);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(toUserError(e));
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Opravdu chcete kontakt smazat?")) {
      return;
    }

    try {
      await api.contacts.remove(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function edit(contact: Contact) {
    setEditingId(contact.id);
    setForm({
      name: contact.name,
      street: contact.street,
      city: contact.city,
      zip: contact.zip,
      country: contact.country,
      ico: contact.ico,
      dic: contact.dic,
      email: contact.email,
      phone: contact.phone
    });
  }

  async function handleIcoLookup(rawIco: string) {
    const ico = normalizeIco(rawIco);
    if (!ico || ico === lastLookupIco) {
      return;
    }

    setLookupLoading(true);
    try {
      const lookup = await api.contacts.lookupByIco(ico);
      setLastLookupIco(ico);
      setForm((current) => {
        const currentIco = normalizeIco(current.ico ?? "");
        if (currentIco !== ico) {
          return current;
        }
        return fillOnlyEmpty(current, lookup);
      });
      setError(null);
    } catch (e) {
      const typedError = e as Error;
      if (typedError instanceof ApiClientError && typedError.code === "NOT_FOUND") {
        setError("IČ nebylo v registru nalezeno.");
      } else if (typedError instanceof ApiClientError && typedError.code === "BAD_REQUEST") {
        setError("Neplatné IČ.");
      } else {
        setError("Nelze načíst data z registru, zkuste to prosím později.");
      }
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <section>
      <h2>Kontakty</h2>

      {error ? <p className="error">{error}</p> : null}

      <form className="stack" onSubmit={submit}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,33.333%)_auto] sm:items-end">
          <label>
            Předvyplnit data dle IČ
            {lookupLoading ? <span className="text-xs font-normal text-slate-500">Načítám data z ARES…</span> : null}
            <input
              value={form.ico ?? ""}
              disabled={lookupLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleIcoLookup(form.ico ?? "");
                }
              }}
              onChange={(e) => {
                setLastLookupIco(null);
                setForm({ ...form, ico: e.target.value || null });
              }}
            />
          </label>
          <div className="align-end">
            <button
              type="button"
              className="shrink-0"
              disabled={lookupLoading || normalizeIco(form.ico ?? "").length === 0}
              onClick={() => void handleIcoLookup(form.ico ?? "")}
            >
              Předvyplnit
            </button>
          </div>
        </div>

        {lookupLoading ? (
          <div className="grid-3" aria-live="polite" aria-busy="true">
            {["Název / Jméno", "Ulice", "Město", "PSČ", "Země", "DIČ", "E-mail"].map((label) => (
              <div key={label} className="space-y-2">
                <div className="h-4 w-28 rounded bg-slate-200/80" />
                <div className="h-10 w-full animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
              </div>
            ))}
          </div>
        ) : null}

        <div id="contact-detail" className="grid-3">
          <label>
            Název / Jméno
            <input disabled={lookupLoading} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Ulice
            <input disabled={lookupLoading} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          </label>
          <label>
            Město
            <input disabled={lookupLoading} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>
            PSČ
            <input disabled={lookupLoading} value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
          </label>
          <label>
            Země
            <input
              disabled={lookupLoading}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </label>
          <label>
            DIČ
            <input disabled={lookupLoading} value={form.dic ?? ""} onChange={(e) => setForm({ ...form, dic: e.target.value || null })} />
          </label>
          <label>
            E-mail pro odesílání faktur
            <input
              type="email"
              disabled={lookupLoading}
              value={form.email ?? ""}
              autoComplete="email"
              onChange={(e) => setForm({ ...form, email: e.target.value || null })}
            />
          </label>
        </div>
        <div className="inline-controls">
          <button type="submit">{editingId ? "Uložit kontakt" : "Přidat kontakt"}</button>
          <button
            type="button"
            onClick={() => {
              setForm(initial);
              setEditingId(null);
              setLastLookupIco(null);
              setError(null);
            }}
          >
            Vyčistit data
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(initial);
                setLastLookupIco(null);
              }}
            >
              Zrušit úpravu
            </button>
          ) : null}
        </div>
      </form>

      <table>
        <thead>
          <tr>
            <th>Název / Jméno</th>
            <th>IČ / DIČ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((contact) => (
            <tr key={contact.id}>
              <td>
                <Link to={`/contacts/${contact.id}`}>{contact.name}</Link>
              </td>
              <td>
                {contact.ico ?? "-"} / {contact.dic ?? "-"}
              </td>
              <td>
                <div className="table-actions">
                  <Link className="button button-sm" to={`/invoices/new?contactId=${contact.id}`}>
                    Vystavit fakturu
                  </Link>
                  <button className="button-sm" type="button" onClick={() => edit(contact)}>
                    Upravit
                  </button>
                  <button type="button" className="button-sm danger" onClick={() => remove(contact.id)}>
                    Smazat
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
