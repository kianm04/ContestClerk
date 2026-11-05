import { fail } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/server/markdown';
import { SAMPLE_MARKDOWN } from '$lib/styleguide-samples';
import type { Actions, PageServerLoad } from './$types';

/**
 * The names of the fields in the sample form, and the message each one shows
 * when the form below is submitted.
 *
 * They are written out here rather than worked out from the submission because
 * the point is to show the error state, not to check anything: pressing the
 * button always fails, so a teammate can see every field with a message under
 * it. Nothing is saved and nothing is read.
 */
const SAMPLE_ERRORS = {
	fullName: 'Enter your full name.',
	email: 'That does not look like an email address.',
	committee: 'Choose a committee.',
	country: 'Choose a country.',
	seats: 'Ask for at least one seat.',
	deadline: 'The deadline cannot be in the past.',
	about: 'Tell us a little about yourself.',
	experience: 'Choose how much experience you have.',
	positionPaper: 'That file is bigger than 5 MB.'
};

/** What one submission of the sample form gives back. Every field is wrong on purpose. */
export type SampleErrors = typeof SAMPLE_ERRORS;

/**
 * The Markdown editor example and the HTML the server makes of it. Nothing else
 * on the page is loaded: the styleguide shows made-up data from
 * `$lib/styleguide-samples.ts`, so this page never touches the database.
 *
 * The sample Markdown form posts with `method="get"`, so what was typed comes
 * back as `?sampleMarkdown=` in the address. `load` re-runs whenever that
 * changes, and draws it the way every page that shows Markdown will, which is
 * how the round trip can be tried with JavaScript switched off.
 */
export const load: PageServerLoad = ({ url }) => {
	const sampleMarkdown = url.searchParams.get('sampleMarkdown') ?? SAMPLE_MARKDOWN;

	return { sampleMarkdown, sampleMarkdownHtml: renderMarkdown(sampleMarkdown) };
};

/**
 * `default` is the action a `<form method="post">` with no `action` attribute
 * posts to. `fail` re-renders the page with a 400 status and hands what it is
 * given to the page as `form`, which is how a SvelteKit form shows what went
 * wrong without any JavaScript.
 */
export const actions: Actions = {
	default: async () => {
		return fail(400, { errors: SAMPLE_ERRORS });
	}
};
