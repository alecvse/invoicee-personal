# Invoicee

Lokální single-user aplikace pro správu kontaktů, bankovních účtů, faktur, PDF exportů, CSV reportů a záloh. Aplikace nepoužívá autentizaci ani DPH; provozní data zůstávají lokálně v adresáři `data/`.

## Požadavky

- Node.js 20 nebo novější
- npm 10 nebo novější

## Spuštění

```bash
npm install
cp backend/.env.example backend/.env
npm run db:generate
npm run db:migrate
npm run dev
```

Frontend poběží na `http://localhost:5173` a API na `http://localhost:3001`.

Při prvním spuštění backend vytvoří prázdnou lokální SQLite databázi a výchozí nastavení. Faktury, kontakty, PDF soubory, zálohy a případný Gmail token se ukládají pouze do `data/`; tento adresář je záměrně ignorovaný Gitem.

## Faktury a PDF

Koncept nemá číslo ani PDF. Vystavené faktury lze stáhnout v češtině nebo angličtině. V Nastavení lze zvolit výchozí šablonu PDF **Classic** nebo **Classic Rows**; při vytváření a úpravě faktury lze vybrat šablonu jen pro danou fakturu. Classic Rows zobrazuje položky samostatně a celkový součet pod jejich rozpisem.

## Odesílání přes Gmail

Volitelné odesílání PDF faktur vyžaduje OAuth klienta s přesměrováním na `http://localhost:3001/api/gmail/oauth/callback`. Vyplňte `GMAIL_CLIENT_ID` a `GMAIL_CLIENT_SECRET` v `backend/.env` a poté propojte účet v Nastavení. Odeslání a opakované odeslání je dostupné v detailu vystavené faktury. Připojení lze v Nastavení odpojit; přihlašovací token zůstává pouze v lokálním `data/` a není součástí záloh.

## Zálohy

Zálohu lze vytvořit a obnovit v Nastavení. Před obnovou aplikace automaticky vytvoří bezpečnostní zálohu aktuálních dat.

## Kontroly

```bash
npm run lint
npm run build
npm run test --workspace backend
npm run test --workspace frontend
npm run test:e2e
```

ARES, ČNB a ČSÚ jsou volitelné externí zdroje pro lookupy a statistiky.

Přehled změn jednotlivých verzí je v [historii změn](frontend/src/data/changelog.ts).
