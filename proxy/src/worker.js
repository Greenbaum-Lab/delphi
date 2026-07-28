import { issueToken, readToken } from './token.js';
import { verifyTurnstile } from './turnstile.js';
import { chargeQuota, recordRejection, budgetExhausted, recordSpend } from './quota.js';
import { readCachedRequest, writeCachedRequest } from './cache.js';
import { loadCatalog } from './catalog.js';
import { readNavigationRequest } from './model.js';
import { sanitiseRequest, isCacheable } from './schema.js';

const MAX_QUERY_LENGTH = 200;

const jsonResponse = (body, status, origin) => new Response(JSON.stringify(body), {
	status,
	headers: {
		'content-type': 'application/json',
		'access-control-allow-origin': origin,
		'access-control-allow-headers': 'content-type,authorization',
		'access-control-allow-methods': 'POST,OPTIONS'
	}
});

const allowedOrigin = (request, env) => {
	const origin = request.headers.get('origin') || '';
	return env.ALLOWED_ORIGINS.split(',').map(entry => entry.trim()).includes(origin) ? origin : null;
};

const clientAddress = request => request.headers.get('cf-connecting-ip') || 'unknown';

const readBody = async request => await request.json().catch(() => null);

const authorise = async (request, env) => readToken(env.TOKEN_SECRET, (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));

const handleToken = async (request, env, origin) => {
	const body = await readBody(request);
	if (!body || !(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstile_token, clientAddress(request))))
		return jsonResponse({ error: 'the bot check did not pass' }, 403, origin);
	return jsonResponse(await issueToken(env.TOKEN_SECRET), 200, origin);
};

const modelAnswer = async (request, env, body, origin) => {
	if (await budgetExhausted(env.ASSISTANT_KV, Number(env.MONTHLY_CEILING_CENTS)))
		return jsonResponse({ error: 'the interpreter is off for this month; typed coordinates and names still work' }, 503, origin);
	const catalog = await loadCatalog(env.POPULATION_CATALOG_URL);
	const outcome = await readNavigationRequest(env, body.query, body.state, catalog, body.visitor_id);
	await recordSpend(env.ASSISTANT_KV, outcome.spent_cents, Number(env.MONTHLY_CEILING_CENTS));
	const navigation_request = sanitiseRequest(outcome.request);
	if (!navigation_request || navigation_request.rejection_reason)
		await recordRejection(env.ASSISTANT_KV, clientAddress(request));
	console.log(JSON.stringify({ event: 'navigate', visitor: body.visitor_id, input_tokens: outcome.usage.input_tokens, output_tokens: outcome.usage.output_tokens }));
	return navigation_request ? jsonResponse({ source: 'model', request: navigation_request }, 200, origin) : jsonResponse({ error: 'the interpreter returned nothing usable' }, 502, origin);
};

/**
 * Tier 1 then tier 2. A cache hit costs nothing and answers immediately; only a
 * miss reaches the model, and only after the quota and the monthly ceiling have
 * both allowed it.
 */
const handleNavigate = async (request, env, origin) => {
	const token_id = await authorise(request, env);
	if (!token_id)
		return jsonResponse({ error: 'that session token is not valid' }, 401, origin);
	const body = await readBody(request);
	if (!body || typeof body.query !== 'string' || body.query.length > MAX_QUERY_LENGTH || typeof body.state !== 'object')
		return jsonResponse({ error: 'that request was not understood' }, 400, origin);
	const refusal = await chargeQuota(env.ASSISTANT_KV, token_id, clientAddress(request));
	if (refusal)
		return jsonResponse({ error: refusal }, 429, origin);
	const cached_request = await readCachedRequest(env.ASSISTANT_KV, body.query);
	if (cached_request)
		return jsonResponse({ source: 'cache', request: cached_request }, 200, origin);
	return modelAnswer(request, env, body, origin);
};

/**
 * A confirmed answer. The browser calls this after the user pressed Go, which
 * is the only evidence the proxy ever gets that an interpretation was right.
 */
const handleConfirm = async (request, env, origin) => {
	if (!(await authorise(request, env)))
		return jsonResponse({ error: 'that session token is not valid' }, 401, origin);
	const body = await readBody(request);
	const navigation_request = body ? sanitiseRequest(body.request) : null;
	if (!navigation_request || typeof body.query !== 'string' || !isCacheable(navigation_request))
		return jsonResponse({ stored: false }, 200, origin);
	await writeCachedRequest(env.ASSISTANT_KV, body.query, navigation_request);
	return jsonResponse({ stored: true }, 200, origin);
};

const ROUTES = { '/token': handleToken, '/navigate': handleNavigate, '/confirm': handleConfirm };

export default {
	async fetch(request, env) {
		const origin = allowedOrigin(request, env);
		if (!origin)
			return new Response('forbidden', { status: 403 });
		if (request.method === 'OPTIONS')
			return jsonResponse({}, 204, origin);
		const route = ROUTES[new URL(request.url).pathname];
		if (!route || request.method !== 'POST')
			return jsonResponse({ error: 'no such endpoint' }, 404, origin);
		return route(request, env, origin);
	}
};
