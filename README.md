# Kamila Kopřivová – web

Finální kontrolovaná verze webu s napojením na Poski XML export.

## Úpravy v této verzi

- zkontrolované návaznosti mezi stránkami a odstraněné odkazy na samostatnou stránku realizací,
- realizované obchody jsou součástí stránky `nemovitosti.html`,
- aktivní a rezervované nabídky se nemíchají s realizovanými obchody,
- realizace jsou zobrazené jako portfolio bez filtrů,
- řazení nabídek je podle data přidání `created`; pokud datum chybí, zachová se pořadí z Poski feedu,
- API si při načítání feedu doplní `orderby=new&sort=DESC`, pokud už nejsou v URL nastavené,
- opravené rozlišování dokončených zakázek na `Prodáno`, `Pronajato` a `Realizováno`,
- detail nemovitosti dynamicky upravuje title, meta description, Open Graph, Twitter metadata a canonical URL,
- SVG ikony místo emoji,
- Google Fonts vrácené do kódu kvůli zachování původního vzhledu,
- doplněný `favicon.svg`,
- doplněná stránka `404.html`,
- doplněná informace v GDPR, že web nepoužívá analytické ani marketingové cookies,
- připravený formulář ocenění přes `/api/oceneni` s možností napojení na Formspree přes proměnnou `FORMSPREE_ENDPOINT`,
- lokální fallback obrázky bez externího Unsplash načítání.

## Vercel env

Povinné:

```bash
POSKI_XML_URL=https://...
```

Volitelné pro formulář ocenění:

```bash
FORMSPREE_ENDPOINT=https://formspree.io/f/...
```
