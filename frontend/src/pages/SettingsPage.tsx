import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { AccountType, BackupSummary, BankAccount, GmailStatus, Settings } from "../api/types";

type SettingsInput = Omit<Settings, "id" | "createdAt" | "updatedAt">;

type BankAccountInput = Omit<BankAccount, "id" | "createdAt" | "updatedAt">;
type BackupActionType = "restore" | "delete";

const emptyBankAccount: BankAccountInput = {
  label: "",
  currency: "CZK",
  accountType: "local",
  iban: null,
  bic: null,
  routingNumber: null,
  accountNumber: null,
  bankCode: null,
  isDefault: false
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString("cs-CZ")} ${date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<SettingsInput | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [accountForm, setAccountForm] = useState<BankAccountInput>(emptyBankAccount);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoadingId, setRestoreLoadingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);
  const [pendingBackupAction, setPendingBackupAction] = useState<{
    type: BackupActionType;
    backupId: string;
  } | null>(null);
  const isUsdAccount = accountForm.currency.trim().toUpperCase() === "USD";

  async function load() {
    try {
      const [settingsResult, accountResult, backupsResult, gmailResult] = await Promise.all([
        api.settings.get(),
        api.bankAccounts.list(),
        api.backup.list(),
        api.gmail.status()
      ]);
      setSettings({
        supplierName: settingsResult.supplierName,
        supplierStreet: settingsResult.supplierStreet,
        supplierCity: settingsResult.supplierCity,
        supplierZip: settingsResult.supplierZip,
        supplierCountry: settingsResult.supplierCountry,
        supplierICO: settingsResult.supplierICO,
        supplierEmail: settingsResult.supplierEmail,
        supplierPhone: settingsResult.supplierPhone,
        defaultDueDays: 3,
        invoiceNumberFormat: "YYYY-NN",
        pdfTemplate: settingsResult.pdfTemplate
      });
      setAccounts(accountResult);
      setBackups(backupsResult);
      setGmailStatus(gmailResult);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;

    try {
      await api.settings.update(settings);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();

    try {
      if (editingAccountId) {
        await api.bankAccounts.update(editingAccountId, accountForm);
      } else {
        await api.bankAccounts.create(accountForm);
      }
      setAccountForm(emptyBankAccount);
      setEditingAccountId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createBackup() {
    try {
      setBackupLoading(true);
      await api.backup.create(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBackupLoading(false);
    }
  }

  async function restoreBackup(backupId: string) {
    try {
      setRestoreLoadingId(backupId);
      await api.backup.restore(backupId, true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoreLoadingId(null);
    }
  }

  async function removeBackup(backupId: string) {
    try {
      setDeleteLoadingId(backupId);
      await api.backup.remove(backupId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteLoadingId(null);
    }
  }

  async function removeAccount(id: string) {
    if (!window.confirm("Opravdu chcete bankovní účet smazat?")) {
      return;
    }

    try {
      await api.bankAccounts.remove(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function disconnectGmail() {
    if (!window.confirm("Opravdu chcete odpojit Gmail?")) {
      return;
    }

    try {
      setGmailDisconnecting(true);
      await api.gmail.disconnect();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGmailDisconnecting(false);
    }
  }

  function editAccount(account: BankAccount) {
    setEditingAccountId(account.id);
    setAccountForm({
      label: account.label,
      currency: account.currency,
      accountType: account.accountType,
      iban: account.iban,
      bic: account.bic,
      routingNumber: account.routingNumber,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      isDefault: account.isDefault
    });
  }

  function switchType(accountType: AccountType) {
    setAccountForm((prev) => ({
      ...prev,
      accountType,
      iban: accountType === "iban" ? prev.iban : null,
      bic: prev.bic,
      accountNumber: accountType === "local" ? prev.accountNumber : null,
      bankCode: accountType === "local" ? prev.bankCode : null
    }));
  }

  async function confirmPendingBackupAction() {
    if (!pendingBackupAction) {
      return;
    }

    const { type, backupId } = pendingBackupAction;
    setPendingBackupAction(null);

    if (type === "restore") {
      await restoreBackup(backupId);
      return;
    }

    await removeBackup(backupId);
  }

  if (!settings) {
    return <p>{error ? `Chyba: ${error}` : "Načítání..."}</p>;
  }

  return (
    <section>
      <h2>Nastavení</h2>
      {error ? <p className="error">{error}</p> : null}

      <form className="stack box" onSubmit={saveSettings}>
        <h3>Údaje dodavatele</h3>
        <div className="grid-3">
          <label>
            Moje údaje
            <input
              value={settings.supplierName}
              onChange={(e) => setSettings({ ...settings, supplierName: e.target.value })}
            />
          </label>
          <label>
            Ulice
            <input
              value={settings.supplierStreet}
              onChange={(e) => setSettings({ ...settings, supplierStreet: e.target.value })}
            />
          </label>
          <label>
            Město
            <input
              value={settings.supplierCity}
              onChange={(e) => setSettings({ ...settings, supplierCity: e.target.value })}
            />
          </label>
          <label>
            PSČ
            <input
              value={settings.supplierZip}
              onChange={(e) => setSettings({ ...settings, supplierZip: e.target.value })}
            />
          </label>
          <label>
            Země
            <input
              value={settings.supplierCountry}
              onChange={(e) => setSettings({ ...settings, supplierCountry: e.target.value })}
            />
          </label>
          <label>
            IČ
            <input
              value={settings.supplierICO ?? ""}
              onChange={(e) => setSettings({ ...settings, supplierICO: e.target.value || null })}
            />
          </label>
          <label>
            E-mail dodavatele
            <input
              value={settings.supplierEmail ?? ""}
              onChange={(e) => setSettings({ ...settings, supplierEmail: e.target.value || null })}
            />
          </label>
          <label>
            Telefon dodavatele
            <input
              value={settings.supplierPhone ?? ""}
              onChange={(e) => setSettings({ ...settings, supplierPhone: e.target.value || null })}
            />
          </label>
          <label>
            PDF šablona
            <select
              value={settings.pdfTemplate}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  pdfTemplate: e.target.value as SettingsInput["pdfTemplate"]
                })
              }
            >
              <option value="classic">Classic</option>
              <option value="mondrian">Mondrian</option>
            </select>
            <span className="field-hint">Zvolená šablona se použije pro všechny nově stahované PDF faktury.</span>
          </label>
        </div>
        <button type="submit" className="self-start px-2 py-1.5">
          Uložit údaje dodavatele
        </button>
      </form>

      <div className="stack box">
        <h3>Odesílání přes Gmail</h3>
        {searchParams.get("gmail") === "connected" ? (
          <p className="success">Gmail byl úspěšně propojen.</p>
        ) : null}
        {gmailStatus?.configured ? (
          gmailStatus.connected ? (
            <p className="text-sm">
              Propojeno jako <strong>{gmailStatus.email}</strong>. Faktury lze odesílat z detailu faktury.
            </p>
          ) : (
            <p>Gmail je nastavený, ale zatím není propojený.</p>
          )
        ) : (
          <p>
            Gmail není nastavený. Doplňte OAuth údaje <code>GMAIL_CLIENT_ID</code> a <code>GMAIL_CLIENT_SECRET</code> do
            <code> backend/.env</code> a restartujte backend.
          </p>
        )}
        <div className="inline-controls">
          {gmailStatus?.configured && !gmailStatus.connected ? (
            <a className="button" href={api.gmail.connectUrl}>
              Propojit Gmail
            </a>
          ) : null}
          {gmailStatus?.connected ? (
            <button type="button" onClick={disconnectGmail} disabled={gmailDisconnecting}>
              {gmailDisconnecting ? "Odpojuji..." : "Odpojit Gmail"}
            </button>
          ) : null}
        </div>
      </div>

      <form className="stack box" onSubmit={saveAccount}>
        <h3>Bankovní účty</h3>
        <div className="grid-3">
          <label>
            Název
            <input
              value={accountForm.label}
              onChange={(e) => setAccountForm({ ...accountForm, label: e.target.value })}
            />
          </label>
          <label>
            Měna
            <input
              value={accountForm.currency}
              onChange={(e) =>
                setAccountForm({
                  ...accountForm,
                  currency: e.target.value.toUpperCase(),
                  routingNumber: e.target.value.toUpperCase() === "USD" ? accountForm.routingNumber : null
                })
              }
            />
          </label>
          <label>
            Typ účtu
            <select
              value={accountForm.accountType}
              onChange={(e) => switchType(e.target.value as AccountType)}
            >
              <option value="local">Lokální</option>
              <option value="iban">IBAN</option>
            </select>
          </label>

          {accountForm.accountType === "iban" ? (
            <>
              <label>
                IBAN
                <input
                  value={accountForm.iban ?? ""}
                  onChange={(e) => setAccountForm({ ...accountForm, iban: e.target.value || null })}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Číslo účtu
                <input
                  value={accountForm.accountNumber ?? ""}
                  onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value || null })}
                />
              </label>
              <label>
                Kód banky
                <input
                  value={accountForm.bankCode ?? ""}
                  onChange={(e) => setAccountForm({ ...accountForm, bankCode: e.target.value || null })}
                />
              </label>
            </>
          )}

          {accountForm.accountType === "iban" || isUsdAccount ? (
            <label>
              {isUsdAccount ? "SWIFT/BIC" : "BIC"}
              <input
                value={accountForm.bic ?? ""}
                onChange={(e) => setAccountForm({ ...accountForm, bic: e.target.value || null })}
              />
            </label>
          ) : null}

          {isUsdAccount ? (
            <label>
              Routing number
              <input
                value={accountForm.routingNumber ?? ""}
                onChange={(e) => setAccountForm({ ...accountForm, routingNumber: e.target.value || null })}
              />
            </label>
          ) : null}

          <div className="checkbox-input-align">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={accountForm.isDefault}
                onChange={(e) => setAccountForm({ ...accountForm, isDefault: e.target.checked })}
              />
              Výchozí účet
            </label>
          </div>
        </div>
        <div className="inline-controls">
          <button type="submit">{editingAccountId ? "Uložit účet" : "Přidat účet"}</button>
          {editingAccountId ? (
            <button
              type="button"
              onClick={() => {
                setEditingAccountId(null);
                setAccountForm(emptyBankAccount);
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
            <th>Název</th>
            <th>Měna</th>
            <th>Typ</th>
            <th>Účet</th>
            <th>Výchozí</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id}>
              <td>{account.label}</td>
              <td>{account.currency}</td>
              <td>{account.accountType}</td>
              <td>
                {account.accountType === "iban"
                  ? `${account.iban}${account.bic ? ` (${account.bic})` : ""}`
                  : `${account.accountNumber}${account.bankCode ? `/${account.bankCode}` : ""}${
                      account.currency.toUpperCase() === "USD" && account.routingNumber
                        ? ` • Routing ${account.routingNumber}`
                        : ""
                    }${account.currency.toUpperCase() === "USD" && account.bic ? ` • SWIFT ${account.bic}` : ""}`}
              </td>
              <td>{account.isDefault ? "Ano" : "Ne"}</td>
              <td className="table-actions">
                <button className="button-sm" type="button" onClick={() => editAccount(account)}>
                  Upravit
                </button>
                <button type="button" className="button-sm danger" onClick={() => removeAccount(account.id)}>
                  Smazat
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="stack box">
        <h3>Zálohy dat</h3>
        <div className="inline-controls">
          <button type="button" onClick={createBackup} disabled={backupLoading}>
            {backupLoading ? "Vytvářím zálohu..." : "Vytvořit zálohu"}
          </button>
        </div>

        {backups.length === 0 ? (
          <p>Zatím nejsou vytvořené žádné zálohy.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID zálohy</th>
                <th>Vytvořeno</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.id}>
                  <td>{backup.id}</td>
                  <td>{formatDateTime(backup.createdAt)}</td>
                  <td className="table-actions">
                    <button
                      type="button"
                      className="button-sm"
                      onClick={() => setPendingBackupAction({ type: "restore", backupId: backup.id })}
                      disabled={restoreLoadingId === backup.id}
                    >
                      {restoreLoadingId === backup.id ? "Obnovuji..." : "Obnovit"}
                    </button>
                    <button
                      type="button"
                      className="button-sm danger"
                      onClick={() => setPendingBackupAction({ type: "delete", backupId: backup.id })}
                      disabled={deleteLoadingId === backup.id}
                    >
                      {deleteLoadingId === backup.id ? "Mažu..." : "Smazat"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pendingBackupAction ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setPendingBackupAction(null)}
        >
          <div
            className="modal-dialog box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="backup-confirm-title">Potvrzení akce</h3>
            <p>
              Opravdu chcete {pendingBackupAction.type === "restore" ? "obnovit" : "smazat"} zálohu?
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => void confirmPendingBackupAction()}>
                Ano
              </button>
              <button type="button" onClick={() => setPendingBackupAction(null)}>
                Zrušit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
