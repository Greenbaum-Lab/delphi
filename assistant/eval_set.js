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
	{ utterance: 'jump to EDAR', expected: 'gene' },
	{ utterance: 'where is SLC24A5', expected: 'gene' },
	{ utterance: 'I want to look at MCM6', expected: 'gene' },
	{ utterance: 'bring up TP53', expected: 'gene' },
	{ utterance: 'take me to the lactase gene', expected: 'gene', hard: true },
	{ utterance: 'go to chr2:136545000-136594000', expected: 'region' },
	{ utterance: 'move to chr5 from 1000000 to 2000000', expected: 'region' },
	{ utterance: 'chr17:7500000-7600000', expected: 'region' },
	{ utterance: 'switch to FST', expected: 'statistic' },
	{ utterance: 'use heterozygosity', expected: 'statistic' },
	{ utterance: 'change to tajimasd', expected: 'statistic' },
	{ utterance: 'show me population Basque', expected: 'add_population' },
	{ utterance: 'add the San as well', expected: 'add_population' },
	{ utterance: 'also display Yoruba', expected: 'add_population' },
	{ utterance: 'just the Han and nothing else', expected: 'replace_population' },
	{ utterance: 'clear the rest and show French', expected: 'replace_population' },
	{ utterance: 'sort by Distance_from_Africa, descending', expected: 'sort' },
	{ utterance: 'order the tracks by time ascending', expected: 'sort' },
	{ utterance: 'arrange by Temperature_index asc', expected: 'sort' },
	{ utterance: 'what statistic am I looking at', expected: 'question' },
	{ utterance: 'how many populations are shown', expected: 'question' },
	{ utterance: 'what mode am I in', expected: 'question' },
	{ utterance: 'which region am I viewing', expected: 'question' },
	{ utterance: 'make me a sandwich', expected: 'clarify' },
	{ utterance: 'hello there', expected: 'clarify' },
	{ utterance: 'explain what a genome is', expected: 'clarify' }
];

export const HELD_OUT_SET = [
	{ utterance: 'find BRCA1', expected: 'gene' },
	{ utterance: 'can you show me the CFTR region', expected: 'gene' },
	{ utterance: 'navigate to APOE', expected: 'gene' },
	{ utterance: 'I need to see FOXP2', expected: 'gene' },
	{ utterance: 'pull up the gene MYH9', expected: 'gene' },

	{ utterance: 'chr1:55000000-56000000', expected: 'region' },
	{ utterance: 'take me to chromosome 12 between 6000000 and 7000000', expected: 'region' },
	{ utterance: 'show the region chr8:128000000-129000000', expected: 'region' },
	{ utterance: 'display chrX:48000000-48500000', expected: 'region' },
	{ utterance: 'jump to chr3 position 40000000 to 41000000', expected: 'region' },

	{ utterance: 'plot fst instead', expected: 'statistic' },
	{ utterance: 'I would rather see fulif', expected: 'statistic' },
	{ utterance: 'set the measure to tajimasd', expected: 'statistic' },
	{ utterance: 'give me heterozygosity please', expected: 'statistic' },
	{ utterance: 'display fst', expected: 'statistic' },

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

	{ utterance: 'rank the tracks by Distance_from_Africa ascending', expected: 'sort' },
	{ utterance: 'sort on genetic_distance descending', expected: 'sort' },
	{ utterance: 'reorder by Temperature_index descending', expected: 'sort' },
	{ utterance: 'order by time descending', expected: 'sort' },
	{ utterance: 'sort by Longitude ascending', expected: 'sort' },

	{ utterance: 'what chromosome is displayed', expected: 'question' },
	{ utterance: 'tell me the current window size', expected: 'question' },
	{ utterance: 'what sort order is active', expected: 'question' },
	{ utterance: 'am I in gnomad or adna mode', expected: 'question' },
	{ utterance: 'what populations are currently displayed', expected: 'question' },

	{ utterance: 'what time is it', expected: 'clarify' },
	{ utterance: 'write me a poem about DNA', expected: 'clarify' },
	{ utterance: 'thanks', expected: 'clarify' },
	{ utterance: 'can you delete my files', expected: 'clarify' },
	{ utterance: 'who won the world cup', expected: 'clarify' }
];

/**
 * TEST_SET is the only unburned set. Six per action, written from the
 * capability definitions rather than from any run's failures, and after the
 * action rename so no utterance echoes an action name back at the model, which
 * is the flaw that made navigate to APOE ambiguous in HELD_OUT_SET.
 *
 * DEV_SET and HELD_OUT_SET are both burned: their failures were read and the
 * prompt and the action names were changed in response. They are still worth
 * running as controls, because a change that does not move them has not done
 * what it claimed, and a gap where they rise while this set does not is the
 * signature of memorising.
 */
export const TEST_SET = [
	{ utterance: 'open PCSK9', expected: 'gene' },
	{ utterance: 'I would like to see HERC2', expected: 'gene' },
	{ utterance: 'centre the view on TYRP1', expected: 'gene' },
	{ utterance: 'the ABCC11 locus please', expected: 'gene' },
	{ utterance: 'look at ADH1B', expected: 'gene' },
	{ utterance: 'get me to VDR', expected: 'gene' },

	{ utterance: 'chr6:29000000-30000000', expected: 'region' },
	{ utterance: 'view chr11 from 5200000 to 5300000', expected: 'region' },
	{ utterance: 'I want chr19:44900000-45000000', expected: 'region' },
	{ utterance: 'window on chr4 between 88000000 and 89000000', expected: 'region' },
	{ utterance: 'chrY:2650000-2660000', expected: 'region' },
	{ utterance: 'position 15000000 to 16000000 on chr10', expected: 'region' },

	{ utterance: 'measure heterozygosity from now on', expected: 'statistic' },
	{ utterance: 'can I have tajimasd', expected: 'statistic' },
	{ utterance: 'compute fst please', expected: 'statistic' },
	{ utterance: 'fulif is what I need', expected: 'statistic' },
	{ utterance: 'change the stat to fst', expected: 'statistic' },
	{ utterance: 'I prefer heterozygosity', expected: 'statistic' },

	{ utterance: 'throw in the Yakut', expected: 'add_population' },
	{ utterance: 'also the Tujia', expected: 'add_population' },
	{ utterance: 'stick Cambodian on there', expected: 'add_population' },
	{ utterance: 'Palestinian too please', expected: 'add_population' },
	{ utterance: 'plus the Mozabite', expected: 'add_population' },
	{ utterance: 'lets see Naxi alongside', expected: 'add_population' },

	{ utterance: 'only Adygei from now', expected: 'replace_population' },
	{ utterance: 'get rid of the others, keep Tuscan', expected: 'replace_population' },
	{ utterance: 'I want Miao by itself', expected: 'replace_population' },
	{ utterance: 'Lahu alone thanks', expected: 'replace_population' },
	{ utterance: 'wipe the list and put Hazara', expected: 'replace_population' },
	{ utterance: 'Yi and nothing besides', expected: 'replace_population' },

	{ utterance: 'line them up by time ascending', expected: 'sort' },
	{ utterance: 'by Distance_from_Africa descending', expected: 'sort' },
	{ utterance: 'shuffle the tracks by Latitude ascending', expected: 'sort' },
	{ utterance: 'genetic_distance descending for the ordering', expected: 'sort' },
	{ utterance: 'put them in Temperature_index ascending order', expected: 'sort' },
	{ utterance: 'rearrange on Longitude descending', expected: 'sort' },

	{ utterance: 'which statistic is active right now', expected: 'question' },
	{ utterance: 'how far am I zoomed in', expected: 'question' },
	{ utterance: 'what is my current window size', expected: 'question' },
	{ utterance: 'remind me which populations are up', expected: 'question' },
	{ utterance: 'what coordinates am I on', expected: 'question' },
	{ utterance: 'is this gnomad data or ancient', expected: 'question' },

	{ utterance: 'good morning', expected: 'clarify' },
	{ utterance: 'summarise this paper for me', expected: 'clarify' },
	{ utterance: 'how old is the earth', expected: 'clarify' },
	{ utterance: 'send an email to my supervisor', expected: 'clarify' },
	{ utterance: 'what is your name', expected: 'clarify' },
	{ utterance: 'cheers, bye', expected: 'clarify' }
];
