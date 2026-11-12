# MyInvoiceApp – pokyny pro práci

## Kontext a zdroj pravdy

Invoicee je lokální single-user aplikace bez autentizace a bez DPH. Spravuje kontakty, bankovní účty, faktury, PDF, CSV exporty a zálohy. Data zůstávají v `data/`; externě se používají jen ARES, ČNB, ČSÚ a volitelné odesílání přes Gmail API.

Aktuální kód, Prisma schema, migrace a testy mají přednost před starými zadáními. Historie vydaných změn je ve `frontend/src/data/changelog.ts`. S mazáním a datovými změnami zacházej jako s obtížně vratnými operacemi.

## Struktura

- npm workspaces: kořen, `backend/`, `frontend/`.
- `frontend/src/pages/` obsahuje routované React stránky; sdílené UI je v `components/`, API kontrakty a klient v `api/`.
- `backend/src/routes/` obsahuje Express endpointy; business a integrační logika patří do `services/`, validace do `validation.ts`.
- PDF orchestrace je v `services/invoicePdfService.ts`, renderery v `services/pdf/`.
- Prisma schema a migrace jsou v `backend/prisma/`.
- `data/app.db` je jediná ostrá SQLite DB; `data/` dále obsahuje PDF, zálohy a Gmail token. `backend/data/` je pouze pro testovací DB. Tyto soubory neupravuj ani nevypisuj bez výslovného požadavku.

## Lokální workflow

Požadováno je Node.js 20+ a npm 10+.

```bash
npm install
cp backend/.env.example backend/.env
npm run db:generate
npm run db:migrate
npm run dev
```

Frontend běží na `http://localhost:5173`, API na `http://localhost:3001`. `start-browser.command` a `stop-browser.command` obsluhují jen procesy tohoto projektu na portech 3001/5173/5174.

Před předáním změny spusť nejmenší relevantní sadu:

```bash
npm run lint
npm run build
npm run test --workspace backend
npm run test --workspace frontend
npm run test:e2e
```

Kořenové `npm test` spouští backend testy a Playwright, ne frontend unit testy.

## Produktové invarianty

- Stavy faktury jsou `draft | issued | sent | paid`; `overdue` je pouze odvozený stav pro UI.
- Koncept nemá číslo, variabilní symbol, PDF ani možnost odeslání.
- Číslo `YYYY-NN` vychází z roku `issueDate`; po smazání se dnes znovu používá nejnižší volné číslo. Tuto účetní politiku neměň bez výslovného rozhodnutí a regresního testu. Variabilní symbol vzniká odstraněním pomlčky.
- USD faktury ukládají snapshot kurzu do CZK. Zachovej fallbacky pro historické záznamy bez snapshotu.
- PDF podporuje `classic` i `classic_rows`, češtinu i angličtinu. `classic_rows` zobrazuje pouze název položky a její výslednou cenu; celkový součet je pod rozpisem. Konkrétní faktura může uložit vlastní `pdfTemplate`; hodnota `null` používá výchozí šablonu z Nastavení. QR je jen pro způsobilé CZK faktury; EN/USD používá routing a SWIFT/BIC údaje.
- Odeslání přes Gmail používá stejné generování PDF jako stažení. Refresh token nesmí skončit v DB, API odpovědi, logu, záloze ani dokumentaci.
- Obnova zálohy musí před přepsáním dat vytvořit bezpečnostní zálohu.

## Konvence změn

Navazuj na existující komponenty, helpery, české UI texty, Tailwind/CSS styl a error envelope. Přidávej závislosti jen při prokázané potřebě. U změn formulářů ověř validaci, loading/error/success stavy, klávesnici, fokus a úzký viewport. U změn PDF ověř obě šablony a relevantní kombinace jazyka/měny.

Při uživatelsky viditelné změně aktualizuj `frontend/src/data/changelog.ts`. Při release změně synchronizuj verzi v kořenovém, backendovém a frontendovém `package.json` i lockfile. Projekt drž lokálně; nepublikuj ani nenasazuj bez výslovného požadavku.
