const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Checks the Turnstile token the browser obtained. This is the only gate
 * between an anonymous visitor and a billable call, so a failure here is a
 * refusal rather than a warning.
 */
export const verifyTurnstile = async (secret_key, turnstile_token, client_address) => {
	if (typeof turnstile_token !== 'string' || turnstile_token === '')
		return false;
	const form = new FormData();
	form.append('secret', secret_key);
	form.append('response', turnstile_token);
	if (client_address)
		form.append('remoteip', client_address);
	const response = await fetch(SITEVERIFY_URL, { method: 'POST', body: form });
	const outcome = await response.json().catch(() => ({ success: false }));
	return outcome.success === true;
};
