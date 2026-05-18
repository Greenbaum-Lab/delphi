
export const color_cycle = [
	[31,119,180],[255,127,14],[44,160,44],[214,39,40],[148,103,189],
	[140,86,75],[227,119,194],[127,127,127],[188,189,34],[23,190,207],
	[60,119,180],[255,167,14],[44,160,74],[244,39,40],[148,143,189],
	[140,86,115],[255,119,194],[127,170,127],[188,189,70],[70,190,207]
];

export const range = (a, b, s = 1) => {
	const n = Math.max(0, Math.ceil((b - a) / s));
	return Array(n).fill(0).map((_, i) => a + i * s);
};

export const round = (v, p = 4) => {
	const k = 10 ** p;
	return Math.round(v * k) / k;
};

export const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

export const shortNotation = v => {
	if (v === 0) return '0';
	if (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2)
		return v.toExponential(1);
	return round(v, 2).toString();
};

const _svgElem = (svg, type, props) => {
	const el = document.createElementNS('http://www.w3.org/2000/svg', type);
	for (const k in props) el.setAttribute(k, props[k]);
	svg.appendChild(el);
	return el;
};

export const svg_draw = (svg, bounds = [[0, 1], [0, 1]]) => {
	const dims = svg.closest('[data-dims]') ? JSON.parse(svg.closest('[data-dims]').dataset.dims) : [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height];
	const scale = bounds.map((v, i) => dims[i] / (v[1] - v[0]));
	const toXY = ([x, y]) => [
		(x - bounds[0][0]) * scale[0],
		(bounds[1][1] - y) * scale[1]
	];
	return {
		elem  : svg,
		dims,
		bounds,
		pre   : () => {},
		post  : () => {},
		clear(selector = '*', exclude = '') {
			svg.querySelectorAll(`${selector}${exclude ? `:not(${exclude})` : ''}`)
			   .forEach(n => svg.removeChild(n));
		},
		element: (type, props) => _svgElem(svg, type, props),
		point(pt, color, r = 3, opacity = 1) {
			const [cx, cy] = toXY(pt);
			return _svgElem(svg, 'circle',
				{cx, cy, r, fill: `rgb(${color.join(',')})`, opacity});
		},
		rect(x, y, w, h, fill = [0, 0, 0], opacity = 1, data = {}) {
			return _svgElem(svg, 'rect',
				{x, y, width: w, height: h,
				 fill: `rgb(${fill.join(',')})`, opacity, ...data});
		},
		normed_rect(s, color, opacity = 1) {
			const [x, y] = [s[0] * dims[0], s[1] * dims[1]];
			return this.rect(x, y, dims[0] * s[2], dims[1] * s[3], color, opacity);
		},
		scaled_rect(s, color, opacity = 1) {
			const [x, y] = [scale[0] * (s[0] - bounds[0][0]),
			                scale[1] * (bounds[1][1] - s[1] - s[3])];
			return this.rect(x, y, scale[0] * s[2], scale[1] * s[3], color, opacity);
		},
		circle(x, y, r = 3, fill = [0, 0, 0], opacity = 1, data = {}) {
			return _svgElem(svg, 'circle',
				{cx: x, cy: y, r, fill: `rgb(${fill.join(',')})`, opacity, ...data});
		},
		polyline(points, stroke = [0, 0, 0], opacity = 1, data = {}) {
			const pts = points.map(p => p.join(',')).join(' ');
			return _svgElem(svg, 'polyline',
				{points: pts, fill: 'none',
				 stroke: `rgb(${stroke.join(',')})`, opacity, ...data});
		},
		polygon(points, fill = [0, 0, 0], opacity = 1, data = {}) {
			const pts = points.map(p => p.join(',')).join(' ');
			return _svgElem(svg, 'polygon',
				{points: pts, fill: `rgb(${fill.join(',')})`, opacity, ...data});
		},
		text(str, x, y, data = {}) {
			const el = _svgElem(svg, 'text', {x, y, ...data});
			el.textContent = str;
			return el;
		},
		line_x(line, color, opacity = 1) {
			const pts = line.map(toXY);
			return this.polyline(pts, color, opacity);
		},
		line(line, color, dynamicOrOffset = false, offset = 0, opacity = 1) {
			const off = typeof dynamicOrOffset === 'number' ? dynamicOrOffset : offset;
			const pts = line.map((y, idx) => toXY([idx + off, y]));
			return this.polyline(pts, color, opacity);
		},
		bar(dx, dy, dw, bounds, fill = [0,0,0], opacity = 1, data = {}) {
			const x  = dims[0] * dx / (bounds[0][1] - bounds[0][0]) - bounds[0][0];
			const yv = dims[1] * dy / (bounds[1][1] - bounds[1][0]) - bounds[1][0];
			const w  = dims[0] * dw / (bounds[0][1] - bounds[0][0]);
			return this.rect(x, dims[1] - yv, w, yv, fill, opacity, data);
		},
		plot(xArr, yArr, xlim, ylim, stroke = [0,0,0], opacity = 1, data = {}) {
			const pts = xArr.map((x, i) => [
				((x - xlim[0]) / (xlim[1] - xlim[0])) * dims[0],
				(1 - (yArr[i] - ylim[0]) / (ylim[1] - ylim[0])) * dims[1]
			]);
			return this.polyline(pts, stroke, opacity, data);
		},
		fill(fill, opacity = 1, data = {}) {
			return this.rect(0,0,dims[0],dims[1],fill,opacity,data);
		},
		grid(res = 40) {
			const xres = dims[0] / Math.floor(dims[0] / res);
			const yres = dims[1] / Math.floor(dims[1] / res);
			for (let x = xres; x < dims[0]; x += xres) this.rect(x, 0, 1, dims[1], undefined, 0.1);
			for (let y = yres; y < dims[1]; y += yres) this.rect(0, y, dims[0], 1, undefined, 0.1);
		},
		genomicRect(genomic_x, genomic_width, pixel_y, pixel_height, fill, opacity = 1, data = {}) {
			const pixel_x = (genomic_x - bounds[0][0]) * scale[0];
			const pixel_width = genomic_width * scale[0];
			return this.rect(pixel_x, pixel_y, pixel_width, pixel_height, fill, opacity, data);
		},
		genomicLine(genomic_x1, genomic_x2, pixel_y1, pixel_y2, stroke, opacity = 1, data = {}) {
			const pixel_x1 = (genomic_x1 - bounds[0][0]) * scale[0];
			const pixel_x2 = (genomic_x2 - bounds[0][0]) * scale[0];
			return this.polyline([
				[pixel_x1, pixel_y1],
				[pixel_x2, pixel_y2]
			], stroke, opacity, data);
		}
	};
};

export const canvas_draw = (canvas, ctx, bounds = [[0, 1], [0, 1]]) => {
	const dims = canvas.closest('[data-dims]') ? JSON.parse(canvas.closest('[data-dims]').dataset.dims) : [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height];
	const scale = bounds.map((v, i) => dims[i] / (v[1] - v[0]));

	const toXY = ([x, y]) => [
		(x - bounds[0][0]) * scale[0],
		(bounds[1][1] - y) * scale[1]
	];

	return {
		elem: canvas,
		pre () { ctx.translate(0.5, 0.5); },
		post() { ctx.translate(-0.5, -0.5); },
		clear() { ctx.clearRect(0, 0, ...dims); },
		point(pt, color, r = 3, opacity = 1) {
			const [cx, cy] = toXY(pt);
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, 2 * Math.PI);
			ctx.fillStyle = `rgba(${color.join(',')},${opacity})`;
			ctx.fill();
		},
		circle(x, y, r = 3, fill = [0, 0, 0], opacity = 1, data = {}) {
			ctx.beginPath();
			ctx.arc(x, y, r, 0, 2 * Math.PI);
			ctx.fillStyle = `rgba(${fill.join(',')},${opacity})`;
			ctx.fill();
		},
		rect(x, y, w, h, fill = [0,0,0], opacity = 1, stroke = false) {
			ctx.fillStyle = `rgba(${fill.join(',')},${opacity})`;
			ctx.fillRect(x, y, w, h);
			if (stroke) {
				ctx.strokeStyle = `rgba(${fill.join(',')},${opacity})`;
				ctx.strokeRect(x, y, w, h);
			}
		},
		normed_rect(s, color, opacity = 1) {
			const [x, y] = [s[0] * dims[0], s[1] * dims[1]];
			this.rect(x, y, dims[0] * s[2], dims[1] * s[3], color, opacity);
		},
		scaled_rect(s, color, opacity = 1, stroke = true) {
			const [x, y] = [
				scale[0] * (s[0] - bounds[0][0]),
				scale[1] * (bounds[1][1] - s[1] - s[3])
			];
			this.rect(x, y, scale[0] * s[2], scale[1] * s[3], color, opacity, stroke);
		},
		polyline(points, stroke = [0,0,0], opacity = 1) {
			ctx.beginPath();
			points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
			ctx.strokeStyle = `rgba(${stroke.join(',')},${opacity})`;
			ctx.stroke();
		},
		polygon(points, fill = [0,0,0], opacity = 1) {
			ctx.beginPath();
			points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
			ctx.fillStyle = `rgba(${fill.join(',')},${opacity})`;
			ctx.fill();
		},
		text(txt, x, y, rotate = 0, color = [0,0,0]) {
			ctx.save();
			ctx.fillStyle = `rgb(${color.join(',')})`;
			if (rotate) {
				ctx.translate(x, y);
				ctx.rotate((Math.PI / 180) * rotate);
				ctx.fillText(txt, 0, 0);
			} else {
				ctx.fillText(txt, x, y);
			}
			ctx.restore();
		},
		line_x(line, color, opacity = 1) {
			this.polyline(line.map(toXY), color, opacity);
		},
		line(line, color, dynamicOrOffset = false, offset = 0, opacity = 1) {
			const off = typeof dynamicOrOffset === 'number' ? dynamicOrOffset : offset;
			const pts = line.map((y, idx) => toXY([idx + off, y]));
			this.polyline(pts, color, opacity);
		},
		filled_line(line, prev, offset = 0) {
			const cur = prev.slice();
			line.forEach(([x, y]) => cur[x] += y);
			const poly = prev.map((y, x) => toXY([x + offset, y]))
				.concat(cur.slice().reverse().map((y, i) => toXY([offset + cur.length - 1 - i, y])));
			this.polygon(poly, line[0][2], 0.5);
			return cur;
		},
		grid(res = 40) {
			const xres = dims[0] / Math.floor(dims[0] / res);
			const yres = dims[1] / Math.floor(dims[1] / res);
			ctx.fillStyle = 'rgba(0,0,0,0.1)';
			for (let x = xres; x < dims[0]; x += xres) ctx.fillRect(x, 0, 1, dims[1]);
			for (let y = yres; y < dims[1]; y += yres) ctx.fillRect(0, y, dims[0], 1);
		}
	};
};

export const draw_object = (elem, bounds) => {
	switch(elem.tagName) {
		case 'svg':
			return svg_draw(elem, bounds);
		case 'CANVAS':
			const context = elem.getContext('2d');
			return canvas_draw(elem, context, bounds);
	}
};
