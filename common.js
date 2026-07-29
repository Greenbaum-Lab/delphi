
export const hexToRgb = hex => hex.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16));

export const roundToTenth = (value) => {
	if (value === 0)
		return 0;
	const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))));
	return Math.round(value / (magnitude / 10)) * (magnitude / 10);
};

export const formatSpan = (span) => {
	if (span < 1000) return `${span} bp`;
	if (span < 1_000_000) return `${(span / 1000).toFixed(0)} kb`;
	return `${(span / 1_000_000).toFixed(1)} Mb`;
};

export const findZoomLevel = (span) => {
	let closest_index = 0;
	let min_diff = Math.abs(ZOOM_LEVELS[0] - span);
	for (let i = 1; i < ZOOM_LEVELS.length; i++) {
		const diff = Math.abs(ZOOM_LEVELS[i] - span);
		if (diff < min_diff) {
			min_diff = diff;
			closest_index = i;
		}
	}
	return closest_index;
};

export const getAxisLabel = (measure) => {
	const labels = {
		'heterozygosity': 'Heterozygosity',
		'fst': 'FST',
		'tajimasd': "Tajima's D",
		'fulif': "Fu & Li's F"
	};
	return labels[measure] || measure;
};

export const parseRegion = (input) => {
	const match = input.match(/^chr?(\d+|X|Y):(\d+)-(\d+)$/i);
	if (!match) return null;
	return { chr: match[1].toUpperCase(), start: parseInt(match[2]), end: parseInt(match[3]) };
};


// hg19. move to data files
export const CHR_LENGTHS = {
	'chr1': 249250621, 'chr2': 243199373, 'chr3': 198022430, 'chr4': 191154276, 'chr5': 180915260,
	'chr6': 171115067, 'chr7': 159138663, 'chr8': 146364022, 'chr9': 141213431, 'chr10': 135534747,
	'chr11': 135006516, 'chr12': 133851895, 'chr13': 115169878, 'chr14': 107349540, 'chr15': 102531392,
	'chr16': 90354753, 'chr17': 81195210, 'chr18': 78077248, 'chr19': 59128983, 'chr20': 63025520,
	'chr21': 48129895, 'chr22': 51304566, 'chrX': 155270560, 'chrY': 59373566, 'chrM': 16569
};

// Move to default settings in localStorage

export const MIN_SPAN = 10_240;
export const MAX_SPAN = 83_886_080;
export const CHR_LABEL_WIDTH = 40;

export const generateZoomLevels = () => {
	const levels = [];
	let span = MIN_SPAN;
	while (span <= MAX_SPAN) {
		levels.push(span);
		span *= 2;
	}
	return levels;
};

export const ZOOM_LEVELS = generateZoomLevels();

export const COLUMN_DESCRIPTIONS = fetch('/data/column_descriptions.json').then(response => response.json());

