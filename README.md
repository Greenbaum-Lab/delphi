# DELPHI

**DNA Explorer for Locus-Based Population History Insights**

### [Open the browser → delphi.seqmash.com](https://delphi.seqmash.com/)

---

DELPHI is an interactive genome browser for exploring population-genetic signals across modern and ancient human genomes. It hosts thousands of curated genomes, computes measures of diversity, differentiation, and selection directly across the populations you choose, and lets you read those signals against geographic, ecological, and cultural context — all in one place, without downloading data or writing a line of code.

## Why DELPHI

Ancient DNA has transformed the study of human history. For the first time, genetic diversity and the traces of selection can be measured directly at different points in time and across different regions, rather than inferred from present-day genomes alone. But turning that data into insight is still hard work: it demands specialized tools, large reference datasets, and population-genetic expertise, and interpreting the resulting signals against their historical context adds yet another layer of effort.

Established genome browsers such as the UCSC Genome Browser, IGV, and JBrowse are excellent for visualizing variants and alignments sample by sample, but they are not organized around *population-level* structure. Getting population-level insight usually means downloading large callsets and running command-line tools like VCFtools or PLINK, then trying to interpret peaks of differentiation or regions of lost diversity in isolation. Existing population-genetic resources each cover only part of the problem — some show precomputed statistics for modern populations only, while ancient-DNA resources excel at maps and timelines but are not anchored to genomic coordinates.

DELPHI closes that gap. It is, to our knowledge, the first genome browser dedicated to displaying population-genetic measures along the genome and linking them directly to both modern and ancient population panels. It is built to be inviting to open and quick to read, so that specialists and newcomers alike can test a hypothesis by simply looking at the data.

## What you can do

- **Compare populations, not just samples.** Select from predefined modern and ancient population groups — ancient samples are binned into 1,000-year windows within geographic regions — or define your own custom groups from individual samples.
- **Compute signals on demand.** View expected heterozygosity, pairwise F<sub>ST</sub>, Tajima's *D*, and Fu & Li's *F*\* along any region of the genome, computed directly across the populations you selected.
- **Order tracks by metadata.** Sort signal tracks by time, distance from Africa, latitude, climate, or cultural context, so a genomic signal can be read against the variables that might explain it. This is DELPHI's most distinctive feature: it gives track comparisons an interpretive axis.
- **Overlay your own annotations.** Upload custom tracks in GFF/GTF format — regulatory maps, introgression deserts, selection scans, transposable elements — and see how population signals line up with the features you care about.
- **Navigate naturally.** Jump to a region by coordinate or gene name, pan and zoom smoothly, and adjust window size (10 kb, 100 kb, or 1 Mb), plot style, and track height interactively.

Each population is paired with rich metadata — sample age, waypoint distance from an African origin, longitude and latitude, a climate index, the timing of Neolithic and urbanization transitions, and genetic distance from principal-component analysis — so patterns can be interpreted in context rather than in isolation.

DELPHI is not meant to replace established genome browsers or command-line population-genetic tools. Rigorous inference still calls for full callsets and dedicated software. DELPHI complements those workflows by foregrounding population-level structure and lowering the barrier to inspecting a hypothesis across the genome.

## Architecture

DELPHI is a framework-free web application. The client is written in vanilla JavaScript using ES modules and renders every track as native SVG, targeting current evergreen browsers. There is no build step and no heavyweight rendering library — responsiveness comes from the client architecture rather than raw compute.

Smooth panning across the genome is the result of a deliberate data strategy. Signals are windowed into fixed bins and fetched with a generous buffer around the current view, so scrolling stays ahead of the user. Requests across simultaneously displayed tracks are batched behind a short debounce, and results are cached both in memory and across sessions using IndexedDB through a service worker. Together these let a single view span tens of megabases while remaining fluid, and let a returning visitor pick up where they left off without refetching.

All data is anchored to the hg19 reference genome. This is a deliberate choice: the Allen Ancient DNA Resource and most published ancient-DNA research are distributed and reported on hg19, so anchoring DELPHI there lets users cross-reference the browser against existing datasets and literature without liftover.

## Backend and compute

To balance flexibility against latency, DELPHI uses two distinct compute paths, chosen automatically according to the data source.

**Precomputed, for modern genomes.** For analyses restricted to modern populations from the gnomAD callset (~66 million SNPs), per-population statistics are calculated ahead of time and stored as flat binary arrays. These are served as static files from cloud storage, so a request reduces to a simple byte fetch with no computation at request time — the fastest possible path for the common case.

**On demand, for ancient and custom analyses.** When you work with ancient genomes or assemble a custom combination of populations on the shared 1240K SNP panel, the statistics cannot be precomputed, because the populations themselves are defined at query time. Here the work is handled by serverless functions in the cloud. A function reads the genotype data directly from cloud storage using random access, retrieving only the sites it needs rather than downloading whole files, computes the requested statistic over the selected populations, and returns the result to the browser. The panel design means modern and ancient data share the same SNP sites, so the two can be analyzed together.

Because the neutrality and differentiation statistics depend only on summaries such as allele frequencies, segregating sites, singletons, and pairwise diversity per site, the window-based computation is identical across the modern and ancient panels — the same formulas run whether the inputs arrive precomputed or are read from genotypes on the fly. This keeps results consistent across data sources while letting each source use the fastest path available to it.

## Data sources

DELPHI integrates several curated genomic and metadata resources, all on the hg19 reference:

- **Allen Ancient DNA Resource (AADR v62)** — ancient and modern human genomes genotyped on the 1240K panel (~1.23 million SNPs), the primary source for combined modern–ancient analysis.
- **gnomAD v3.1.2** — modern populations, used for precomputed statistics over the full genotype data (~66 million SNPs).
- **CHELSA** — climatic variables (temperature and precipitation indices).
- **ArchaeoGLOBE** — cultural and archaeological summaries, including the regional onset of Neolithic and urbanization transitions.
- **UK Biobank** — genetic distances derived from principal-component analysis.
- **GENCODE v19** — gene models and annotation tracks.

## A note on responsible use

DELPHI is an exploratory tool, and it puts the analytical controls — and the responsibility that comes with them — in the user's hands. You decide which samples form a population and how large each group is, and the reliability of a track follows directly from those choices. Thin groups, high-missingness bins, or samples combined across unrelated ancestries will produce statistics that look precise but carry little meaning. Statistics on the 1240K panel also inherit its ascertainment: because its sites were drawn largely from present-day common variation, frequency-spectrum measures are biased, and Tajima's *D* in particular tends to read artificially positive for ancient bins. This does not obscure comparisons made across populations and positions on the same panel, but it is worth keeping in mind when reading absolute values.

## Citation

Peled, O., Hadari, G., Harris, K. D., & Greenbaum, G. *DELPHI: a genome browser for ancient and modern population-genetic exploration.*

Developed at the Department of Ecology, Evolution and Behavior, The Hebrew University of Jerusalem.

## License

Released under the Creative Commons Attribution 4.0 International (CC BY 4.0) license. See [`COPYING.txt`](COPYING.txt) for the full text.
