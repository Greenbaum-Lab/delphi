import { PROXY_URL, MAX_QUERY_LENGTH } from '/assistant/config.js';
import { requestTurnstileToken } from '/assistant/turnstile.js';

const VISITOR_KEY = 'delphi_assistant_visitor';
const TOKEN_MARGIN_MS = 60000;

const readVisitorId = () => {
	const stored_id = localStorage.getItem(VISITOR_KEY);
	if (stored_id)
		return stored_id;
	const visitor_id = crypto.randomUUID();
	localStorage.setItem(VISITOR_KEY, visitor_id);
	return visitor_id;
};

const postJSON = async (path, body, access_token) => {
	const response = await fetch(`${PROXY_URL}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(access_token ? { authorization: `Bearer ${access_token}` } : {}) },
		body: JSON.stringify(body)
	});
	const payload = await response.json().catch(() => ({ error: 'the assistant service replied with something unreadable' }));
	return { ok: response.ok, status: response.status, payload };
};

/**
 * Holds the short-lived token the proxy issues after the bot check, and renews
 * it when it is close to expiring. The token is the whole of the client's
 * identity: it says a browser passed a check, and nothing about who.
 */
const createTokenStore = () => {
	let access_token = null;
	let expires_at = 0;
	return async () => {
		if (access_token && Date.now() < expires_at - TOKEN_MARGIN_MS)
			return access_token;
		const turnstile_token = await requestTurnstileToken();
		const { ok, payload } = await postJSON('/token', { turnstile_token });
		if (!ok)
			throw new Error(payload.error || 'the assistant service would not issue a token');
		access_token = payload.token;
		expires_at = payload.expires_at;
		return access_token;
	};
};

/**
 * The assistant's only outbound path. It sends the typed query, the whitelisted
 * slice of display state, and the anonymous visitor id, and it receives a
 * navigation request. It never sends genotypes, sample records, uploaded files
 * or any other localStorage key.
 */
export const createProxyClient = () => {
	const readToken = createTokenStore();
	return {
		navigate: async (query, state_slice) => {
			const access_token = await readToken();
			const { ok, payload } = await postJSON('/navigate', { query: query.slice(0, MAX_QUERY_LENGTH), state: state_slice, visitor_id: readVisitorId() }, access_token);
			if (!ok)
				return { status: 'error', message: payload.error || 'the assistant service is unavailable' };
			return { status: 'ok', source: payload.source, request: payload.request };
		},
		confirm: async (query, request) => {
			const access_token = await readToken();
			await postJSON('/confirm', { query: query.slice(0, MAX_QUERY_LENGTH), request, visitor_id: readVisitorId() }, access_token);
		}
	};
};
