export const GREETING = 'Tell me where to look. Try a gene name, chr2:136500000-136600000, a population, or zoom out.';

export const NOT_UNDERSTOOD = 'Sorry, did not understand that.';

export const CANNOT_ANALYSE = 'I can move you around the genome, but I cannot analyse data.';

export const PRIVACY_NOTICE = 'What you type here is sent to a third-party AI provider unless the browser can read it on its own. Your coordinates and population selection go with it; your data, files and results never do. The provider is asked not to retain it, your address is removed at the proxy, and the text itself is not stored.';

export const SERVICE_UNAVAILABLE = 'The assistant service is not answering. Typed coordinates, gene names, population names and zoom commands still work.';

export const APPLIED = 'Done.';

export const CANCELLED = 'Cancelled.';

const formatCandidates = candidates => candidates.map((candidate, index) => `${index + 1}) ${candidate}`).join('  ');

export const candidateQuestion = (message, candidates) => `${message} Did you mean:  ${formatCandidates(candidates)}`;

export const applyFailed = detail => `I tried, but the view did not change: ${detail}.`;

export const invalidPatch = errors => `I cannot do that: ${errors.join('; ')}.`;
