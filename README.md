# Kamila Kopřivová – web

Finální upravená verze webu s napojením na Poski XML export.

## Úpravy v této verzi

- opravené oddělení aktivních, rezervovaných a realizovaných nabídek,
- realizované obchody jsou součástí stránky `nemovitosti.html`, samostatná stránka realizací není potřeba,
- řazení nabídek je podle data přidání (`created`), ne podle data poslední aktualizace,
- SVG ikony místo emoji,
- odstraněné načítání Google Fonts kvůli minimalizaci externích požadavků,
- přidaná stránka `gdpr.html`,
- připravený formulář ocenění přes `/api/oceneni` s možností napojení na Formspree přes proměnnou `FORMSPREE_ENDPOINT`,
- lokální fallback obrázky bez externího Unsplash načítání.

## Vercel env

Povinné:

```
POSKI_XML_URL=https://...
```

Volitelné pro formulář ocenění:

```
FORMSPREE_ENDPOINT=https://formspree.io/f/...
```
