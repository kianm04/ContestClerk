import { error, fail, redirect } from '@sveltejs/kit';
import {
	EMPTY_COMMITTEE_FORM,
	cleanTopics,
	committeeSlugFromName,
	hasCommitteeErrors,
	readCommitteeForm,
	validateCommitteeForm,
	withExtraTopic,
	withoutTopicAt,
	type CommitteeFormErrors,
	type CommitteeFormValues
} from '$lib/committee-details';
import { hasPermission } from '$lib/permissions';
import { manageCommitteeUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	createCommittee,
	listCommitteeSlugs,
	listCommitteesForManage
} from '$lib/server/manage-committees';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad } from './$types';

/**
 * What every action on this page answers with, so the page has one shape to
 * read whichever button was pressed.
 *
 * `values` may be null for an action that has nothing typed to send back; on
 * this page every action reads the form first, so it never is.
 */
type CommitteeFormResult = {
	values: CommitteeFormValues | null;
	errors: CommitteeFormErrors;
	message: string | null;
};

/**
 * The empty form the page starts from.
 *
 * Nothing is read from the database here. The conference itself comes from
 * `+layout.server.ts` two folders up, which hands the page `data.conference`
 * and the reader's permissions, so this `load` neither reads the conference
 * again nor asks the database whether the reader may be here. The level
 * choices are not here either:
 * `CommitteeForm` reads them straight out of `$lib/committee-details.ts`, so
 * sending them as well would be data nothing on the page asks for.
 */
export const load: PageServerLoad = async ({ parent }) => {
	// The layout let in anybody whose permissions open some page of the area;
	// this answers a 404 unless they open the committees.
	const { permissions } = await parent();
	requireManagePage(permissions, 'committees');

	// Adding a committee is a conference-wide editor's. Somebody who edits only
	// their own committees opens the list, and gets a 404 here.
	if (!hasPermission(permissions, 'manage_committees')) {
		error(404, 'This conference does not exist.');
	}

	return {
		values: EMPTY_COMMITTEE_FORM
	};
};

/**
 * Which topic row a "Remove" button meant, or `null` when the address does not
 * say a usable one.
 *
 * The row travels in the action's own query string (`?/removeTopic&index=2`)
 * rather than in a hidden field, the way `../../details/+page.server.ts` sends
 * `?/removeImage&kind=banner`: the button sits inside the page's one big form,
 * and a second `<form>` around it would be a form inside a form, which HTML
 * does not allow.
 */
function readTopicIndex(url: URL): number | null {
	const rawIndex = url.searchParams.get('index');

	if (rawIndex === null || rawIndex.trim() === '') {
		return null;
	}

	const index = Number(rawIndex);

	if (!Number.isInteger(index)) {
		return null;
	}

	return index;
}

/**
 * The answer both topic buttons give: the form exactly as it was typed, with a
 * different list of topics and nothing saved.
 */
function topicsResult(values: CommitteeFormValues, topics: string[]): CommitteeFormResult {
	return {
		values: { ...values, topics },
		errors: {},
		message: null
	};
}

export const actions: Actions = {
	/** Create the committee, then open its own editor so seats can be added. */
	save: async ({ params, url, request, cookies, locals }) => {
		// A form action is its own request, and nothing `load` worked out reaches
		// it, so the organiser check is made here rather than trusted from
		// whenever the page was last drawn. Only a conference-wide
		// `manage_committees` holder adds one, and the two below ask the same.
		const { conference } = await requirePermission(locals, url, params.slug, 'manage_committees');

		const formData = await request.formData();
		const values = readCommitteeForm(formData);

		// The link is made from the name when the organiser left it empty, which
		// is what the help line under the field promises. It is written back into
		// `values` so that a form refused for some other field shows the link it
		// would have been given.
		if (values.slug === '') {
			values.slug = committeeSlugFromName(values.name);
		}

		const takenSlugs = await listCommitteeSlugs(locals.supabase, conference.id);

		const errors = validateCommitteeForm(values, {
			isConferencePublished: conference.status === 'published',
			takenSlugs
		});

		if (hasCommitteeErrors(errors)) {
			/*
				400, because what arrived is wrong and only the person who sent it can
				put it right. `fail` sends the page back with that status and this
				result as `form`, so every field keeps what was typed and shows its
				own message at once.
			*/
			return fail(400, { values, errors, message: null });
		}

		// Rows that were left blank are dropped, so an empty row the organiser
		// added and never filled in does not become a topic.
		const savedValues = { ...values, topics: cleanTopics(values.topics) };

		// The new committee goes on the end of the list, so its position is
		// however many the conference already has.
		const existingCommittees = await listCommitteesForManage(locals.supabase, conference.id);

		const newCommitteeId = await createCommittee(
			locals.supabase,
			conference.id,
			savedValues,
			existingCommittees.length
		);

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: 'Committee created. Now add its seats.' });
		redirect(303, manageCommitteeUrl(params.slug, newCommitteeId));
	},

	/**
	 * Give the organiser one more empty topic row.
	 *
	 * Nothing is saved and nothing redirects: the page is simply drawn again
	 * from what comes back here, which is how the editor works without
	 * JavaScript.
	 */
	addTopic: async ({ params, url, request, locals }) => {
		// Checked again for the reason given on `save` above.
		await requirePermission(locals, url, params.slug, 'manage_committees');

		const formData = await request.formData();
		const values = readCommitteeForm(formData);

		return topicsResult(values, withExtraTopic(values.topics));
	},

	/** Take one topic row away again, leaving everything else as it was typed. */
	removeTopic: async ({ params, url, request, locals }) => {
		// Checked again for the reason given on `save` above.
		await requirePermission(locals, url, params.slug, 'manage_committees');

		const formData = await request.formData();
		const values = readCommitteeForm(formData);
		const index = readTopicIndex(url);

		// An address that names no usable row leaves the list exactly as it was,
		// because guessing which topic to throw away would be worse.
		if (index === null) {
			return topicsResult(values, values.topics);
		}

		return topicsResult(values, withoutTopicAt(values.topics, index));
	}
};
