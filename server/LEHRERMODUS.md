# Hirnfutter: Klassencodes und Lehrermodus

Stand: 13. November 2026

## Worum es geht

Lehrpersonen legen Klassen an und veröffentlichen Sets darin. Jede Klasse hat einen Klassencode mit 6 Zeichen, etwa `K7Q 4MP`. Schüler tippen den Code einmal in Hirnfutter ein. Danach haben sie alle Sets der Klasse, und Änderungen kommen beim Öffnen der App von selbst nach.

Auf dem Server liegt nur Lernmaterial. Es gibt keine Schüler-Logins, keine Schülernamen und keine Ergebnisse.

## Entscheide

- Nur Klassencodes, keine einzelnen Set-Codes. Für einmaliges Teilen bleibt der Link.
- **Gemeinsame Klassen:** Ein Code pro Klasse, auch wenn mehrere Lehrpersonen darin unterrichten. Die Klassenlehrperson legt die Klasse an, Fachlehrpersonen treten mit demselben Code bei. Jede verwaltet nur ihre eigenen Sets darin. Umbenennen, archivieren und löschen darf nur, wer die Klasse angelegt hat, und die Verwaltung. Wer beigetreten ist, kann die Klasse wieder verlassen; seine Sets verschwinden dann aus der Klasse.
- Kurse quer durch Klassen (Wahlpflichtfach, Niveaugruppen) sind einfach eigene Klassen mit eigenem Code.
- Beitreten braucht keine Bestätigung: Beitreten kann nur, wer einen Lehrercode hat.
- Codes sind zufällig, 6 Zeichen, ohne verwechselbare Zeichen (kein 0/O, 1/I/L).
- Keine Rückmeldung von Schülern an Lehrpersonen. Ob jemand zusätzlich übt, liegt bei den Schülern.
- Lehrpersonen verwalten ihre Klassen und Sets selbst, inklusive Löschen und Papierkorb.
- **Eigene Adresse für Lehrpersonen:** Lehrpersonen öffnen https://hirnfutter.pages.dev/lehrer und melden sich dort an. Die Schüleransicht zeigt keinen Hinweis auf den Lehrermodus. Nach der Anmeldung erscheint auf dem Gerät der Reiter «Klassen», auch wenn man die App über die normale Adresse öffnet. Es ist dieselbe App: Sets, die eine Lehrperson erstellt, liegen in derselben Bibliothek.
- Die Verwaltung (Lehrercodes ausstellen und sperren) gehört dem Betreiber. Der Verwaltungsschlüssel gilt gleichzeitig als dessen Lehrercode und öffnet im Lehrermodus zusätzlich den Bereich «Verwaltung».

## Teile und Stand

### 1. Server (`server/worker.js`)

- [x] Cloudflare Worker mit einem KV-Speicher
- [x] Schüler: Klasse lesen, Set lesen (nur sichtbare Sets aktiver Klassen)
- [x] Lehrperson: Übersicht, Klasse anlegen, umbenennen, archivieren, löschen, wiederherstellen
- [x] Lehrperson: Set veröffentlichen, aktualisieren, löschen, wiederherstellen, in Klasse legen, ausblenden
- [x] Papierkorb: Gelöschtes läuft nach 30 Tagen von selbst ab
- [x] Rechte: Jede Lehrperson sieht und ändert nur ihre eigenen Klassen und Sets
- [x] Lehrercodes nur als Hash gespeichert
- [x] Verwaltung: Lehrperson anlegen, sperren, entsperren, neuen Code ausstellen
- [x] Lokaler Testserver (`server/dev.mjs`) und Tests

### 2. Lehrermodus in der App (`src/ansicht-klassen.js`, `src/klassen.js`)

- [x] Anmelden mit Lehrercode, Abmelden
- [x] Zusätzlicher Reiter «Klassen», solange man angemeldet ist
- [x] Klassen anlegen, Code anzeigen und kopieren, umbenennen, archivieren, löschen
- [x] Bestehender Klasse beitreten, Klasse verlassen; Sets der anderen Lehrpersonen sichtbar, aber nicht veränderbar
- [x] Sets in einer Klasse ein- und ausblenden oder aus der Klasse nehmen
- [x] Eigene Sets veröffentlichen, in weitere Klassen legen, nach Änderungen aktualisieren
- [x] Sets, die an einem anderen Gerät veröffentlicht wurden, auf dieses Gerät holen
- [x] Papierkorb mit Wiederherstellen
- [x] Themen-Ordner: In der Bibliothek bekommt jedes Set unter «⋯» ein Thema (z. B. «Brüche»). Das Thema reist beim Veröffentlichen mit; die Schüler sehen die Klassensets in denselben Ordnern (Klasse → Fach → Thema). Ein geändertes Thema kommt mit «Aktualisieren» bei den Schülern an.
- [x] «In Klasse veröffentlichen» direkt im Menü «⋯» der Bibliothek; im Lehrermodus sind die eigenen Sets nach Fach und Thema geordnet, mit Hinweis «zu aktualisieren»

### 3. Schülerteil (`src/klassen.js`, Start, Bibliothek)

- [x] «Klassencode eingeben» auf dem Start und in der Bibliothek
- [x] Klassensets als eigene Gruppe in der Bibliothek, nach Fach geordnet, mit «NEU»-Markierung
- [x] Abgleich beim Öffnen der App und beim Zurückkehren, höchstens alle 10 Minuten
- [x] Gelöschte oder ausgeblendete Sets verschwinden, der Fortschritt bleibt gespeichert
- [x] Klassensets nur lesen; «Als eigene Kopie speichern» zum Bearbeiten
- [x] Klasse entfernen
- [x] Funktioniert offline mit dem letzten Stand

### 4. Verwaltung in der App

- [x] Erscheint im Lehrermodus, wenn man mit dem Verwaltungsschlüssel angemeldet ist
- [x] Lehrperson eintragen und Lehrercode ausstellen (wird nur einmal angezeigt)
- [x] Sperren, entsperren, neuen Code ausstellen (der alte gilt danach nicht mehr)
- [x] Klassen löschen und aus dem Papierkorb wiederherstellen, direkt unter «Klassen und Codes» jeder Lehrperson
- [x] Schuljahr: Klassennamen im Format `26_27_Sek_E_Ia` (Sek E: römisch, klein) oder `26_27_Sek_B_1A` (Sek B: Ziffer, gross) zählen am 1. August von selbst hoch (→ `27_28_Sek_E_IIa`). Nach der dritten Sek wird die Klasse einmal archiviert; von Hand wieder aktivieren bleibt möglich. Schüler sehen den Namen lesbar: «Sek E Ia · 2026/27». Andere Namen (z. B. «Wahlfach Informatik») bleiben, wie sie sind.
- [x] «Alle Klassen» als eigene Liste in der Verwaltung: Code, Leitung, übergeben, löschen, wiederherstellen
- [x] Klassenname zum Auswählen (Sek E / Sek B, Stufe, Buchstabe); das Schuljahr setzt die App. Für Kurse gibt es weiterhin einen freien Namen.
- [x] Nach dem Schuljahreswechsel fragt der Lehrermodus einmal pro Klasse, ob die eigenen Sets vom letzten Jahr ausgeblendet werden sollen
- [x] Der Verwaltungsschlüssel gilt nur, bis die App geschlossen wird, und steht nie in einer Sicherungsdatei
- [x] Versionsnummer: `VERSION` in `server/worker.js` und `SERVER_VERSION` in `src/server-adresse.js` müssen gleich sein. Passt der Worker nicht zur App, warnt die Verwaltung.
- [x] Lehrperson endgültig löschen (mit Rückfrage, die die Folgen nennt): Ihre Sets werden gelöscht. Klassen, die sie allein leitet, werden aufgelöst (die Schüler behalten, was schon auf ihren Geräten ist). Bei Klassen mit weiteren Lehrpersonen geht die Leitung an die nächste. Aus Klassen, in denen sie nur mitunterrichtet, tritt sie aus.
- [x] Übersicht: wer wie viele Klassen und Sets hat, mit allen Klassencodes
- [x] Leitung einer Klasse an eine andere Lehrperson übergeben (z. B. wenn die Klassenlehrperson geht)

## Einrichten bei Cloudflare

Du brauchst dafür etwa eine Stunde. Die Bezeichnungen im Dashboard können leicht anders heissen als hier, Cloudflare ändert sie ab und zu.

1. **Worker anlegen.** Auf dash.cloudflare.com links «Workers & Pages» (oder «Compute») öffnen, dann «Erstellen», «Worker» und die Vorlage «Hello World» wählen. Name: `hirnfutter-server`. Auf «Bereitstellen» (Deploy) klicken.
2. **Code einfügen.** Beim neuen Worker «Code bearbeiten» öffnen. Den ganzen Inhalt löschen und den Inhalt von `server/worker.js` hineinkopieren. Oben rechts «Bereitstellen».
3. **Speicher anlegen.** Links «Speicher und Datenbanken» (Storage & Databases), dann «Workers KV», «Namespace erstellen». Name: `hirnfutter`.
4. **Speicher verbinden.** Zurück beim Worker unter «Einstellungen» den Bereich «Bindungen» (Bindings) öffnen, «Hinzufügen», «KV-Namespace». Variablenname genau `HF`, Namespace `hirnfutter`. Speichern und bereitstellen.
5. **Verwaltungsschlüssel festlegen.** Beim Worker unter «Einstellungen», «Variablen und Geheimnisse», «Hinzufügen». Typ «Geheimnis» (Secret), Name genau `ADMIN_KEY`. Als Wert ein langes, zufälliges Passwort, zum Beispiel aus deinem Passwort-Manager. Schreib es dir sicher auf: Es ist dein Schlüssel zu allem.
6. **Deinen Namen festlegen.** Am gleichen Ort eine Variable vom Typ «Text» mit Name `ADMIN_NAME` und deinem Namen, so wie ihn die Schüler sehen sollen, etwa `M. Muster`.
7. **Testen.** Die Adresse des Workers steht oben, etwa `https://hirnfutter-server.DEINNAME.workers.dev`. Öffne sie im Browser. Es muss erscheinen: `{"app":"hirnfutter-server","ok":true}`
8. **Adresse in Hirnfutter eintragen.** In `src/server-adresse.js` die Adresse zwischen die Anführungszeichen schreiben. Dann `npm run build` und den Ordner `dist` wie gewohnt hochladen.
9. **Anmelden.** Die Lehrer-Adresse https://hirnfutter.pages.dev/lehrer öffnen und deinen Verwaltungsschlüssel als Lehrercode eingeben.

## Grenzen der Gratisstufe

Nach den Angaben von Cloudflare (geprüft am 13. November 2026):

- Worker: 100'000 Abrufe pro Tag
- KV-Speicher: 100'000 Lesevorgänge und 1'000 Schreibvorgänge pro Tag, 1 GB Speicher
- Die Zähler beginnen täglich um 01:00 Schweizer Zeit (00:00 UTC) neu. Wird eine Grenze überschritten, schlagen weitere Vorgänge dieser Art bis dahin fehl.

Was Hirnfutter verbraucht:

- Ein Schüler, der die App öffnet: 2 Lesevorgänge pro Klasse, plus 2 pro neuem oder geändertem Set.
- Eine Lehrperson, die ein Set veröffentlicht: etwa 3 bis 5 Schreibvorgänge.

Für eine Schule reicht das gut. Engpass wären die Schreibvorgänge, wenn sehr viele Lehrpersonen am selben Tag sehr viel veröffentlichen.

## Datenschutz (für die Schulleitung)

- Gespeichert werden: Klassen (Name, Code), Sets (Lerninhalt) und Lehrpersonen (Name und verschlüsselter Lehrercode).
- Nicht gespeichert werden: Schülernamen, Logins, Lernfortschritt, Ergebnisse. Der Fortschritt bleibt auf dem Gerät des Schülers.
- Wer einen Klassencode kennt, sieht die Sets dieser Klasse. Darum gehören keine vertraulichen Inhalte wie Prüfungen hinein.
- Cloudflare sieht technisch die IP-Adressen der Abrufe, wie bei jeder Webseite.
- Der Speicher liegt im Cloudflare-Konto des Betreibers. Gibt er es auf, gelten die Klassencodes nicht mehr. Die Schüler behalten die Sets, die schon auf ihren Geräten sind.

## Wenn etwas nicht geht

- **«Keine Verbindung»:** Das Gerät ist offline, oder die Adresse in `src/server-adresse.js` stimmt nicht. Die Adresse im Browser öffnen (Schritt 7).
- **«Lehrercode unbekannt»:** Tippfehler, oder der Code wurde ersetzt. Gross- und Kleinschreibung und Bindestriche spielen keine Rolle.
- **Änderungen kommen bei Schülern nicht an:** Die App schaut höchstens alle 10 Minuten nach. In der Bibliothek gibt es «Jetzt aktualisieren». Cloudflare verteilt Änderungen zudem mit bis zu einer Minute Verzögerung.

## Lokal testen (ohne Cloudflare)

```
node server/dev.mjs
```

startet einen Testserver auf `http://localhost:8787` (Verwaltungsschlüssel `admin-test`, Speicher nur im Arbeitsspeicher). Dann in einem zweiten Fenster:

```
set VITE_HF_SERVER=http://localhost:8787
npm run dev
```
