import 'dotenv/config';
import { openDatabase } from './database.js';
import { createIntegratedApp } from './integrated-app.js';

const port = Number(process.env.PORT || 3001);
const reportMode = process.env.REPORT_MODE || 'mock';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const db = openDatabase();
const app = createIntegratedApp(db, reportMode);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Integrated Formnote app: http://localhost:${port}`);
  console.log(`Synthetic report mode: ${reportMode}`);
  console.log('Camera/manual journal records stay local; Gemini demo uses fictional data only.');
  console.log('Local profile scopes are not backend authentication. Do not expose this server publicly.');
});
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
