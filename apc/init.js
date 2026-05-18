'use strict';

const initServiceWorker = uri => new Promise((resolve, reject) => {
	if ('serviceWorker' in navigator) {
		return navigator.serviceWorker.register(uri, {scope: '/'}).then(reg => {
			if (!reg.waiting && !reg.active) {
				reg.addEventListener('updatefound', () => {
					reg.installing.addEventListener('statechange', e => {
						if (e.target.state === 'activated')
							resolve();
					});
				});
			} else
				resolve();
		}).catch(e => {
			console.log('Failed to register sw.js: ' + e);
			reject();
		});
	}
	return reject();
});

const main = async () => {
	try {
		await initServiceWorker('/sw.js');
	} catch (e) {
		console.log('Failed to load Service Worker');
	}
	const { addHooks, hooks } = await import('/apc/common.js');
	addHooks(window, hooks);
	document.body.classList.add('loading');
	await Promise.all(Array.from(document.querySelectorAll('[data-module]')).map(async module_elem => {
		const module_name = module_elem.dataset.module;
		try {
			await import(`/${module_name}.js`).then(m => m.init(module_elem));
		} catch (e) {
			console.log(e);
			console.log(`Failed to initialize module ${module_name}`);
		}
	}));
	document.body.classList.remove('loading');
};

window.addEventListener('load', main);