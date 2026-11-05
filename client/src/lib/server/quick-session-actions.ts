/**
 * The draft actions both quick session pages share (`05-pages/chair/quick-session.md`,
 * "Draft actions"): the ready-made lists, "+", '+ Add "…" as a member', "×",
 * "Clear all", "Add these" and the search.
 *
 * Files under `$lib/server` only ever run on the server. With JavaScript the
 * page changes its draft in the browser and never posts to these. Without it
 * every button of the page posts the whole form here, and each action answers
 * with the changed draft (`{ draft, errors }`), which the page draws again.
 * Nothing is saved. `/quick/new` and `/quick/[slug]/delegations` spread these
 * into their own `actions`, each with its own access rule, so the two pages
 * cannot drift apart.
 */

import { fail, type RequestEvent } from '@sveltejs/kit';
import {
	addCustomMember,
	addMember,
	addPastedNames,
	clearMembers,
	fillFromList,
	readQuickSessionDraft,
	removeMember,
	type DraftChange
} from '$lib/quick-session';

/** A form field as text, or '' when the form did not send it. */
function textField(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

/** The answer to a change: drawn again as it is, or refused with its message (a 400). */
function answer(change: DraftChange) {
	const isRefused = Object.keys(change.errors).length > 0;

	return isRefused ? fail(400, change) : change;
}

/**
 * The draft actions, each asking `checkAccess` first: an action is its own
 * request, so nothing `load` checked reaches it.
 */
export function quickSessionDraftActions<Event extends RequestEvent>(
	checkAccess: (event: Event) => Promise<unknown>
) {
	/** Check access, then read the posted form and the draft it holds. */
	async function readDraft(event: Event) {
		await checkAccess(event);

		const formData = await event.request.formData();

		return { formData, draft: readQuickSessionDraft(formData) };
	}

	return {
		/** "UN members", "Security Council", "EU members": `name="list"`. */
		fillFromList: async (event: Event) => {
			const { formData, draft } = await readDraft(event);

			return answer({ draft: fillFromList(draft, textField(formData, 'list')), errors: {} });
		},

		/** "+" beside a member state: `name="add"`, valued `country:FR`. */
		addMember: async (event: Event) => {
			const { formData, draft } = await readDraft(event);

			return answer({ draft: addMember(draft, textField(formData, 'add')), errors: {} });
		},

		/** '+ Add "{typed}" as a member', from the search box. */
		addCustom: async (event: Event) => {
			const { draft } = await readDraft(event);

			return answer(addCustomMember(draft));
		},

		/** "×" beside a member: `name="remove"`, valued as its hidden field. */
		removeMember: async (event: Event) => {
			const { formData, draft } = await readDraft(event);

			return answer({ draft: removeMember(draft, textField(formData, 'remove')), errors: {} });
		},

		/** "Clear all". */
		clearMembers: async (event: Event) => {
			const { draft } = await readDraft(event);

			return answer({ draft: clearMembers(draft), errors: {} });
		},

		/** "Add these", under "Paste a list": the field `names`. */
		paste: async (event: Event) => {
			const { formData, draft } = await readDraft(event);

			return answer(addPastedNames(draft, textField(formData, 'names')));
		},

		/** "Search": the draft as it is, whose `q` the page lists the member states by. */
		search: async (event: Event) => {
			const { draft } = await readDraft(event);

			return answer({ draft, errors: {} });
		}
	};
}
