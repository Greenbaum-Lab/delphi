import { TURNSTILE_SITE_KEY } from '/assistant/config.js';

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const loadTurnstileScript = () => new Promise((resolve, reject) => {
	if (window.turnstile)
		return resolve(window.turnstile);
	const script = document.createElement('script');
	script.src = TURNSTILE_SCRIPT_URL;
	script.async = true;
	script.addEventListener('load', () => resolve(window.turnstile));
	script.addEventListener('error', () => reject(new Error('the bot check could not be loaded')));
	document.head.append(script);
});

const runWidget = (turnstile, container) => new Promise((resolve, reject) => {
	turnstile.render(container, {
		sitekey: TURNSTILE_SITE_KEY,
		callback: resolve,
		'error-callback': () => reject(new Error('the bot check did not pass'))
	});
});

/**
 * Runs the invisible bot check once and hands back its token. A legitimate user
 * never sees anything; the widget renders into a hidden element and resolves on
 * its own. This is what stands in for a login: it proves a browser is present
 * without ever identifying who is using it.
 */
export const requestTurnstileToken = async () => {
	const turnstile = await loadTurnstileScript();
	const container = document.createElement('div');
	container.style.display = 'none';
	document.body.append(container);
	const turnstile_token = await runWidget(turnstile, container);
	container.remove();
	return turnstile_token;
};
