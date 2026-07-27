const ACTION_GUIDE = [
	'Actions, and when each applies:',
	'gene - the request names a gene symbol, such as HBB or BRCA2',
	'region - the request gives chromosome coordinates, with or without a verb',
	'statistic - the request asks for a different statistic: heterozygosity, fst, tajimasd, fulif',
	'add_population - the request names a population to show alongside the ones already shown',
	'replace_population - the request names a population and asks for that one alone',
	'sort - the request asks to reorder or rank the tracks by a field and a direction',
	'question - the request asks about the browser itself: its region, statistic, mode, zoom, window, sort or populations',
	'clarify - anything else'
].join('\n');

const DISTINCTIONS = [
	'Telling them apart:',
	'A gene symbol is short, capitalised letters and digits. A population is a people, a country or a place. Both are just a name, so decide from which kind of thing it is.',
	'Adding is the default for a population. Choose replace_population only when the request says only, just, instead, nothing but, or otherwise asks for the rest to go.',
	'question is only for what this browser is showing. A question about the world, about you, or about anything outside this browser is clarify, however it is phrased.',
	'clarify is the answer for small talk, greetings, thanks, requests to write or explain something, and anything this browser does not do. Do not reach for an action when the request names nothing in the browser to act on.'
].join('\n');

const EXAMPLES = [
	'Examples:',
	'open the HBB locus -> {"action":"gene","gene_name":"HBB"}',
	'chr9:20000000-21000000 -> {"action":"region","chr":"chr9","start":20000000,"end":21000000}',
	'I want to see fulif -> {"action":"statistic","measure":"fulif"}',
	'include Sardinian -> {"action":"add_population","population_label":"Sardinian"}',
	'only Papuan, nothing else -> {"action":"replace_population","population_label":"Papuan"}',
	'order by Precipitation_index descending -> {"action":"sort","sort_field":"Precipitation_index","sort_direction":"desc"}',
	'which chromosome is this -> {"action":"question","field":"chr"}',
	'what is the capital of France -> {"action":"clarify"}',
	'tell me a joke -> {"action":"clarify"}'
].join('\n');

const SYSTEM_PROMPT = [
	'You operate a genome browser. Reply with one JSON object and nothing else.',
	ACTION_GUIDE,
	DISTINCTIONS,
	EXAMPLES,
	'A gene or population name comes only from the words after USER_REQUEST, copied letter for letter. Never take a name from anywhere else. If the request names nothing, use clarify rather than borrowing a name.'
].join('\n\n');

/**
 * Builds the two messages for one turn.
 *
 * Measured state, and the standing warning about editing this file: three
 * separate rewrites have moved which categories fail without moving how many.
 * Clarify bias, then action bias, then this. Current unburned measurement is
 * 0.63 overall with gene and question at 0.17; see assistant/MEASUREMENTS.md.
 * All three utterance sets are burned, so a fourth rewording cannot be
 * evaluated until a new set exists, and the honest next move is a design change
 * or a scope cut rather than more wording.
 *
 * The action names share no leading token. The theory was that select_gene,
 * select_statistic and select_sort put the whole decision on the token after
 * select_. The controlled comparison refuted it: gene scored 0.20 both before
 * and after the rename. The naming is kept because reverting is another
 * untested change, not because it was shown to help.
 *
 * The guide, the distinctions and the examples exist because the grammar
 * constrains the shape of the output and nothing else. A model shown eight
 * action names and told nothing about them takes whichever branch needs no
 * understanding: the first run returned clarify for seven of eight requests,
 * and the second reached for an action on every one. All three sections cost
 * prefill only, and measured latency leaves room.
 *
 * The question rule is scoped to what this browser shows. Stated as any
 * question about what something is now, it swallowed what time is it and who
 * won the world cup, which are clarify. Scoping it fixed those and coincided
 * with question itself falling from 1.00 to 0.40, in the same change as the
 * rename, so the two are confounded.
 *
 * The copy-exactly line is deliberate: resolution is exact match (D-026), so a
 * model that tidies a name turns a resolvable request into a clarify.
 *
 * The serialized state is no longer passed on the shipping path; see route().
 * The parameter is kept so diagnose.js can reproduce the comparison that
 * settled it.
 */
export const buildMessages = (serialized_state, utterance) => [
	{ role: 'system', content: SYSTEM_PROMPT },
	{ role: 'user', content: serialized_state === '' ? `USER_REQUEST: ${utterance}` : `${serialized_state}\nUSER_REQUEST: ${utterance}` }
];
