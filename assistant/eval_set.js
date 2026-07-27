/**
 * Held-out utterances for measuring the model loop. Every phrasing here is
 * absent from the prompt in prompt.js, and the genes, populations and fields
 * used in the prompt's examples are deliberately not reused, so a pass means
 * the mapping generalised rather than that the example was recalled.
 *
 * Scoring is on the action alone, which is a closed enum and needs no human
 * judgement. Extraction quality is reported separately, because a correct
 * action carrying a name the resolver then refuses is a different failure from
 * a wrong action, and the two want different fixes.
 *
 * hard marks an utterance that requires knowledge the model is not supposed to
 * supply. take me to the lactase gene is the case in point: the user never
 * typed LCT, so extracting lactase and failing to resolve is correct behaviour
 * under D-011, and resolving it would mean the model invented the mapping.
 */
export const EVAL_SET = [
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
