import { reply } from '/assistant/messages.js';
import { defineTerm } from '/assistant/glossary.js';
import { STATE_FIELDS } from '/assistant/state_answers.js';

const CAPABILITY_REPLY = 'I drive this browser. Ask for a gene such as TP53, a region such as chr2:136545000-136594000, one of heterozygosity, fst, tajimasd or fulif, a population to add or to show on its own, a sort field and direction, or what the browser is currently showing.';

const IDENTITY_REPLY = 'I am the DELPHI assistant. I run on your machine and change what this browser shows. Anything outside the browser is not something I answer.';

const GREETING_REPLY = 'Hello. Tell me a gene, a region, a statistic, a population or a sort order, or ask what the browser is showing.';

const CANNED_REPLIES = [
	{ phrases: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'hi there', 'hello there'], text: GREETING_REPLY },
	{ phrases: ['thanks', 'thank you', 'thanks a lot', 'thanks very much', 'cheers', 'ta'], text: 'Any time.' },
	{ phrases: ['bye', 'goodbye', 'see you later', 'see you', 'cheers bye', 'later'], text: 'Goodbye.' },
	{ phrases: ['who are you', 'what are you', 'what is your name', 'what are you called', 'what model are you running'], text: IDENTITY_REPLY },
	{ phrases: ['help', 'what can you do', 'what do you do', 'what can i ask', 'how do i use this', 'what are my options'], text: CAPABILITY_REPLY }
];

/**
 * Patterns that name a term unambiguously. A match here is answered from the
 * glossary whatever the term is, because the user has said in so many words
 * that they want a definition.
 */
const EXPLICIT_DEFINITION_PATTERNS = [
	/^what does (.+?) mean$/,
	/^what does (.+?) measure$/,
	/^what is meant by (.+)$/,
	/^meaning of (.+)$/,
	/^define (.+)$/,
	/^definition of (.+)$/
];

/**
 * The bare form, which is riskier: what is the zoom level asks about this
 * browser's state, not for a definition. Terms that name a state field are
 * excluded so those keep reaching the model, and anything not in the glossary
 * falls through regardless.
 */
const BARE_DEFINITION_PATTERN = /^what is (?:a |an |the )?(.+)$/;

const normalise = utterance => utterance.trim().toLowerCase().replace(/[?!.,]+$/, '');

const cannedReply = normalised => {
	const match = CANNED_REPLIES.find(entry => entry.phrases.includes(normalised));
	return match ? match.text : null;
};

const explicitTerm = normalised => {
	const pattern = EXPLICIT_DEFINITION_PATTERNS.find(candidate => candidate.test(normalised));
	return pattern ? normalised.match(pattern)[1].trim() : null;
};

const bareTerm = normalised => {
	const match = normalised.match(BARE_DEFINITION_PATTERN);
	if (!match)
		return null;
	const term = match[1].trim();
	return STATE_FIELDS.includes(term) ? null : term;
};

/**
 * Answers the conversational part of the assistant, entirely in code.
 *
 * Returns a message, or null when this is not something to answer here, in
 * which case the caller goes on to the model. Nothing in this module generates
 * text: every reply is either written above or read from the glossary, so the
 * assistant can greet and define without being able to invent a fact about the
 * data (D-023, D-035).
 *
 * Running before the model also means a greeting costs nothing. On the slow
 * machine that is the difference between an instant reply and seven seconds.
 */
export const conversationalReply = async utterance => {
	if (typeof utterance !== 'string')
		return null;
	const normalised = normalise(utterance);
	const canned = cannedReply(normalised);
	if (canned)
		return reply(canned);
	const term = explicitTerm(normalised) || bareTerm(normalised);
	if (!term)
		return null;
	const entry = await defineTerm(term);
	return entry ? reply(`${entry.term}: ${entry.description}`) : null;
};
