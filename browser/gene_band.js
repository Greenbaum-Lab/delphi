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

const bandBounds = (plot_area_width, region, gene) => {
	const pixels_per_base = plot_area_width / (region.end - region.start);
	const left = (gene.start - region.start) * pixels_per_base;
	const right = (gene.end - region.start) * pixels_per_base;
	if (right <= 0 || left >= plot_area_width)
		return null;
	const visible_left = Math.max(left, 0);
	return {left: visible_left, width: Math.min(right, plot_area_width) - visible_left};
};

const positionGeneBand = (plot_area, region) => {
	const gene_band = ensureGeneBand(plot_area);
	const bounds = bandBounds(plot_area.offsetWidth, region, banded_gene);
	gene_band.classList.toggle('show', bounds !== null);
	if (!bounds)
		return;
	gene_band.style.left = bounds.left + 'px';
	gene_band.style.width = bounds.width + 'px';
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
