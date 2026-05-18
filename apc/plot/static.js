import {
	svg_draw,
	canvas_draw,
	color_cycle,
	range,
	round,
	mean,
	shortNotation
} from '/apc/graphics/core.js';

import { mathNotation } from '/apc/common.js';

export const createSVG = (container, bounds = [[0, 1], [0, 1]], ratio = 1) => {
	const w = Math.floor(container.getBoundingClientRect().width) - 1;
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', w);
	svg.setAttribute('height', w * ratio);
	svg.setAttribute('viewBox', `0 0 ${w} ${w * ratio}`);
	svg.dataset.width = w;
	svg.dataset.height = w * ratio;
	container.appendChild(svg);
	return svg_draw(svg, bounds);
};

export const createCanvas = (container, bounds = [[0, 1], [0, 1]], ratio = 1) => {
	const w = Math.floor(container.getBoundingClientRect().width) - 1;
	const canvas = document.createElement('canvas');
	canvas.setAttribute('width', w);
	canvas.setAttribute('height', w * ratio);
	canvas.dataset.width = w;
	canvas.dataset.height = w * ratio;
	container.appendChild(canvas);
	const ctx = canvas.getContext('2d');
	return canvas_draw(canvas, ctx, bounds);
};

export const initializePlots = (container, plots) => {
	plots.forEach(plot => {
		if (draw_plot[plot.type] === undefined)
			throw `The plot type ${plot.type} is not defined`;
		const box = document.createElement('div');
		box.classList.add('plot');
		box.dataset.save = plot.save || 'dynamics';
		box.dataset.plot = plot.label;
		box.dataset.plotType = plot.type;

		const legend_in = (plot.legend !== undefined ? plot.legend : plot.y || plot.data || '')
			.split(',')
			.filter(v => v !== '')
			.map(lbl => `<a>${mathNotation(lbl)}</a>`)
			.join('');

		box.innerHTML =
			`<div class="crosshair"></div><div class="header">` +
			`<a data-icon="e" data-action="export" class="settings fright"></a>` +
			`<div class="title">${plot.label || 'dynamics'}</div></div>` +
			`<div class="legend">${legend_in}</div>` +
			`<div class="draw_area">` +
			`<div class="axis-label label-x">${mathNotation(plot.xlabel || 'x')}</div>` +
			`<div class="axis-label label-y">${mathNotation(plot.ylabel || 'y')}</div>` +
			`<div class="axis-tick xmin">${shortNotation(plot.xlim[0])}</div>` +
			`<div class="axis-tick ymin">${shortNotation(plot.ylim[0])}</div>` +
			`<div class="axis-tick xmax">${shortNotation(plot.xlim[1])}</div>` +
			`<div class="axis-tick ymax">${shortNotation(plot.ylim[1])}</div>` +
			`</div>`;

		container.appendChild(box);
		if (plot.type !== 'image')
			createCanvas(box.querySelector('.draw_area'));
	});
};

export const updatePlots = (container, plots, data, update_axis = false) => {
	plots.forEach(plot => {
		const box = container.querySelector(`[data-plot="${plot.label}"]`);
		if (!box) return;
		if (draw_plot[plot.type] === undefined)
			throw `The plot type ${plot.type} is not defined`;

		if (plot.type === 'image') {
			data.forEach(uri => {
				const img = document.createElement('img');
				img.setAttribute('src', uri);
				box.querySelector('.draw_area').appendChild(img);
			});
			return;
		}

		const canvas = box.querySelector('canvas');
		const draw = canvas_draw(canvas, canvas.getContext('2d'), [plot.xlim, plot.ylim]);

		if (update_axis) {
			box.querySelector('.xmin').innerText = shortNotation(plot.xlim[0]);
			box.querySelector('.xmax').innerText = shortNotation(plot.xlim[1]);
			box.querySelector('.ymin').innerText = shortNotation(plot.ylim[0]);
			box.querySelector('.ymax').innerText = shortNotation(plot.ylim[1]);
			draw.clear();
		}

		switch (true) {
			case plot.y !== undefined: {
				plot.y.split(',').forEach((y, i) => {
					const x = plot.x.split(',').length === 1 ? plot.x : plot.x.split(',')[i];
					if (data[0][x] === undefined)
						throw `x-axis parameter ${x} not found`;
					if (data[0][y] === undefined)
						throw `y-axis parameter ${y} not found`;
					const pts = data.map(d => [x, y].map(k => d[k]));
					draw_plot[plot.type](draw, pts, i);
				});
				break;
			}
			case plot.data !== undefined: {
				draw.clear();
				plot.data.split(',').forEach((param, i) => {
					if (data[data.length - 1][param] === undefined)
						throw `data parameter ${param} not found`;
					draw_plot[plot.type](draw, data[data.length - 1][param], i);
				});
				break;
			}
			case plot.function !== undefined:
				draw_plot[plot.type](draw, data);
				break;
			default:
				throw `plot input not defined for ${plot.label}`;
		}
	});
};

export const draw_plot = {
	scatter: (d, pts, i, r = 5, op = 0.5) =>
		pts.forEach(p => d.point(p, color_cycle[i], r, p[2] !== undefined ? p[2] : op)),

	line:   (d, ln, i) => d.line_x(ln, color_cycle[i]),

	lines:  (d, lines, i) => {
		const ln_mean = lines.map(([x, ys]) => [x, mean(ys)]);
		const reps = range(0, lines[0][1].length).map(j =>
			lines.map(([x, ys]) => [x, ys[j]]));
		d.line_x(ln_mean, color_cycle[i]);
		reps.forEach(l => d.line_x(l, color_cycle[i], 0.2));
	},

	grayscale_2d: (d, mtx) => {
		d.pre();
		mtx.forEach((row, y) => row.forEach((cell, x) => {
			const col = [255 * cell, 255 * cell, 255 * cell];
			d.normed_rect([x / row.length, (mtx.length - y - 1) / mtx.length,
				1 / row.length, 1 / mtx.length], col);
		}));
		d.post();
	},

	mat: (d, mtx, i) => {
		d.pre();
		mtx.forEach((row, y) => row.forEach((v, x) => {
			const col = Array.isArray(v)
				? v
				: (typeof v === 'number'
					? range(0, 3).map(j => color_cycle[i][j] +
						(color_cycle[i + 1][j] - color_cycle[i][j]) * v)
					: [200, 200, 200]);
			d.normed_rect([x / row.length, (mtx.length - y - 1) / mtx.length,
				1 / row.length, 1 / mtx.length], col);
		}));
		d.post();
	},

	mat_grayscale: (d, mtx) => {
		d.pre();
		mtx.forEach((row, y) => row.forEach((v, x) => {
			const col = Array.isArray(v) ? v :
				(typeof v === 'number' ? [255 * v, 255 * v, 255 * v] : [200,200,200]);
			d.normed_rect([x / row.length, (mtx.length - y - 1) / mtx.length,
				1 / row.length, 1 / mtx.length], col);
		}));
		d.post();
	},

	grid: (d, pts, i) => {
		d.pre();
		pts.forEach(([x, y, v]) => {
			const col = Array.isArray(v)
				? v
				: (typeof v === 'number'
					? range(0, 3).map(j => color_cycle[i][j] +
						(color_cycle[i + 1][j] - color_cycle[i][j]) * v)
					: [200, 200, 200]);
			d.scaled_rect([x, y, 1, 1], col);
		});
		d.post();
	},

	network_plot: (d, [nodes, edges], i) => {
		d.clear();
		edges.forEach(e => d.line_x(e, color_cycle[i]));
		nodes.forEach(n => {
			const col = range(0, 3).map(j => color_cycle[i][j] +
				(color_cycle[i + 1][j] - color_cycle[i][j]) * n[2]);
			d.point(n.slice(0, 2), col);
		});
	},

	image: () => {}
};
