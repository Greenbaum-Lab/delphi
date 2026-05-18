'use strict';

export const coordToPixel = (value, bounds, length) => {
	return ((value - bounds[0]) / (bounds[1] - bounds[0])) * length;
};

export const pixelToCoord = (pixel, bounds, length) => {
	return bounds[0] + (pixel / length) * (bounds[1] - bounds[0]);
};

export const withinBounds = (value, bounds) => {
	return value >= bounds[0] && value <= bounds[1];
};

export const getDims = (svg) => {
	return [+(svg.dataset.width), +(svg.dataset.height)];
};

export const draw = {
	svg: {
		create: (parentElement, dims) => {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('width', dims[0]);
			svg. setAttribute('height', dims[1]);
			svg.setAttribute('viewBox', `0 0 ${dims[0]} ${dims[1]}`);
			svg.setAttribute('preserveAspectRatio', 'none');
			svg. dataset.width = dims[0];
			svg.dataset.height = dims[1];
			parentElement.appendChild(svg);
			return svg;
		},
		load: (svg) => {
			return svg;
		},
		element: (svg, type, props) => {
			const element = document.createElementNS('http://www.w3.org/2000/svg', type);
			for (const prop in props)
				element.setAttribute(prop, props[prop]);
			svg. appendChild(element);
			return element;
		},
		clear: (svg, selector='*', exclude='[data-region]') => {
			svg.querySelectorAll(`${selector}:not(${exclude})`).forEach(item => svg.removeChild(item));
		},
		rect: (svg, x, y, width, height, fill=[0, 0, 0], opacity=1, data={}) => {
			draw.svg.element(svg, 'rect', {x, y, width, height, fill: `rgb(${fill. join(',')})`, opacity, ... data});
		},
		line: (svg, x1, y1, x2, y2, stroke=[0, 0, 0], strokeWidth=1, data={}) => {
			draw. svg.element(svg, 'line', {x1, y1, x2, y2, stroke: `rgb(${stroke.join(',')})`, 'stroke-width': strokeWidth, ...data});
		},
		circle: (svg, cx, cy, r=3, fill=[0, 0, 0], opacity=1, data={}) => {
			draw. svg.element(svg, 'circle', {cx, cy, r, fill: `rgb(${fill.join(',')})`, opacity, ...data});
		},
		text: (svg, x, y, text, data={}) => {
			const elem = draw.svg.element(svg, 'text', {x, y, ... data});
			elem.innerHTML = text;
		},
		polyline: (svg, points, stroke=[0, 0, 0], opacity=1, data={}) => {
			draw.svg. element(svg, 'polyline', {points: points. map(v => v.join(',')).join(' '), stroke: `rgb(${stroke.join(',')})`, fill: 'none', opacity, ...data});
		},
		feature: (svg, start, end, y, height, bounds, fill=[0, 0, 0], opacity=1, data={}) => {
			const dims = getDims(svg);
			const x = coordToPixel(start, bounds, dims[0]);
			const width = coordToPixel(end, bounds, dims[0]) - x;
			if (width > 0. 5)
				draw.svg. rect(svg, x, y, Math.max(1, width), height, fill, opacity, data);
		},
		lineBounds: (svg, start, end, y1, y2, bounds, stroke=[0, 0, 0], strokeWidth=1, data={}) => {
			const dims = getDims(svg);
			const x1 = coordToPixel(start, bounds, dims[0]);
			const x2 = coordToPixel(end, bounds, dims[0]);
			if (x2 - x1 > 0.5)
				draw.svg.line(svg, x1, y1, x2, y2, stroke, strokeWidth, data);
		}
	}
};

export const loadDrawingArea = (parentElement, type='svg', ratio=2) => {
	if (parentElement.dataset.dims) {
		return draw[type].create(parentElement, JSON.parse(parentElement.dataset. dims));
	} else {
		const width = parentElement.offsetWidth;
		const height = parentElement.offsetHeight;
		const dims = [width, height];
		parentElement.dataset.dims = JSON. stringify(dims);
		parentElement.dataset.offset = JSON.stringify([0, 0]);
		parentElement.dataset.zoom = 1;
		parentElement.dataset.ratio = ratio;
		return draw[type].create(parentElement, dims);
	}
};
