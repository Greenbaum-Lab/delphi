export function createLFUCache(max_size, estimated_object_size) {
	const cache = new Map();
	const frequency = new Map();
	let current_size = 0;

	function evict_lfu() {
		let min_freq = Infinity;
		let evict_key = null;
		for (const [key, freq] of frequency.entries()) {
			if (freq < min_freq) {
				min_freq = freq;
				evict_key = key;
			}
		}
		if (evict_key !== null) {
			cache.delete(evict_key);
			frequency.delete(evict_key);
			current_size -= estimated_object_size;
		}
	}

	function get(key) {
		if (cache.has(key)) {
			const freq = frequency.get(key) || 0;
			frequency.set(key, freq + 1);
			return cache.get(key);
		}
		return null;
	}

	function set(key, value) {
		if (cache.has(key)) {
			cache.set(key, value);
			const freq = frequency.get(key) || 0;
			frequency.set(key, freq + 1);
			return;
		}
		while (current_size + estimated_object_size > max_size && cache.size > 0) {
			evict_lfu();
		}
		cache.set(key, value);
		frequency.set(key, 1);
		current_size += estimated_object_size;
	}

	return { get, set };
}
