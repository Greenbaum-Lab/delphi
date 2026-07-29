import { addHooks, getOptions } from '/apc/common.js';
import { svg_draw } from '/apc/graphics/core.js';
import { createSVG } from '/apc/plot/static.js';
import { getTracks, loadGeneMap, getAnnotationEntry } from '/assets.js';
import { CHR_LENGTHS, hexToRgb } from '/common.js';
import { formatRegionString } from '/browser/region.js';
import { updateRegionInput, generateCoordinateTicks, drawGuides, showHoverLine, hideHoverLine } from '/browser/helpers.js';

const cssVars = getComputedStyle(document.documentElement);
const getVar = (name) => cssVars.getPropertyValue(name).trim();

const GENE_COLOR = hexToRgb(getVar('--data-1'));
const INTRON_COLOR = [120, 120, 120];
const HIGHLIGHT_COLOR = hexToRgb(getVar('--accent2'));
const FOCAL_WINDOW_COLOR = hexToRgb(getVar('--data-1'));
const FOCAL_WINDOW_OPACITY = 0.5;

const GENE_HEIGHT = 10;
const GENE_VERTICAL_SPACING = 30;
const GENE_TRACKS = 3;
const STRAND_CHEVRON_SPACING_PX = 20;
const STRAND_CHEVRON_HALF_HEIGHT_PX = 3;
const MIN_ANNOTATION_SPAN = 10_000;
const MIN_ANNOTATION_PIXELS = 4;
const MAX_ANNOTATION_VIEW_FRACTION = 0.02;

let highlighted_gene = null;

const drawStrandChevrons = (drawer, intron_start, intron_end, center_y, strand, gene_name) => {
	const [region_start, region_end] = drawer.bounds[0];
	const pixels_per_base = drawer.dims[0] / (region_end - region_start);
	const start_px = (intron_start - region_start) * pixels_per_base;
	const end_px = (intron_end - region_start) * pixels_per_base;
	const width_px = end_px - start_px;
	if (width_px < STRAND_CHEVRON_SPACING_PX) return;
	const count = Math.floor(width_px / STRAND_CHEVRON_SPACING_PX);
	const tip_dx = strand === '-' ? -STRAND_CHEVRON_HALF_HEIGHT_PX : STRAND_CHEVRON_HALF_HEIGHT_PX;
	for (let index = 1; index <= count; index++) {
		const base_px = start_px + (width_px * index) / (count + 1);
		drawer.polyline([
			[base_px, center_y - STRAND_CHEVRON_HALF_HEIGHT_PX],
			[base_px + tip_dx, center_y],
			[base_px, center_y + STRAND_CHEVRON_HALF_HEIGHT_PX]
		], INTRON_COLOR, 1, {'data-gene': gene_name});
	}
};

const drawDetailedGene = (drawer, gene, y, gene_name) => {
	const exons = gene.exons || [];
	const introns = gene.introns || [];
	const strand = gene.strand;
	
	if (exons.length === 0) {
		const geneStart = gene.coordinates.start;
		const geneEnd = gene.coordinates.end;
		drawer.genomicRect(geneStart, geneEnd - geneStart, y, GENE_HEIGHT, GENE_COLOR, 1, {'data-gene': gene_name});
		return;
	}
	
	const centerY = y + GENE_HEIGHT / 2;
	
	introns.forEach(intron => {
		const intronStart = intron[0];
		const intronEnd = intron[1];
		drawer.genomicRect(intronStart, intronEnd - intronStart, centerY-1, 2, INTRON_COLOR, 1, {'data-gene': gene_name});
		if (strand === '+' || strand === '-') {
			drawStrandChevrons(drawer, intronStart, intronEnd, centerY, strand, gene_name);
		}
	});
	
	exons.forEach(exon => {
		const exonStart = exon[0];
		const exonEnd = exon[1];
		drawer.genomicRect(exonStart, exonEnd - exonStart, y, GENE_HEIGHT, GENE_COLOR, 1, {'data-gene': gene_name});
	});
};

const minimumVisibleSpan = (drawer) => {
	const [region_start, region_end] = drawer.bounds[0];
	const region_span = region_end - region_start;
	const bases_per_pixel = region_span / drawer.dims[0];
	return Math.max(MIN_ANNOTATION_PIXELS * bases_per_pixel, Math.min(MIN_ANNOTATION_SPAN, region_span * MAX_ANNOTATION_VIEW_FRACTION));
};

const drawMinimumSpanBlock = (drawer, gene, y, gene_name, minimum_span) => {
	const center = (gene.coordinates.start + gene.coordinates.end) / 2;
	drawer.genomicRect(center - minimum_span / 2, minimum_span, y, GENE_HEIGHT, GENE_COLOR, 1, {'data-gene': gene_name});
};

const getGeneTrackIndex = (geneName) => {
	let hash = 0;
	for (let i = 0; i < geneName.length; i++) {
		hash = ((hash << 5) - hash) + geneName.charCodeAt(i);
		hash = hash & hash;
	}
	return Math.abs(hash) % GENE_TRACKS;
};

const drawAnnotation = (svg, annotation_data) => {
	const options = getOptions();

  	const h = +(svg.dataset.height);
	const drawer = svg_draw(svg, [[options.start, options.end], [0, h]]);
	drawer.clear();

	const genes = annotation_data?.raw_data || [];
	const minimum_span = minimumVisibleSpan(drawer);

	const regionSpan = options.end - options.start;
	const coordHeight = 12;
	const geneTrackY = 2;
	const geneTrackHeight = h - coordHeight - 4;
	
	const sorted_genes = [...genes].sort((a, b) => a.gene.localeCompare(b.gene));
	
	sorted_genes.forEach((gene) => {
		const geneStart = gene.coordinates.start;
		const geneEnd = gene.coordinates.end;
		const geneName = gene.gene;
		const y = geneTrackY + getGeneTrackIndex(geneName) * GENE_VERTICAL_SPACING;
		if (geneEnd - geneStart < minimum_span)
			drawMinimumSpanBlock(drawer, gene, y, geneName, minimum_span);
		else
			drawDetailedGene(drawer, gene, y, geneName);
		if (geneName === highlighted_gene) {
			drawer.genomicRect(geneStart, geneEnd - geneStart, 0, h, HIGHLIGHT_COLOR, 0.3);
		}
		
		if (regionSpan <= 1_000_000) {
			const geneWidth = ((geneEnd - geneStart) / regionSpan) * drawer.dims[0];
			if (geneWidth > 40) {
				const labelX = ((((geneStart + geneEnd) / 2) - options.start) / regionSpan) * drawer.dims[0];
				const textY = y + GENE_HEIGHT + 14;
				
				const tempText = drawer.text(geneName, labelX, textY, {
					'class': 'gene-label',
					'text-anchor': 'middle'
				});
				
				const bbox = tempText.getBBox();
				const padding = [5, 1];
				drawer.rect(bbox.x - padding[0], bbox.y - padding[1], bbox.width + 2 * padding[0], bbox.height + 2 * padding[1], [255, 255, 255], 1, {'class': 'gene-label-bg'});
				
				drawer.text(geneName, labelX, textY, {
					'class': 'gene-label',
					'text-anchor': 'middle'
				});
			}
		}
	});
	
	const ticks = generateCoordinateTicks(options.start, options.end, drawer.dims[0], 8);
	if (options.show_guides) drawGuides(drawer, ticks, h);
	const coordY = h - 2;
	ticks.forEach(tick => {
		drawer.text(tick.label, tick.x, coordY, {'class': 'coord-label',
			'text-anchor': 'middle'
		});
	});
};

let tooltip_timeout = null;
let current_tooltip_gene = null;

const showTooltip = (e) => {
	const tooltip = e.target.closest('[data-module="track"]').querySelector('.track-tooltip');
	const gene_name = e.target.dataset.gene;
	const genecards_url = `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${gene_name}`;
	if (tooltip_timeout) {
		clearTimeout(tooltip_timeout);
		tooltip_timeout = null;
	}
	
	if (current_tooltip_gene !== gene_name) {
		tooltip.innerHTML = `<a href="${genecards_url}" target="_blank">${gene_name}</a>`;
		tooltip.style.left = e.clientX + 10 + 'px';
		tooltip.style.top = e.clientY + 10 + 'px';
		tooltip.classList.add('show');
		current_tooltip_gene = gene_name;
	}
};

const hideTooltip = (e) => {
	const tooltip = e.target.closest('[data-module="track"]').querySelector('.track-tooltip');
	if (tooltip_timeout) {
		clearTimeout(tooltip_timeout);
	}
	tooltip_timeout = setTimeout(() => {
		tooltip.classList.remove('show');
		tooltip_timeout = null;
		current_tooltip_gene = null;
	}, 3000);
};

const handleSearch = async (e) => {
	const search_query = e.detail?.query;
	if (!search_query) return;
	
	const track = e.target;
	const browser = track.closest('[data-module="browser"]');
	const track_id = track.dataset.source;
	
	const gene_map = await loadGeneMap({ track_id });
	const normalized_query = search_query.toLowerCase();
	const match = [...gene_map.entries()].find(([name]) => name.toLowerCase() === normalized_query);
	
	if (!match) return;
	
	const options = getOptions();
	const [gene_name, coords] = match;
	const current_span = options.end - options.start;
	const half_span = Math.floor(current_span / 2);
	const new_start = Math.max(0, coords.start - half_span);
	const new_end = Math.min(CHR_LENGTHS[coords.chr] || Infinity, coords.start + half_span);
	
	getOptions([['chr', coords.chr], ['start', new_start], ['end', new_end]]);
	updateRegionInput(coords.chr, new_start, new_end);
	highlighted_gene = gene_name;
	browser.dispatchEvent(new Event('refresh'));
	setTimeout(() => {
		highlighted_gene = null;
		browser.dispatchEvent(new Event('refresh'));
	}, 4000);
};

const hooks = [
	['[data-module="track"]', 'refresh', async e => {
		const options = getOptions();
      	const track_id = e.target.dataset.source;
		const annotation_data = await getTracks({chr: options.chr, start: options.start, end: options.end, track_ids: [track_id]});
      	e.target.dispatchEvent(new Event('refreshed'));
		drawAnnotation(e.target.querySelector('svg'), annotation_data[0]);
	}],
	['svg [data-gene]', 'mouseenter', showTooltip],
	['svg [data-gene]', 'mouseleave', hideTooltip],
	['svg, svg *', 'mousemove', e => showHoverLine(e.clientX)],
	['[data-module="track"]', 'mouseleave', hideHoverLine],
	['[data-module="track"]', 'search', handleSearch],
	['[data-action="remove"]', 'click', e => {
		const track = e.target.closest('[data-module="track"]');
		getOptions([['annotations', getOptions().annotations.filter(label => label !== track.dataset.source)]]);
		document.querySelector('[data-module="browser"]').dispatchEvent(new Event('update'));
	}]
];

export const init = async (container) => {
	const track_id = container.dataset.source;
	const annotation_entry = await getAnnotationEntry(track_id);
	const template = document.getElementById('annotation-track-template');
	const clone = template.content.cloneNode(true);
	container.append(clone);
	container.setAttribute('draggable', true);
	const plot_area = container.querySelector('.track-plot-area');
	const ratio = plot_area.offsetHeight / plot_area.offsetWidth;
	createSVG(plot_area, [[0, 1], [0, 1]], ratio);
	container.querySelector('.track-label').textContent = annotation_entry?.label || track_id;
	container.querySelector('.track-type').textContent = 'Annotation';
	container.querySelector('.track-value').textContent = '';
	addHooks(container, hooks);
	return container;
};
