# Hirnfutter 2

Lern-App für Schülerinnen und Schüler der Sek I: Karteikarten, Aufgabensets (Üben und Blatt), Erstellen per KI-Auftrag mit Copy-Paste, Bibliothek, Krümel, Avatar und Laden. Dazu ein Lehrermodus mit Klassencodes.

Vanilla JS, [Vite](https://vite.dev), `vite-plugin-pwa`. Die App läuft komplett im Browser; Fortschritt, Sets und Krümel liegen nur auf dem Gerät der Schülerin bzw. des Schülers.

## Entwickeln

```
npm install
npm run dev        # Entwicklungsserver
npm run build      # erzeugt den Ordner dist
```

`dist` wird von Hand bei Cloudflare Pages hochgeladen (Ziehen und Ablegen).

## Klassencodes und Lehrermodus

Der Server (`server/worker.js`) ist ein Cloudflare Worker mit KV-Speicher. Einrichten, Rechte, Datenschutz und lokaler Testserver: [server/LEHRERMODUS.md](server/LEHRERMODUS.md).

Die Adresse des Workers steht in `src/server-adresse.js`. Bei Änderungen am Worker die Version dort (`SERVER_VERSION`) und in `server/worker.js` (`VERSION`) gleich setzen, damit die App merkt, wenn der Server veraltet ist.

## Datenschutz

Auf dem Server liegt nur Lernmaterial (Klassen, Sets, Lehrpersonen mit Hash des Lehrercodes). Keine Schülerdaten, keine Logins, keine Ergebnisse.
