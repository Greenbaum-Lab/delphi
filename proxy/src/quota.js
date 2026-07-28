const HOURLY_LIMIT = 30;
const DAILY_LIMIT = 200;
const REJECTION_LIMIT = 25;
const BLOCK_SECONDS = 86400;
const ALERT_FRACTION = 0.8;

const hourKey = () => new Date().toISOString().slice(0, 13);

const dayKey = () => new Date().toISOString().slice(0, 10);

const monthKey = () => new Date().toISOString().slice(0, 7);

const readCounter = async (store, key) => Number(await store.get(key)) || 0;

const bumpCounter = async (store, key, expiration_ttl) => {
	const next_value = (await readCounter(store, key)) + 1;
	await store.put(key, String(next_value), { expirationTtl: expiration_ttl });
	return next_value;
};

/**
 * Counts a request against both the token and the address it came from, so a
 * visitor cannot multiply their allowance by collecting fresh tokens. Returns
 * the reason a request is refused, or null to let it through.
 */
export const chargeQuota = async (store, token_id, client_address) => {
	if (await store.get(`block:${client_address}`))
		return 'this address is temporarily blocked';
	const hourly = await bumpCounter(store, `hour:${token_id}:${hourKey()}`, 7200);
	const daily = await bumpCounter(store, `day:${client_address}:${dayKey()}`, 172800);
	if (hourly > HOURLY_LIMIT)
		return 'too many requests this hour';
	return daily > DAILY_LIMIT ? 'too many requests today' : null;
};

/**
 * Tracks how often a visitor sends something that cannot be understood. A
 * person mistypes occasionally; someone probing the endpoint racks up dozens of
 * failures in a row, and gets blocked for a day.
 */
export const recordRejection = async (store, client_address) => {
	const rejections = await bumpCounter(store, `reject:${client_address}:${dayKey()}`, BLOCK_SECONDS);
	if (rejections >= REJECTION_LIMIT)
		await store.put(`block:${client_address}`, '1', { expirationTtl: BLOCK_SECONDS });
};

const spendKey = () => `spend:${monthKey()}`;

/**
 * The monthly ceiling, in whole cents, enforced in code rather than hoped for.
 * When the month's spend reaches the ceiling the model tier switches off and
 * the deterministic tiers keep working.
 */
export const budgetExhausted = async (store, ceiling_cents) => (await readCounter(store, spendKey())) >= ceiling_cents;

export const recordSpend = async (store, spent_cents, ceiling_cents) => {
	const total_cents = (await readCounter(store, spendKey())) + spent_cents;
	await store.put(spendKey(), String(total_cents), { expirationTtl: 5356800 });
	if (total_cents >= ceiling_cents * ALERT_FRACTION && total_cents - spent_cents < ceiling_cents * ALERT_FRACTION)
		console.warn(`assistant budget at ${Math.round((total_cents / ceiling_cents) * 100)} percent of the monthly ceiling`);
	return total_cents;
};
