export type ChangelogEntry = {
  version: string;
  releasedAt: string;
  title: string;
  highlights: string[];
};

export const changelogEntries: ChangelogEntry[] = [
  {
    version: "v1.2.4",
    releasedAt: "2026-11-12",
    title: "Bezpečnostní aktualizace",
    highlights: [
      "Aktualizované knihovny opravují známé bezpečnostní chyby v aplikaci."
    ]
  },
  {
    version: "v1.2.3",
    releasedAt: "2026-10-02",
    title: "Rozpis položek v PDF a výběr šablony u faktury",
    highlights: [
      "Nová PDF šablona Classic Rows zobrazuje každou položku samostatně ve sloupcích Položka a Cena za položku; celkový součet je uveden až pod rozpisem.",
      "Classic Rows zachovává vzhled Classic s úspornějšími rozestupy. Titulky jsou blíž položkám, pod titulky není fialová linka a pod poslední položkou není šedá linka. Poznámka se v této šabloně nezobrazuje.",
      "Delší rozpisy a popisy položek mohou pokračovat na dalších stránkách s opakovanými titulky tabulky.",
      "Při vytváření i úpravě faktury lze vybrat Classic nebo Classic Rows, případně ponechat výchozí šablonu z Nastavení. Vlastní volba se ukládá k faktuře a má přednost před výchozím nastavením.",
      "Stejná PDF šablona se používá při stažení i odeslání přes Gmail. Při duplikování faktury se její volba šablony zachová.",
      "Experimentální šablona Mondrian byla odstraněna; případné starší nastavení této šablony se převádí na Classic.",
      "Obnova starších záloh doplní nové pole pro PDF šablonu faktury a převede vyřazené nastavení Mondrian. Před obnovou zůstává zachované vytvoření bezpečnostní zálohy."
    ]
  },
  {
    version: "v1.2.2",
    releasedAt: "2026-09-25",
    title: "Poslední dostupná mediánová mzda",
    highlights: [
      "Karta mediánové mzdy zobrazuje poslední dostupný čtvrtletní údaj ČSÚ i v době, kdy novější článek medián neobsahuje; pod částkou uvádí skutečné období údaje."
    ]
  },
  {
    version: "v1.2.1",
    releasedAt: "2026-08-03",
    title: "Kompletní odesílání faktur přes Gmail",
    highlights: [
      "V Nastavení lze propojit Gmail přes Google OAuth bez ukládání hesla; účet lze také bezpečně odpojit a znovu propojit.",
      "Přihlašovací oprávnění pro odesílání se ukládá pouze lokálně jako refresh token s omezenými právy a zabezpečením souboru 0600; není v databázi, API odpovědích ani zálohách.",
      "Z detailu vystavené faktury lze odeslat českou nebo anglickou PDF fakturu na zvolenou e-mailovou adresu s upravitelným předmětem a textem zprávy.",
      "Při odesílání lze doplnit druhého příjemce; oba dostanou stejnou zprávu s PDF přílohou.",
      "E-mail se odesílá přes Gmail API jako MIME zpráva s UTF-8 předmětem, textem a PDF přílohou.",
      "Po úspěšném odeslání se ukládá čas odeslání, příjemce a ID zprávy; u odeslané faktury je dostupná akce Odeslat znovu.",
      "Faktura se po úspěšném odeslání automaticky přepne do stavu Odesláno. Stav je vidět v detailu, seznamech, dashboardu i historii kontaktu a lze podle něj filtrovat faktury.",
      "Po označení jako uhrazené faktura přejde na Uhrazeno; při odznačení se vrátí na Odesláno, pokud už byla odeslána e-mailem.",
      "Přidána validace příjemce a ochrana před zalomením hlaviček; koncepty nelze odeslat.",
      "Neplatné nebo expirované OAuth připojení i chyby Gmail API zobrazují srozumitelný stav a po splatnosti zůstává zachovaný stav Po splatnosti."
    ]
  },
  {
    version: "v1.2.0",
    releasedAt: "2026-06-02",
    title: "Bezpečnostní a údržbová vlna",
    highlights: [
      "Produkční i vývojový audit závislostí je zelený: proběhla patch/minor dependency vlna, migrace na Vitest 4 a transitive opravy `picomatch` a `postcss`.",
      "Obnova záloh je bezpečnější, protože před restore vzniká automatická `pre-restore-*` záloha aktuální databáze a PDF souborů.",
      "Market stats jsou odolnější vůči výpadkům a změnám ČSÚ: cache drží poslední dobré hodnoty, paralelní requesty sdílí jeden refresh a ČSÚ parsing je oddělený do samostatného service modulu.",
      "Dev-only `apiBase` override už nepřijímá libovolné vzdálené URL a povoluje jen relativní cestu nebo lokální adresy.",
      "Testovací baseline se rozšířila o regresní scénáře pro backup restore, market stats fallback, apiBase hardening a Vitest 4 konfiguraci."
    ]
  },
  {
    version: "v1.1.7",
    releasedAt: "2026-04-08",
    title: "Kumulativní průměr v dashboard grafu",
    highlights: [
      "Rovná průměrná čára v grafu Celkem fakturováno byla nahrazena kumulativní křivkou, která se po měsících průběžně přepočítává podle skutečných částek.",
      "Křivka používá stejný barevný gradient jako sparkliny v kartách kurzů a statistiky, dostala bílý obrys pro lepší čitelnost a body na křivce mají solid barvu odpovídající přesnému místu na trase.",
      "Do legendy grafu přibyl přepínač Průměr, kterým lze overlay křivky kdykoliv zapnout nebo vypnout.",
      "Tooltip průměrné křivky zobrazuje už jen částku, zatímco tooltipy sloupců zůstaly funkční i po přidání overlaye díky opravě pointer event vrstvy.",
      "Graf vybraného kontaktu na stránce Faktury nově přebírá měsíční částky nad sloupci z dashboardu a tooltip se vykresluje mimo kartu, takže už při hoveru neposkakuje její výška.",
      "Výpočet kumulativního průměru a barev bodů je nově pokrytý frontend testy, aby zůstaly stabilní fallbacky i chování ve světlém a tmavém režimu."
    ]
  },
  {
    version: "v1.1.6",
    releasedAt: "2026-03-31",
    title: "Popisky měsíčního grafu na dashboardu",
    highlights: [
      "Nad každý sloupec v grafu Celkem fakturováno se nově zobrazuje celková částka za daný měsíc v Kč.",
      "Prázdné měsíce ukazují `0 Kč` ve světlejší šedé, aby byly od běžných částek vizuálně odlišené.",
      "Tooltip grafu je vykreslovaný mimo kartu, takže už při hoveru neskáče výška grafové karty.",
      "Spodní okraj karty grafu má větší odsazení, takže měsíční popisky už nejsou nalepené na hranu."
    ]
  },
  {
    version: "v1.1.5",
    releasedAt: "2026-03-26",
    title: "Hladší kurzové sparkliny",
    highlights: [
      "CZK/USD a CZK/EUR sparkliny teď používají plynulejší Bézier křivku místo lomené čáry.",
      "Linka má jemnější gradient, měkčí glow a subtilnější výplň pod křivkou ve světlém i tmavém režimu.",
      "Tooltipy a hover body zůstaly na původních souřadnicích, takže se nezměnilo chování grafu ani přesnost bodů.",
      "Smooth path helper je pokrytý testem, který hlídá, že monotónní řada neovershootuje."
    ]
  },
  {
    version: "v1.1.4",
    releasedAt: "2026-03-26",
    title: "Trendové sparkliny v kartách trhu práce a kurzů",
    highlights: [
      "Karty v sekci Kurzy a statistiky nově ukazují malé liniové grafy pro vývoj CZK/USD, CZK/EUR, mediánové mzdy a průměrné mzdy.",
      "Kurzové grafy zobrazují poslední tři měsíce denních hodnot z ČNB a mzdové grafy skládají posledních 12 měsíců z čtvrtletních dat ČSÚ.",
      "Na hover a focus se zobrazuje tooltip s přesnou hodnotou a obdobím, takže trend zůstává čitelný i bez rozklikávání detailu.",
      "Endpoint `/api/stats/current-market` byl rozšířen o historické řady při zachování původních top-level hodnot pro kompatibilitu."
    ]
  },
  {
    version: "v1.1.3",
    releasedAt: "2026-03-26",
    title: "Kurzy a statistiky na dashboardu",
    highlights: [
      "Na dashboard přibyla nová sekce Kurzy a statistiky se čtyřmi kartami pro aktuální kurz USD, kurz EUR, mediánovou mzdu v ČR a průměrnou hrubou mzdu v ČR.",
      "Data se načítají server-side přes ČNB a ČSÚ, takže prohlížeč nevolá externí zdroje přímo.",
      "Backend drží krátkou in-memory cache a při výpadku externího zdroje bezpečně fallbackuje na poslední úspěšně načtené hodnoty.",
      "Dashboard nově zobrazuje u těchto metrik i referenční datum nebo období, aby bylo jasné, odkud aktuální hodnota pochází."
    ]
  },
  {
    version: "v1.1.2",
    releasedAt: "2026-03-26",
    title: "Tooltipy stavu a přesnější průměr v grafu",
    highlights: [
      "Na badge stavu `paid` se nově zobrazuje tooltip s časem, kdy byla faktura označena jako uhrazená.",
      "Tooltip používá stejný vizuální styl jako tooltipy v dashboard grafu a zobrazuje datum i čas včetně minut.",
      "Průměrná čára v měsíčním grafu se u aktuálního roku počítá jen z uplynulých měsíců včetně aktuálního.",
      "Historické roky dál používají průměr za všech 12 měsíců, aby zůstalo srovnání mezi roky konzistentní."
    ]
  },
  {
    version: "v1.1.1",
    releasedAt: "2026-03-02T17:40:00+01:00",
    title: "Oprava číslování po smazání faktury",
    highlights: [
      "Číslování nových vydaných faktur teď obsazuje nejnižší volné číslo v daném roce místo slepého pokračování sekvence.",
      "Po smazání vydané faktury se při dalším vystavení vyplní vzniklá mezera a číselná řada nezůstane přerušená.",
      "Backend testy nově ověřují i scénář smazání prostřední faktury a opětovného použití jejího čísla.",
      "Na Dashboardu přibyl vedle výběru roku rychlý odkaz pro vytvoření nové faktury.",
      "Tabulka faktur nově skrývá sloupec Přepočet CZK u kontaktů bez USD faktur a akce vpravo jsou vizuálně více semknuté.",
      "Download button v seznamu faktur má přesnou výšku 30 px podle řádkových akcí a přesně vycentrovanou ikonu.",
      "Ve všech tabulkách s fakturami je stav nově vytažený do samostatného sloupce Stav faktury hned vedle čísla.",
      "Graf na stránce Faktury nově ukazuje tooltip s měsíční částkou a počtem vydaných faktur pro vybraný kontakt.",
      "Technický a produktový kontext pro další práci je soustředěný v kořenovém `AGENTS.md`."
    ]
  },
  {
    version: "v1.1.0",
    releasedAt: "2026-03-02T22:30:00+01:00",
    title: "Volitelné PDF šablony a nová Mondrian kompozice",
    highlights: [
      "V Nastavení přibyla globální volba PDF šablony, která se používá pro všechny nově exportované faktury.",
      "Stávající vzhled zůstává dostupný jako Classic a beze změn zachovává dosavadní layout i business pravidla.",
      "Nová šablona Mondrian přináší odvážnější galerijní kompozici s hustým gridem, výraznými primárními plochami a samostatným layoutem pro CZ i EN faktury.",
      "Mondrian varianta podporuje QR platbu u CZK českých faktur i wire údaje u USD anglických faktur.",
      "Backend přepíná renderery podle nastavení a při chybě Mondrian šablony bezpečně fallbackuje zpět na Classic."
    ]
  },
  {
    version: "v1.0.0",
    releasedAt: "2026-03-02",
    title: "Šablony kontaktů, koncepty a práce s historií faktur",
    highlights: [
      "Kontakty nově mají vlastní detail se souhrnem údajů, historií faktur a přehledem poslední aktivity.",
      "Na detailu kontaktu lze uložit šablonu faktury včetně položek, měny, poznámky a výchozího účtu.",
      "Faktury podporují stav Koncept bez přiděleného čísla a PDF je dostupné až po vystavení.",
      "Z detailu i seznamu faktur lze jedním klikem vytvořit duplikát jako nový koncept k další úpravě.",
      "Formulář nové faktury umí použít šablonu vybraného kontaktu a zůstává zachované i přenesení údajů z minulé faktury."
    ]
  },
  {
    version: "v0.9.0",
    releasedAt: "2026-02-28",
    title: "UI polish, dark mode a přehlednější faktury",
    highlights: [
      "Přidán světlý a tmavý režim s přepínačem v horní liště.",
      "V Přehledu a Fakturách přibyly akce pro označení faktur jako uhrazené.",
      "Do tabulek byly doplněny akce pro přímé stažení PDF faktury podle měny.",
      "Byly sjednoceny styly tabulek, badge, tlačítek a odkazů včetně hover stavů.",
      "Pozadí aplikace bylo vráceno na stabilní statický gradient ve světlé i tmavé variantě."
    ]
  },
  {
    version: "v0.8.0",
    releasedAt: "2026-02-27",
    title: "ARES lookup, USD workflow a robustnější backend",
    highlights: [
      "Kontakty umí předvyplnit data podle IČ přes ARES včetně ulic, PSČ a DIČ.",
      "Byla přidána podpora USD faktur včetně Routing Number, SWIFT/BIC a EN PDF variant.",
      "USD přepočty pracují s kurzem ČNB podle data vystavení faktury.",
      "Backend sjednotil chybové odpovědi a omezil CORS na lokální adresy.",
      "Přidány backup/restore endpointy a CSV export faktur pro účetní workflow."
    ]
  },
  {
    version: "v0.7.0",
    releasedAt: "2026-02-26",
    title: "Nový PDF layout a QR platba pro CZK faktury",
    highlights: [
      "PDF export faktur byl kompletně přepracován podle referenční sazby Inter + indigo/slate stylu.",
      "České PDF obsahuje QR platbu s účtem, variabilním symbolem a částkou.",
      "Byly opraveny české znaky, formát dat a jednotné odsazení sekcí od oddělovacích linek.",
      "PDF nyní rozlišuje CZ a EN variantu podle měny a jazykového kontextu."
    ]
  },
  {
    version: "v0.6.0",
    releasedAt: "2026-02-25",
    title: "Přehledy, grafy a práce s historií faktur",
    highlights: [
      "Dashboard dostal bloky přehledů rozdělené pro CZK a USD.",
      "Byl přidán měsíční graf Celkem fakturováno s tooltipy a vyznačenou průměrnou částkou.",
      "Při tvorbě faktury lze přenést název i částku z poslední faktury vybraného kontaktu.",
      "Tabulky faktur zobrazují přepočet USD faktur do Kč a podporují rychlé filtrování."
    ]
  },
  {
    version: "v0.5.0",
    releasedAt: "2026-02-24",
    title: "Základ aplikace Invoicee",
    highlights: [
      "Vznikla lokální fakturační aplikace pro správu kontaktů, bankovních účtů, nastavení a faktur.",
      "Byly zavedeny PDF exporty, české a anglické varianty faktur a lokální SQLite databáze.",
      "Frontend byl sjednocen do jednoho design systému nad Tailwind CSS a fontem Inter."
    ]
  }
];
