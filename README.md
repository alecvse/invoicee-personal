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

## Kontroly

```bash
npm run lint
npm run build
npm run test --workspace backend
npm run test --workspace frontend
npm run test:e2e
```

ARES, ČNB a ČSÚ jsou volitelné externí zdroje pro lookupy a statistiky. Odesílání e-mailů přes Gmail vyžaduje vlastní OAuth údaje v `backend/.env`.
