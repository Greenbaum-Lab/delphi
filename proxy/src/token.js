const TOKEN_LIFETIME_MS = 3600000;

const encoder = new TextEncoder();

const toBase64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const importKey = secret => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

const sign = async (secret, payload) => toBase64Url(await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(payload)));

const decodePayload = encoded_payload => {
	try {
		return atob(encoded_payload.replace(/-/g, '+').replace(/_/g, '/'));
	} catch (error) {
		return null;
	}
};

const constantTimeEquals = (first, second) => {
	if (first.length !== second.length)
		return false;
	let difference = 0;
	for (let index = 0; index < first.length; index++)
		difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
	return difference === 0;
};

/**
 * Issues the short-lived bearer token a client gets after passing the bot
 * check. It carries an expiry and a random id and nothing else: there is no
 * account behind it and it identifies no one.
 */
export const issueToken = async secret => {
	const expires_at = Date.now() + TOKEN_LIFETIME_MS;
	const payload = `${crypto.randomUUID()}.${expires_at}`;
	return { token: `${toBase64Url(encoder.encode(payload))}.${await sign(secret, payload)}`, expires_at };
};

/**
 * Verifies a bearer token and returns its id, or null. The signature is checked
 * before the expiry so a forged token cannot be distinguished from an expired
 * one by timing the response.
 */
export const readToken = async (secret, token) => {
	if (typeof token !== 'string' || !token.includes('.'))
		return null;
	const [encoded_payload, signature] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)];
	const payload = decodePayload(encoded_payload);
	if (payload === null)
		return null;
	const expected_signature = await sign(secret, payload);
	if (!constantTimeEquals(signature, expected_signature))
		return null;
	const [token_id, expires_at] = payload.split('.');
	return Number(expires_at) > Date.now() ? token_id : null;
};
