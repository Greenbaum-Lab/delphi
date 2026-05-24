This file coordinates all parts of the genome browser

Browser is the front-end app – the thing running in the user’s tab.
It owns:
The UI state (which assembly, chr, start–end, selected populations, selected measure, window size, etc.).
The rendering of tracks (annotation, per-population signals, pairwise FST tracks).
The plot/ruler region at the top: default chr1:1,000,000–2,000,000, ruler in bp / Mb, zoom & pan.
It talks “upwards” to the UI controls (query box, population selector, measure selector).
It talks “downwards” to two internal subsystems:
Panels (your “panels” / “layers” box)
Assets (your “assets” + sw.js + S3/Lambda side)
So the Browser is really a controller that coordinates UI, data loading, and tracks.
  
Current Status:
- browser.js: FUNCTIONAL - main genome browser controller
- plot.js: FUNCTIONAL - rendering plots
- genome_browser.html: FUNCTIONAL - DOM structure
- genome_browser.css: FUNCTIONAL - styling

Needs Implementation:
- assets. js: NOT aligned with genome browser spec - needs refactoring for GTF annotation, population metadata, measure data
- layer.js: EXISTS but NOT integrated - needs adaptation for annotation track + population signal tracks
- analysis.js: EXISTS but NOT aligned - needs heterozygosity computation for MVP
- worker.analysis.js: EXISTS but NOT aligned - needs to compute measures from raw data
- worker.genome. js: PURPOSE UNCLEAR - review for genome-specific tasks
- genome_state.js: needs expansion to track {assembly, chr, start, end, measure, window_size, populations}
- genome_draw.js: needs review for track rendering (annotation + population tracks with shared Y-axis)
