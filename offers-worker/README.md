# Angebote-Dienst für den Kochplaner

Dieser Worker fragt **marktguru** ab. Das ist keine offizielle Schnittstelle. Sie kann sich ändern oder ganz ausfallen. Die App merkt das und zeigt dann die letzte gespeicherte Liste plus einen Link zur Suche.

Der Schlüssel liegt nur hier, nie in der App. Ist kein Geheimnis gesetzt, liest der Worker den Schlüssel einmal von der marktguru-Webseite und merkt ihn sich etwa sechs Stunden. Pro Suchwort und Postleitzahl liegt die Antwort ebenfalls etwa sechs Stunden im Cache.

## Deploy

Im Konto, zu dem `danielgergel.workers.dev` gehört:

```bash
cd offers-worker
npm install
npx wrangler login
npx wrangler deploy
```

Danach ist der Dienst unter `https://kochplaner-angebote.danielgergel.workers.dev` erreichbar. Steht er woanders, die Adresse in den Einstellungen der App eintragen.

## Geheimnisse

Keins ist Pflicht. Wenn der automatische Schlüssel nicht mehr klappt:

```bash
npx wrangler secret put MARKTGURU_API_KEY
```

Den Wert (`x-apikey`) aus den Netz-Anfragen von marktguru.de kopieren, nicht ins Repo schreiben.

Nur falls marktguru zusätzlich `x-clientkey` verlangt:

```bash
npx wrangler secret put MARKTGURU_CLIENT_KEY
```

Lokal ausprobieren, ohne zu veröffentlichen:

```bash
npx wrangler dev
```

## Schnittstelle

`GET /health` antwortet mit `{"ok":true}`.

`POST /offers` mit JSON:

```json
{"zip":"76133","stores":["REWE","Lidl"],"items":["Milch","Reis"]}
```

Höchstens 40 Artikel, drei Suchen gleichzeitig. Die Antwort enthält pro Treffer Artikel, Laden, Produktname, Preis, Menge, Grundpreis (wenn er sich rechnen lässt), gültig von/bis und einen Link. Passt ein Laden nicht zur Auswahl, fällt der Treffer weg.

Schlägt marktguru fehl, kommt HTTP 502 und `"error":"marktguru_unavailable"` oder `"marktguru_unauthorized"`. Die App lässt die alte Liste stehen und öffnet die Suche im Prospekt.

Packungsangaben wie `12x1 l`, `je 1-l-Packg.` und `entspricht pro Packg.` bestimmen Menge und Preis. Der Grundpreis muss zum Preis geteilt durch die Menge passen, sonst wird er neu gerechnet. Werbe- und Tracking-Links (zum Beispiel doubleclick) werden nicht ausgegeben, stattdessen eine marktguru-Suche mit Postleitzahl. Gleiche Treffer fallen zusammen, gültige Angebote stehen vor künftigen.

CORS erlaubt `https://danielgergel.github.io`, `localhost` und `127.0.0.1`.
