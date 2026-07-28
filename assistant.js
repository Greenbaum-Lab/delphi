import { createPanel } from '/assistant/panel.js';
import { loadCatalog } from '/assistant/catalog.js';
import { readStateSlice, currentRegion } from '/assistant/state_slice.js';
import { parseRequest } from '/assistant/parser.js';
import { buildPatch } from '/assistant/patch.js';
import { validatePatch } from '/assistant/validate.js';
import { previewPatch, previewSource } from '/assistant/preview.js';
import { applyPatch } from '/assistant/apply.js';
import { createHistory } from '/assistant/history.js';
import { createProxyClient } from '/assistant/client.js';
import { GREETING, PRIVACY_NOTICE, SERVICE_UNAVAILABLE, APPLIED, CANCELLED, candidateQuestion, applyFailed, invalidPatch } from '/assistant/messages.js';

const answerFromCandidates = (session, query) => {
	if (!session.candidates || !/^[0-9]+$/.test(query))
		return null;
	return session.candidates[Number(query) - 1] || null;
};

/**
 * The three tiers, in order. Tier 0 reads the request with no network call at
 * all; only what it cannot read reaches the proxy, where the cache is tried
 * before the model.
 */
const readRequest = async (session, query) => {
	const state_slice = readStateSlice();
	const parsed_request = parseRequest(query, session.catalog, state_slice);
	if (parsed_request)
		return { source: 'parser', request: parsed_request };
	session.panel.setStatus('Interpreting.');
	const reply = await session.proxy.navigate(query, state_slice).catch(error => ({ status: 'error', message: error.message }));
	session.panel.setStatus('');
	return reply.status === 'ok' ? { source: reply.source, request: reply.request } : { source: 'error', message: reply.message };
};

const proposePatch = (session, query, read_result) => {
	const outcome = buildPatch(read_result.request, session.catalog, readStateSlice(), session.history);
	if (outcome.status === 'unresolved')
		return offerCandidates(session, outcome);
	if (outcome.status === 'rejected')
		return session.panel.say(outcome.message);
	const validation = validatePatch(outcome.patch, session.catalog);
	if (!validation.valid)
		return session.panel.say(invalidPatch(validation.errors));
	session.pending = { patch: validation.patch, query, request: read_result.request, source: read_result.source };
	session.panel.propose(`${previewPatch(validation.patch)} (${previewSource(read_result.source)})`);
};

const offerCandidates = (session, outcome) => {
	session.candidates = outcome.candidates;
	session.panel.say(outcome.candidates.length > 0 ? candidateQuestion(outcome.message, outcome.candidates) : outcome.message);
};

const handleSubmit = async (session, typed_query) => {
	const query = answerFromCandidates(session, typed_query) || typed_query;
	session.candidates = null;
	session.pending = null;
	if (!session.catalog)
		return session.panel.say('Still reading the catalogue, try again in a moment.');
	session.panel.setBusy(true);
	try {
		const read_result = await readRequest(session, query);
		if (read_result.source === 'error')
			return session.panel.say(read_result.message || SERVICE_UNAVAILABLE);
		proposePatch(session, query, read_result);
	} finally {
		session.panel.setBusy(false);
	}
};

/**
 * Go. The patch is applied only here, after the user has read it. A confirmed
 * model answer is reported back to the proxy, which is how the cache learns:
 * every Go is a free labelled example.
 */
const handleConfirm = session => {
	if (!session.pending)
		return;
	const { patch, query, request, source } = session.pending;
	session.pending = null;
	session.history.record(currentRegion());
	const result = applyPatch(patch);
	session.panel.say(result.status === 'applied' ? APPLIED : applyFailed(result.detail));
	if (result.status === 'applied' && source === 'model')
		session.proxy.confirm(query, request).catch(() => undefined);
};

const handleCancel = session => {
	if (!session.pending)
		return;
	session.pending = null;
	session.panel.say(CANCELLED);
};

const prepare = async session => {
	if (session.prepared)
		return;
	session.prepared = true;
	session.panel.say(PRIVACY_NOTICE);
	session.panel.setStatus('Reading the catalogue.');
	session.catalog = await loadCatalog().catch(() => null);
	if (!session.catalog) {
		session.prepared = false;
		return session.panel.setStatus('DELPHI has not finished loading its data. Open this again in a moment.');
	}
	session.panel.setStatus('');
};

export const init = async container => {
	const session = { panel: null, catalog: null, history: createHistory(), proxy: createProxyClient(), pending: null, candidates: null, prepared: false };
	session.panel = createPanel(container, {
		onOpen: () => prepare(session),
		onSubmit: query => handleSubmit(session, query),
		onConfirm: () => handleConfirm(session),
		onCancel: () => handleCancel(session)
	});
	session.panel.say(GREETING);
};
