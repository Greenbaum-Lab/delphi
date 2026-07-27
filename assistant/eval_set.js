/**
 * Utterances for measuring the model loop, in two sets.
 *
 * DEV_SET is burned. Its 26 utterances were run, their failures were read, and
 * the prompt was changed in response, so a score on it now measures the fix
 * rather than the capability. It is kept because a fix that does not move the
 * set it was written against is not a fix.
 *
 * HELD_OUT_SET was written from the capability definitions in CLAUDE.md
 * section 6, five per action, before the prompt change that followed DEV_SET's
 * results and without reference to which of its utterances failed. It shares no
 * phrasing with the prompt and reuses none of the prompt's example genes,
 * populations or sort fields. It is the only set whose number should be quoted,
 * and it is burned the moment its failures inform a change.
 *
 * hard marks an utterance needing knowledge the model is not supposed to
 * supply. The lactase gene is the case in point: the user never typed LCT, so
 * extracting lactase and failing to resolve is correct under D-011.
 */
export const DEV_SET = [
	{ utterance: 'jump to EDAR', expected: 'select_gene' },
	{ utterance: 'where is SLC24A5', expected: 'select_gene' },
	{ utterance: 'I want to look at MCM6', expected: 'select_gene' },
	{ utterance: 'bring up TP53', expected: 'select_gene' },
	{ utterance: 'take me to the lactase gene', expected: 'select_gene', hard: true },
	{ utterance: 'go to chr2:136545000-136594000', expected: 'navigate' },
	{ utterance: 'move to chr5 from 1000000 to 2000000', expected: 'navigate' },
	{ utterance: 'chr17:7500000-7600000', expected: 'navigate' },
	{ utterance: 'switch to FST', expected: 'select_statistic' },
	{ utterance: 'use heterozygosity', expected: 'select_statistic' },
	{ utterance: 'change to tajimasd', expected: 'select_statistic' },
	{ utterance: 'show me population Basque', expected: 'add_population' },
	{ utterance: 'add the San as well', expected: 'add_population' },
	{ utterance: 'also display Yoruba', expected: 'add_population' },
	{ utterance: 'just the Han and nothing else', expected: 'replace_population' },
	{ utterance: 'clear the rest and show French', expected: 'replace_population' },
	{ utterance: 'sort by Distance_from_Africa, descending', expected: 'select_sort' },
	{ utterance: 'order the tracks by time ascending', expected: 'select_sort' },
	{ utterance: 'arrange by Temperature_index asc', expected: 'select_sort' },
	{ utterance: 'what statistic am I looking at', expected: 'answer_state' },
	{ utterance: 'how many populations are shown', expected: 'answer_state' },
	{ utterance: 'what mode am I in', expected: 'answer_state' },
	{ utterance: 'which region am I viewing', expected: 'answer_state' },
	{ utterance: 'make me a sandwich', expected: 'clarify' },
	{ utterance: 'hello there', expected: 'clarify' },
	{ utterance: 'explain what a genome is', expected: 'clarify' }
];

export const HELD_OUT_SET = [
	{ utterance: 'find BRCA1', expected: 'select_gene' },
	{ utterance: 'can you show me the CFTR region', expected: 'select_gene' },
	{ utterance: 'navigate to APOE', expected: 'select_gene' },
	{ utterance: 'I need to see FOXP2', expected: 'select_gene' },
	{ utterance: 'pull up the gene MYH9', expected: 'select_gene' },

	{ utterance: 'chr1:55000000-56000000', expected: 'navigate' },
	{ utterance: 'take me to chromosome 12 between 6000000 and 7000000', expected: 'navigate' },
	{ utterance: 'show the region chr8:128000000-129000000', expected: 'navigate' },
	{ utterance: 'display chrX:48000000-48500000', expected: 'navigate' },
	{ utterance: 'jump to chr3 position 40000000 to 41000000', expected: 'navigate' },

	{ utterance: 'plot fst instead', expected: 'select_statistic' },
	{ utterance: 'I would rather see fulif', expected: 'select_statistic' },
	{ utterance: 'set the measure to tajimasd', expected: 'select_statistic' },
	{ utterance: 'give me heterozygosity please', expected: 'select_statistic' },
	{ utterance: 'display fst', expected: 'select_statistic' },

	{ utterance: 'put Druze on the screen', expected: 'add_population' },
	{ utterance: 'I want to see Karitiana too', expected: 'add_population' },
	{ utterance: 'bring in the Orcadian', expected: 'add_population' },
	{ utterance: 'add Colombian', expected: 'add_population' },
	{ utterance: 'include the Pima as well', expected: 'add_population' },

	{ utterance: 'show only Maya', expected: 'replace_population' },
	{ utterance: 'drop everything except Russian', expected: 'replace_population' },
	{ utterance: 'replace the current selection with Bedouin', expected: 'replace_population' },
	{ utterance: 'nothing but Surui please', expected: 'replace_population' },
	{ utterance: 'swap what is displayed for Japanese', expected: 'replace_population' },

	{ utterance: 'rank the tracks by Distance_from_Africa ascending', expected: 'select_sort' },
	{ utterance: 'sort on genetic_distance descending', expected: 'select_sort' },
	{ utterance: 'reorder by Temperature_index descending', expected: 'select_sort' },
	{ utterance: 'order by time descending', expected: 'select_sort' },
	{ utterance: 'sort by Longitude ascending', expected: 'select_sort' },

	{ utterance: 'what chromosome is displayed', expected: 'answer_state' },
	{ utterance: 'tell me the current window size', expected: 'answer_state' },
	{ utterance: 'what sort order is active', expected: 'answer_state' },
	{ utterance: 'am I in gnomad or adna mode', expected: 'answer_state' },
	{ utterance: 'what populations are currently displayed', expected: 'answer_state' },

	{ utterance: 'what time is it', expected: 'clarify' },
	{ utterance: 'write me a poem about DNA', expected: 'clarify' },
	{ utterance: 'thanks', expected: 'clarify' },
	{ utterance: 'can you delete my files', expected: 'clarify' },
	{ utterance: 'who won the world cup', expected: 'clarify' }
];
