import { addModule, getOptions, mean, round } from '/apc/common.js';
import { getIDBObject, listIDBTable } from '/apc/cache.js';
import { CONFIG, getMetadata } from '/assets.js';

const nanmean = arr => arr.length === 0 ? null : mean(arr.filter(v => v !== undefined && v !== null));
const getCol = (arr, col) => arr.map(arr => arr[col]);
const median = arr => arr.length === 0 ? null : ((s = arr.slice().sort((a,b) => a - b)) => s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2)();
const nanmedian = arr => arr.length === 0 ? null : median(arr.filter(v => v !== undefined && v !== null));

export const getPops = async () => {
	const population_names = await listIDBTable(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE);
	return population_names.sort();
};

export const getPopData = async (population) => {
	return getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, population);
};

export const getPopsData = async () => {
	const populations = await getPops().then(pops => Promise.all(pops.map(pop => getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, pop))));
	return populations.map(population => Object.assign({}, population, {samples: population.subset.length}));
};

export const addPopulation = async (label, dataset, group_name = '', sample_ids = []) => {
	const african_populations = ['BantuKenya', 'BantuSouthAfrica', 'Biaka', 'Mandenka', 'Mbuti', 'San', 'Yoruba', 'ASW', 'ACB', 'ESN', 'GWD', 'LWK', 'MSL', 'YRI'];
	const samples = await getMetadata().then(samples => samples.filter(sample => (sample_ids.length === 0 || sample_ids.includes(sample.Poseidon_ID)) && (group_name === '' || group_name === sample.Group_Name)));
	const population = {
		label,
		time: Math.round(nanmean(getCol(samples, 'date'))),
		distance: african_populations.includes(label) ? 0 : Math.round(waypointDistance(computeCentroid(samples, ['Latitude', 'Longitude']))),
		chelsa_pc1: round(nanmean(getCol(samples, 'chelsa_pc1')), 3),
		chelsa_pc2: round(nanmean(getCol(samples, 'chelsa_pc2')), 3),
		ukb_pc1: round(nanmean(getCol(samples, 'ukb_pc1')), 3),
		ukb_pc2: round(nanmean(getCol(samples, 'ukb_pc2')), 3),
		Latitude: round(nanmean(getCol(samples, 'Latitude')), 2),
		Longitude: round(nanmean(getCol(samples, 'Longitude')), 2),
		ag_extensive_agriculture: nanmedian(getCol(samples, 'ag_extensive_agriculture')),
		ag_urbanization: nanmedian(getCol(samples, 'ag_urbanization')),
		Dataset: dataset,
		aadr_population: group_name,
		subset: getCol(samples, 'Poseidon_ID')
	};
	return getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, label, population);
};

export const pairwiseSort = (pop1, pop2, measure) => {
	switch(measure) {
		case 'distance':
			return Math.round(waypointDistance(pop1, pop2));
		case 'genetic_distance':
			return round(euclideanDistance([pop1.ukb_pc1, pop1.ukb_pc2], [pop2.ukb_pc1, pop2.ukb_pc2]), 2);
		case 'time':
		case 'chelsa_pc1':
		case 'chelsa_pc2':
			return round(Math.abs(pop1[measure] - pop2[measure]), 2);
	}
};

export const deletePopulations = (populations) => {
	const selected_populations = getOptions().populations;
	const updated_populations = selected_populations.filter(pop => !populations.includes(pop.replace(/^.*?\/([^\/]+)$/, '$1')));
	getOptions([['populations', updated_populations]]);
	populations.forEach(population => deleteIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, population));
	if (selected_populations.length !== updated_populations)
		document.querySelector('[data-module="browser"]').dispatchEvent(new Event('update'));
};

const haversineDistance = (lat1, lon1, lat2, lon2) => {
	const to_radians = deg => deg * Math.PI / 180;
	const earth_radius_km = 6371;
	const dlat = to_radians(lat2 - lat1);
	const dlon = to_radians(lon2 - lon1);
	const a = Math.sin(dlat / 2) * Math.sin(dlat / 2) +
		Math.cos(to_radians(lat1)) * Math.cos(to_radians(lat2)) *
		Math.sin(dlon / 2) * Math.sin(dlon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return earth_radius_km * c;
};

const computeCentroid = (samples, fields) => {
	const valid_samples = samples.filter(s => fields.reduce((a, field) => a && s[field] !== undefined && s[field] !== null, true));
	if (valid_samples.length === 0)
		return false;
	return Object.fromEntries(fields.map(field => [field, mean(getCol(valid_samples, field))]));
};

const findClosestWaypoint = (lat, lon, waypoints) => {
	let min_distance = Infinity;
	let closest_index = 0;
	waypoints.forEach((waypoint, index) => {
		const distance = haversineDistance(lat, lon, waypoint.Latitude, waypoint.Longitude);
		if (distance < min_distance) {
			min_distance = distance;
			closest_index = index;
		}
	});
	return { index: closest_index, distance: min_distance };
};

const findShortestWaypointPath = (start_index, end_index, waypoints) => {
	if (start_index === end_index) {
		return 0;
	}
	const n = waypoints.length;
	let min_distance = Infinity;
	const forward_distance = (() => {
		let distance = 0;
		let current = start_index;
		while (current !== end_index) {
			const next = (current + 1) % n;
			distance += haversineDistance(
				waypoints[current].Latitude, waypoints[current].Longitude,
				waypoints[next].Latitude, waypoints[next].Longitude
			);
			current = next;
		}
		return distance;
	})();
	const backward_distance = (() => {
		let distance = 0;
		let current = start_index;
		while (current !== end_index) {
			const next = (current - 1 + n) % n;
			distance += haversineDistance(
				waypoints[current].Latitude, waypoints[current].Longitude,
				waypoints[next].Latitude, waypoints[next].Longitude
			);
			current = next;
		}
		return distance;
	})();
	return Math.min(forward_distance, backward_distance);
};

export const waypointDistance = (pos1, pos2) => {
	const waypoints = [
		{ Latitude: 30, Longitude: 31, name: 'Cairo' },
		{ Latitude: 41, Longitude: 28, name: 'Istanbul' },
		{ Latitude: 64, Longitude: 177, name: 'Anadyr' },
		{ Latitude: 54, Longitude: -130, name: 'Prince Rupert' },
		{ Latitude: 11, Longitude: 104, name: 'Phnom Penh' }
	];
	const closest_a = findClosestWaypoint(pos1.Latitude, pos1.Longitude, waypoints);
	if (pos2) {
		const closest_b = findClosestWaypoint(pos2.Latitude, pos2.Longitude, waypoints);
		const waypoint_path_distance = findShortestWaypointPath(closest_a.index, closest_b.index, waypoints);
		return closest_a.distance + waypoint_path_distance + closest_b.distance;
	} else {
		const origin_waypoint = 0;
		const waypoint_path_distance = findShortestWaypointPath(closest_a.index, origin_waypoint, waypoints);
		return closest_a.distance + waypoint_path_distance;
	}
};

const euclideanDistance = (pos1, pos2) => {
	return Math.sqrt(pos1.reduce((sum, val, i) => sum + Math.pow(val - pos2[i], 2), 0));
};

export const initPopCache = async () => {
	const population_map = await fetch('/data/modern_populations.json').then(res => res.json());
	const existing_pops = await getPops();
	for (const population of population_map) {
		if (!existing_pops.includes(population.population))
			await addPopulation(population.population, population.dataset, population.aadr_population);
	}
};

