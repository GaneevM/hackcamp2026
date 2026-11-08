import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createSessionRouter } from './session-routes.js';
import { createReportRouter } from './report-routes.js';
import { createFollowUpRouter } from './follow-up-routes.js';
import { createFollowUpAudioRouter } from './follow-up-audio-routes.js';
import { createJournalRouter } from './journal-routes.js';

export function createIntegratedApp(db, reportMode = 'mock') {
  if (!['mock', 'gemini'].includes(reportMode)) throw new Error('Invalid report mode.');
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && origin !== `http://${req.get('host')}`)
      return res.status(403).json({ error: 'Use the frontend served by this local backend.' });
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Exercise report backend', reportMode, integration: 'local-journal-v1' }));
  app.get('/api/demo-session', (req, res) => {
    res.json(JSON.parse(readFileSync(new URL('../fixtures/synthetic-session.json', import.meta.url), 'utf8')));
  });
  app.use('/api/journal', createJournalRouter(db));
  app.use('/api/sessions', createSessionRouter(db));
  app.use('/api/reports', createReportRouter(db, reportMode));
  app.use('/api/follow-ups', createFollowUpRouter(db));
  app.use('/api/follow-ups', createFollowUpAudioRouter(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use('/voice-assets', express.static(fileURLToPath(new URL('../data/voice/', import.meta.url)), { dotfiles: 'deny', index: false }));
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { dotfiles: 'deny', index: false }));
  const root = new URL('../../', import.meta.url);
  for (const name of ['index.html', 'styles.css', 'redesign.css', 'app.js', 'auth0-config.js', 'companion.js', 'session-metrics.js', 'rep-sound.js']) {
    app.get('/' + name, (req, res) => res.sendFile(fileURLToPath(new URL(name, root))));
  }
  app.get('/', (req, res) => res.sendFile(fileURLToPath(new URL('index.html', root))));
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must contain valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    console.error('Request failed:', err.name);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });
  return app;
}
