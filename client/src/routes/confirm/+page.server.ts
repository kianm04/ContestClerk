import { fail } from '@sveltejs/kit';
import { carriedFields, readConfirmationQuestion } from '$lib/confirmation';
import type { Actions } from './$types';

/**
 * `/confirm` is where a `ConfirmButton` sends its first press when JavaScript
 * is off (see `$lib/confirmation.ts`). It changes nothing itself: the action
 * reads the question out of the address and the fields out of the form, and
 * the page shows them back with a button that posts them on to the real action.
 *
 * It needs no sign in. It only repeats what the visitor's own browser sent, and
 * the action it forwards to does its own checks when the answer arrives.
 */
export const actions: Actions = {
	default: async ({ request, url }) => {
		const question = readConfirmationQuestion(url);

		if (!question) {
			return fail(400, { question: null, fields: [] });
		}

		const fields = carriedFields(await request.formData());

		return { question, fields };
	}
};
