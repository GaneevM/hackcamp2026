import { Router } from 'express';
import { journalSchema, journalScopeSchema, contextSchema, createJournalStore } from './journal-store.js';

export function createJournalRouter(db) {
  const router = Router();
  const store = createJournalStore(db);
  const scopeFor = (req, res) => {
    const result = journalScopeSchema.safeParse(req.query.scope);
    if (!result.success) { res.status(400).json({ error: 'A valid local profile scope is required.' }); return null; }
    return result.data;
  };
  router.post('/sessions', (req, res) => {
    const result = journalSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Invalid journal session.', details: result.error.issues });
    try { return res.json(store.save(result.data)); }
    catch (error) { if (error.status === 409) return res.status(409).json({ error: error.message }); throw error; }
  });
  router.get('/sessions', (req, res) => {
    const scope = scopeFor(req, res); if (!scope) return;
    res.json({ sessions: store.list(scope) });
  });
  router.delete('/sessions', (req, res) => {
    const scope = scopeFor(req, res); if (!scope) return;
    store.clear(scope); res.json({ cleared: true });
  });
  router.get('/sessions/:id', (req, res) => {
    const scope = scopeFor(req, res); if (!scope) return;
    const row = store.get(scope, req.params.id);
    return row ? res.json(row) : res.status(404).json({ error: 'Journal session not found.' });
  });
  router.post('/sessions/:id/context', (req, res) => {
    const result = contextSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Enter a note of 1–2000 characters and a valid scope.' });
    const row = store.answer(result.data.scope, req.params.id, result.data.answer);
    return row ? res.json(row) : res.status(404).json({ error: 'Journal session not found.' });
  });
  router.get('/sessions/:id/report', (req, res) => {
    const scope = scopeFor(req, res); if (!scope) return;
    const row = store.get(scope, req.params.id);
    if (!row) return res.status(404).json({ error: 'Journal session not found.' });
    res.json({ mode: 'local', ...row, limitations: [
      'Local template summary; no Gemini request was made.',
      'Observed angle extrema are estimates, not sustained-hold measurements or evidence of recovery.',
      'Profile scopes separate demo records but are not backend authentication.'
    ] });
  });
  return router;
}
