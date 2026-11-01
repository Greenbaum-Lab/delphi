import { getOptions } from '/apc/common.js';

const PLOT_AREA_SELECTOR = '[data-module="browser"] [data-module="track"]:not([data-type="viewfinder"]) .track-plot-area';

let banded_gene = null;

const ensureGeneBand = (plot_area) => {
	const existing_band = plot_area.querySelector('.gene-band');
	if (existing_band)
		return existing_band;
	const gene_band = document.createElement('div');
	gene_band.className = 'gene-band';
	plot_area.append(gene_band);
	return gene_band;
};

const bandBounds = (region, gene) => {
	'Return the visible gene extent as percentages of the region width, or null when out of view.';
	const region_span = region.end - region.start;
	const left = (gene.start - region.start) / region_span;
	const right = (gene.end - region.start) / region_span;
	if (right <= 0 || left >= 1)
		return null;
	const visible_left = Math.max(left, 0);
	return {left: visible_left * 100, width: (Math.min(right, 1) - visible_left) * 100};
};

const positionGeneBand = (plot_area, region) => {
	const gene_band = ensureGeneBand(plot_area);
	const bounds = bandBounds(region, banded_gene);
	gene_band.classList.toggle('show', bounds !== null);
	if (!bounds)
		return;
	gene_band.style.left = bounds.left + '%';
	gene_band.style.width = bounds.width + '%';
};

const hideGeneBand = () => {
	banded_gene = null;
	document.querySelectorAll('.gene-band').forEach(gene_band => gene_band.classList.remove('show'));
};

export const renderGeneBand = () => {
	'Position the banded gene across every data track at the coordinates now in view.';
	if (!banded_gene)
		return;
	const options = getOptions();
	if (banded_gene.chr !== options.chr)
		return hideGeneBand();
	document.querySelectorAll(PLOT_AREA_SELECTOR).forEach(plot_area => positionGeneBand(plot_area, options));
};

export const toggleGeneBand = (gene_name, gene_start, gene_end) => {
	'Band the given gene across all tracks, or clear the band when that gene is already banded.';
	if (banded_gene?.name === gene_name)
		return hideGeneBand();
	banded_gene = {name: gene_name, chr: getOptions().chr, start: gene_start, end: gene_end};
	renderGeneBand();
};
