/**
 * Fifty things a working user would plausibly type, weighted the way real use
 * is weighted rather than balanced across capabilities.
 *
 * Scored on what the browser ends up showing, not on the label the model
 * emitted. An item asserts one of: option values after the turn (state), a
 * population that must be present (includes), the exact population list (only),
 * or a prefix of the reply (expect). A turn that classifies correctly but
 * resolves the wrong name therefore fails, which is the point.
 *
 * Sort fields are restricted to the five offered under every statistic, so a
 * sort item cannot fail merely because an earlier item changed the measure.
 */
export const USER_TEST_SET = [
	{ utterance: 'lets look at TP53', group: 'gene', state: { chr: 'chr17' } },
	{ utterance: 'tp53 please', group: 'gene', state: { chr: 'chr17' } },
	{ utterance: 'where is BRCA1', group: 'gene', state: { chr: 'chr17' } },
	{ utterance: 'take me to LCT', group: 'gene', state: { chr: 'chr2' } },
	{ utterance: 'show me APOE', group: 'gene', state: { chr: 'chr19' } },
	{ utterance: 'CFTR', group: 'gene', state: { chr: 'chr7' } },
	{ utterance: 'I want to see MC1R', group: 'gene', state: { chr: 'chr16' } },
	{ utterance: 'open OCA2', group: 'gene', state: { chr: 'chr15' } },

	{ utterance: 'go to chr1:1000000-2000000', group: 'region', state: { chr: 'chr1', start: 1000000, end: 2000000 } },
	{ utterance: 'chr8:20000000-21000000', group: 'region', state: { chr: 'chr8', start: 20000000, end: 21000000 } },
	{ utterance: 'show chr12 from 50000000 to 51000000', group: 'region', state: { chr: 'chr12', start: 50000000, end: 51000000 } },
	{ utterance: 'take me to chr5:80000000-80500000', group: 'region', state: { chr: 'chr5', start: 80000000, end: 80500000 } },
	{ utterance: 'chr20:5000000-6000000', group: 'region', state: { chr: 'chr20', start: 5000000, end: 6000000 } },

	{ utterance: 'switch to fst', group: 'statistic', state: { measure: 'fst' } },
	{ utterance: 'show heterozygosity', group: 'statistic', state: { measure: 'heterozygosity' } },
	{ utterance: 'i want tajimasd', group: 'statistic', state: { measure: 'tajimasd' } },
	{ utterance: 'use fulif', group: 'statistic', state: { measure: 'fulif' } },
	{ utterance: 'change to heterozygosity', group: 'statistic', state: { measure: 'heterozygosity' } },

	{ utterance: 'add Basque', group: 'add population', includes: 'Basque' },
	{ utterance: 'show me the Yoruba too', group: 'add population', includes: 'Yoruba' },
	{ utterance: 'also add French', group: 'add population', includes: 'French' },
	{ utterance: 'can you add Druze', group: 'add population', includes: 'Druze' },
	{ utterance: 'add japanese', group: 'add population', includes: 'Japanese' },
	{ utterance: 'bring in Mbuti', group: 'add population', includes: 'Mbuti' },
	{ utterance: 'add Karitiana as well', group: 'add population', includes: 'Karitiana' },

	{ utterance: 'show only Han', group: 'replace population', only: ['Han'] },
	{ utterance: 'just Sardinian and nothing else', group: 'replace population', only: ['Sardinian'] },
	{ utterance: 'clear everything and show Maya', group: 'replace population', only: ['Maya'] },
	{ utterance: 'I want Russian by itself', group: 'replace population', only: ['Russian'] },

	{ utterance: 'sort by time descending', group: 'sort', state: { sort: 'time', sort_dir: 'desc' } },
	{ utterance: 'order by Distance_from_Africa ascending', group: 'sort', state: { sort: 'Distance_from_Africa', sort_dir: 'asc' } },
	{ utterance: 'sort on Temperature_index descending', group: 'sort', state: { sort: 'Temperature_index', sort_dir: 'desc' } },
	{ utterance: 'rank by Precipitation_index ascending', group: 'sort', state: { sort: 'Precipitation_index', sort_dir: 'asc' } },
	{ utterance: 'sort by signal descending', group: 'sort', state: { sort: 'signal', sort_dir: 'desc' } },

	{ utterance: 'what statistic am I looking at', group: 'state question', expect: 'measure:' },
	{ utterance: 'which chromosome is this', group: 'state question', expect: 'chr:' },
	{ utterance: 'what region am I in', group: 'state question', expect: 'region:' },
	{ utterance: 'what mode is this', group: 'state question', expect: 'mode:' },
	{ utterance: 'how is it sorted', group: 'state question', expect: 'sort:' },
	{ utterance: 'which populations are up', group: 'state question', expect: 'populations:' },

	{ utterance: 'hi', group: 'conversation', expect: 'Hello.' },
	{ utterance: 'what can you do', group: 'conversation', expect: 'I drive this browser.' },
	{ utterance: 'what does fst mean', group: 'conversation', expect: 'fst:' },
	{ utterance: 'who are you', group: 'conversation', expect: 'I am the DELPHI assistant.' },
	{ utterance: 'thanks', group: 'conversation', expect: 'Any time.' },

	{ utterance: 'add Basqe', group: 'near miss', expect: 'No population named' },
	{ utterance: 'show me Yorubaa', group: 'near miss', expect: 'No population named' },

	{ utterance: 'what is the capital of France', group: 'off topic', expect: 'That is not what this assistant is for.' },
	{ utterance: 'write me a poem', group: 'off topic', expect: 'That is not what this assistant is for.' },
	{ utterance: 'what is the weather', group: 'off topic', expect: 'That is not what this assistant is for.' }
];
