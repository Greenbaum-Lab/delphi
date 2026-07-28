const CACHE_TTL_SECONDS = 2592000;

const encoder = new TextEncoder();

const normaliseQuery = query => query.trim().toLowerCase().replace(/[\s,]+/g, ' ').replace(/[?.!]+$/, '');

const digest = async text => {
	const hash = await crypto.subtle.digest('SHA-256', encoder.encode(text));
	return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * The cache key. It is a hash of the normalised query and nothing else, so the
 * stored key reveals no query text, and two people who phrase the same request
 * the same way share one entry.
 */
export const cacheKey = async query => `query:${await digest(normaliseQuery(query))}`;

export const readCachedRequest = async (store, query) => {
	const cached_value = await store.get(await cacheKey(query));
	return cached_value ? JSON.parse(cached_value) : null;
};

/**
 * Writes a confirmed answer. Only a request the user actually pressed Go on
 * reaches this, which is what makes the cache an asset rather than a way to
 * make one bad interpretation permanent.
 */
export const writeCachedRequest = async (store, query, navigation_request) => {
	await store.put(await cacheKey(query), JSON.stringify(navigation_request), { expirationTtl: CACHE_TTL_SECONDS });
};
