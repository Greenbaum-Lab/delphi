const ACTION_GUIDE = [
	'Actions, and when each applies:',
	'select_gene - the request names a gene symbol, such as HBB or BRCA2',
	'navigate - the request gives chromosome coordinates, with or without a verb',
	'select_statistic - the request asks for a different statistic: heterozygosity, fst, tajimasd, fulif',
	'add_population - the request names a population to show alongside the ones already shown',
	'replace_population - the request names a population and asks for that one alone',
	'select_sort - the request asks to reorder or rank the tracks by a field and a direction',
	'answer_state - the request is a question about what is displayed now, and changes nothing',
	'clarify - the request is not about this genome browser, or names nothing to act on'
].join('\n');

const DISTINCTIONS = [
	'Telling them apart:',
	'A gene symbol is short, capitalised letters and digits. A population is a people, a country or a place. Both are just a name, so decide from which kind of thing it is.',
	'Adding is the default for a population. Choose replace_population only when the request says only, just, instead, or otherwise asks for the rest to go.',
	'A request that asks what something is right now is answer_state. A request that asks for something to become different is a change. Naming a statistic in a question does not make it select_statistic.',
	'Small talk, a greeting, a thank you, or anything not about this browser is clarify. Do not reach for an action when the request names nothing to act on.'
].join('\n');

const EXAMPLES = [
	'Examples:',
	'open the HBB locus -> {"action":"select_gene","gene_name":"HBB"}',
	'chr9:20000000-21000000 -> {"action":"navigate","chr":"chr9","start":20000000,"end":21000000}',
	'I want to see fulif -> {"action":"select_statistic","measure":"fulif"}',
	'include Sardinian -> {"action":"add_population","population_label":"Sardinian"}',
	'only Papuan, nothing else -> {"action":"replace_population","population_label":"Papuan"}',
	'order by Precipitation_index descending -> {"action":"select_sort","sort_field":"Precipitation_index","sort_direction":"desc"}',
	'which chromosome is this -> {"action":"answer_state","field":"chr"}',
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
 * The action guide, the distinctions and the examples exist because the
 * grammar constrains the shape of the output and nothing else. A model shown
 * eight action names and told nothing about them takes whichever branch needs
 * no understanding, which is how the first run returned clarify for seven of
 * eight requests and the second reached for an action on every one. All three
 * sections cost prefill only, and measured latency leaves room.
 *
 * The distinctions address the three confusions the development set exposed as
 * kinds rather than as items: a population read as a gene, a question about a
 * field read as a request to change it, and clarify never chosen. They are
 * stated as rules about the categories, not as the failing phrasings.
 *
 * The copy-exactly line is deliberate: resolution is exact match (D-026), so a
 * model that tidies a name turns a resolvable request into a clarify.
 *
 * The serialized state is no longer passed on the shipping path; see route().
 * The parameter is kept so diagnose.js can still reproduce the comparison that
 * settled it.
 */
export const buildMessages = (serialized_state, utterance) => [
	{ role: 'system', content: SYSTEM_PROMPT },
	{ role: 'user', content: serialized_state === '' ? `USER_REQUEST: ${utterance}` : `${serialized_state}\nUSER_REQUEST: ${utterance}` }
];
