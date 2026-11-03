export const STEPS = [
	{selector: '[data-action="open-populations"]', placement: 'top', text: 'New to DELPHI? Start by choosing populations'},
	{selector: '.ag-header-cell[col-id="label"]', placement: 'top', text: 'Search populations here. Try Finnish and San'},
	{selector: '[data-subfunction="update-populations"]', placement: 'top', wait: true, text: 'Press Update to show populations'},
	{selector: '[data-input="region"]', placement: 'bottom', event: 'change', wait: true, text: 'Find the eye color gene HERC2 and press Enter'},
	{selector: '.more-toggle', placement: 'top', text: 'Play with the plot here'},
	{selector: '[data-action="autoscale-y"]', placement: 'left', text: 'This is a good one!'},
	{selector: '.signal-tracks-container [data-population="Finnish"] .track-plot-area', placement: 'top', event: 'mouseup', wait: true, text: 'Low heterozygosity at the Finnish population indicates selection! You can click and drag to explore the area around'},
	{selector: '.measure-selector', placement: 'top', event: 'change', wait: true, text: 'Tired of heterozygosity? Pick another signal'},
	{selector: '.sort-selector, .sort-selector-pairwise', placement: 'top', event: 'change', wait: true, text: 'Sort tracks by time, climate or culture'},
	{selector: '[data-action="open-annotations"]', placement: 'top', text: 'Finally, add annotations or upload your own'},
	{selector: '.ag-row', contains: 'haqer', placement: 'top', text: 'Try ticking this one to add regions with accelerated evolution'}
];
