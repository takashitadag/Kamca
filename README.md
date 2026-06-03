# Kamila Kopřivová – realitní web

Projekt je připravený pro Vercel a XML export z Reality Proradost / Poski.

## Nastavení exportu na Vercelu

Vercel → Project → Settings → Environment Variables:

```txt
POSKI_XML_URL=https://www.reality-proradost.cz/poskireal/export/xml/GetAll.php?id=...&only_uzivatel=...&pwdhash=...
```

Po uložení proměnné spusť nový deploy.

## Důležité

- URL XML exportu nedávej přímo do HTML ani do veřejného JavaScriptu.
- Aktivní nabídky se načítají přes `/api/nemovitosti?status=active`.
- Realizované obchody se načítají přes `/api/nemovitosti?status=sold`.
- Detail nabídky se načítá přes `/api/nemovitosti?id=ID_NABIDKY`.
- Obrázky z Poski se používají přímo z XML exportu.

