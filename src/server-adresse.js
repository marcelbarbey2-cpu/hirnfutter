// Adresse des Hirnfutter-Servers (Cloudflare Worker) für Klassencodes und Lehrermodus.
// Nach dem Einrichten zwischen die Anführungszeichen eintragen, zum Beispiel:
//   const ADRESSE = 'https://hirnfutter-server.DEINNAME.workers.dev'
// Leer lassen = Klassencodes und Lehrermodus sind ausgeblendet.
const ADRESSE = 'https://hirnfutter-server.marcel-barbey.workers.dev'

/** Stand der App und Version, die der Worker melden muss. Bei Änderungen am Worker beide Stellen anpassen (hier und in server/worker.js). */
export const SERVER_VERSION = '2026-11-15c'
export const SERVER = import.meta.env.VITE_HF_SERVER || ADRESSE
