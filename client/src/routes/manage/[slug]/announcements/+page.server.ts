import { error, fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	announcementFormValues,
	audienceChoiceLabel,
	hasAnnouncementErrors,
	newAnnouncementForm,
	readAnnouncementForm,
	readAudienceFromUrl,
	toAnnouncementInput,
	toAudienceInput,
	validateAnnouncementForm,
	validateAudienceChoice,
	type AnnouncementFormErrors,
	type AnnouncementFormValues,
	type AudienceChoice,
	type AudienceCount
} from '$lib/announcement-form';
import { publishedMessage, type Announcement, type AnnouncementGroup } from '$lib/announcements';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { hasPermission, type MyPermissions } from '$lib/permissions';
import {
	audienceChoiceForReader,
	committeesPermitting,
	mayChangeAnnouncement
} from '$lib/programme-access';
import { manageAnnouncementsUrl } from '$lib/urls';
import { requireManagePage, requirePermissionSomewhere, requireUser } from '$lib/server/access';
import {
	countAudience,
	createAnnouncement,
	deleteAnnouncement,
	getAnnouncement,
	listAcceptedDelegations,
	listAnnouncementCommittees,
	listAnnouncementsForOrganiser,
	setAnnouncementPinned,
	updateAnnouncement
} from '$lib/server/announcements';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What every action on this page answers with when it does not redirect.
 *
 * "Preview recipients" answers with this too, as a success rather than a
 * refusal, so the form comes back exactly as it was with the count beside it.
 */
type AnnouncementsPageResult = {
	/** What was typed into the form, or null when the answer was not about it. */
	values: AnnouncementFormValues | null;
	errors: AnnouncementFormErrors;
	/** Who the chosen audience is, or null when it could not be counted. */
	audienceCount: AudienceCount | null;
	/** A problem with the whole page rather than one field, shown in a `Notice`. */
	message: string | null;
};

/** What every "that announcement is not here" refusal says. */
const NO_SUCH_ANNOUNCEMENT = 'That announcement is not part of this conference.';

/** What the reader may address an announcement to. */
type AudienceLists = {
	/** Everyone, the delegates and the staff, which need `send_announcements` conference-wide. */
	mayAddressConference: boolean;
	/** The committees the reader may address: all of them, or their own. */
	committees: AnnouncementGroup[];
	/** The accepted delegations, offered only to a conference-wide announcer. */
	delegations: AnnouncementGroup[];
};

/**
 * The gate, asked again at the top of every action: `send_announcements`,
 * conference-wide or in some committee. It also answers what the reader
 * holds, because which audiences they may address depends on it.
 *
 * A form action is its own request and nothing `load` worked out reaches it, so
 * the check is made here rather than trusted from whenever the page was drawn.
 */
async function requireConference(event: RequestEvent) {
	return requirePermissionSomewhere(
		event.locals,
		event.url,
		event.params.slug,
		'send_announcements'
	);
}

/**
 * A 404 unless the reader may change this announcement: a conference-wide
 * announcer may change any, and an author their own while they may still
 * address its audience. Only a request put together by hand reaches here for
 * somebody else's, because the page draws no menu for it.
 */
function requireChangeable(
	announcement: Announcement,
	permissions: MyPermissions,
	userId: string
): void {
	if (!mayChangeAnnouncement(permissions, announcement, userId)) {
		error(404, NO_SUCH_ANNOUNCEMENT);
	}
}

/** Refuse with a message about the whole page, leaving the form as the page draws it. */
function refuse(message: string) {
	return fail(400, {
		values: null,
		errors: {},
		audienceCount: null,
		message
	} satisfies AnnouncementsPageResult);
}

/**
 * Refuse a form that was filled in wrongly. `fail` sends the page back with
 * this result as `form`, so every field keeps what was typed and shows its
 * message.
 */
function refuseForm(
	values: AnnouncementFormValues,
	errors: AnnouncementFormErrors,
	audienceCount: AudienceCount | null
) {
	return fail(400, {
		values,
		errors,
		audienceCount,
		message: null
	} satisfies AnnouncementsPageResult);
}

/**
 * Read the committees and the accepted delegations at once, neither needs the
 * other, and keep the ones the reader may address.
 */
async function readAudienceLists(
	supabase: SupabaseClient,
	conferenceId: string,
	permissions: MyPermissions
): Promise<AudienceLists> {
	const mayAddressConference = hasPermission(permissions, 'send_announcements');
	const [committees, delegations] = await Promise.all([
		listAnnouncementCommittees(supabase, conferenceId),
		mayAddressConference ? listAcceptedDelegations(supabase, conferenceId) : []
	]);

	return {
		mayAddressConference,
		committees: committeesPermitting(permissions, committees, 'send_announcements'),
		delegations
	};
}

/**
 * Whether the choice is one this page offers the reader: a committee or
 * delegation from its lists, or everyone, the delegates or the staff for a
 * conference-wide announcer.
 */
function namesOfferedGroup(choice: AudienceChoice, lists: AudienceLists): boolean {
	if (choice.audience === 'committee') {
		return lists.committees.some((committee) => committee.id === choice.committeeId);
	}

	if (choice.audience === 'delegation') {
		return lists.delegations.some((delegation) => delegation.id === choice.delegationId);
	}

	return lists.mayAddressConference;
}

/**
 * How many people an announcement to `choice` would notify, or null when the
 * choice is not complete enough to count: a committee or delegation not picked
 * yet, or not one of this conference's.
 */
async function countChoice(
	supabase: SupabaseClient,
	conferenceId: string,
	choice: AudienceChoice,
	lists: AudienceLists,
	authorId: string
): Promise<AudienceCount | null> {
	const isComplete = !hasAnnouncementErrors(validateAudienceChoice(choice));

	if (!isComplete || !namesOfferedGroup(choice, lists)) {
		return null;
	}

	const audience = toAudienceInput(choice);
	const recipientCount = await countAudience(supabase, conferenceId, audience, authorId);
	const audienceLabel = audienceChoiceLabel(audience, lists.committees, lists.delegations);

	return { recipientCount, audienceLabel };
}

/**
 * The same questions every form action starts with: may this reader announce,
 * and what can they address an announcement to.
 */
async function startAction(event: RequestEvent) {
	const { user, conference, permissions } = await requireConference(event);
	const lists = await readAudienceLists(event.locals.supabase, conference.id, permissions);

	return { user, conference, lists };
}

/**
 * An audience the page does not offer, such as a committee from another
 * conference or, for a chair, everyone, can only come from a request put
 * together by hand, so it gets the 404 the spec asks for rather than a
 * message under the field.
 */
function requireOfferedGroup(choice: AudienceChoice, lists: AudienceLists): void {
	if (!namesOfferedGroup(choice, lists)) {
		error(404, 'That committee or delegation is not part of this conference.');
	}
}

/**
 * Everything the page draws, on top of what the layout above it has already read.
 *
 * `parent()` is a promise for what the layout's own `load` returned. The layout
 * let in anybody whose permissions open some page of this conference, and
 * handed those permissions down; the first lines below answer a 404 unless they
 * open this one.
 *
 * The form is read from the address: `?edit=<id>` opens an announcement, and
 * `?audience=&committee=&delegation=` starts a new one addressed to that
 * audience and counts it. `load` runs again whenever the address changes.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'announcements');
	const user = await requireUser(locals, url);

	const [announcements, lists] = await Promise.all([
		listAnnouncementsForOrganiser(locals.supabase, conference.id),
		readAudienceLists(locals.supabase, conference.id, permissions)
	]);

	// The announcements the reader may only read, such as a chair seeing what
	// the secretariat sent to everyone: their rows offer no Edit, Pin or Delete.
	// Listed this way round, a row the page adds before the server answers is
	// the reader's own and keeps its menu.
	const readOnlyIds = announcements
		.filter((announcement) => !mayChangeAnnouncement(permissions, announcement, user.id))
		.map((announcement) => announcement.id);

	// An id that is not one of the announcements the reader may change opens
	// an empty form, so a stale "Edit" link shows the page rather than an error.
	const editId = url.searchParams.get('edit');
	const announcementBeingEdited = announcements.find(
		(announcement) => announcement.id === editId && !readOnlyIds.includes(announcement.id)
	);

	// An edit keeps the audience it was published with, so it has nothing to count.
	let formValues: AnnouncementFormValues;
	let audienceCount: AudienceCount | null = null;

	if (announcementBeingEdited) {
		formValues = announcementFormValues(announcementBeingEdited);
	} else {
		const choice = audienceChoiceForReader(readAudienceFromUrl(url.searchParams), permissions);
		formValues = newAnnouncementForm(choice);
		audienceCount = await countChoice(locals.supabase, conference.id, formValues, lists, user.id);
	}

	return {
		announcements,
		readOnlyIds,
		mayAddressConference: lists.mayAddressConference,
		committees: lists.committees,
		delegations: lists.delegations,
		formValues,
		audienceCount,
		/** One moment for every "3 hours ago" on the page, so they all agree. */
		now: new Date().toISOString()
	};
};

export const actions: Actions = {
	/**
	 * "Preview recipients": count the chosen audience without saving anything.
	 *
	 * It answers with the whole form, so what was typed is kept, which a
	 * redirect to `?audience=…` could not do for a long body.
	 */
	preview: async (event) => {
		const { user, conference, lists } = await startAction(event);
		const values = readAnnouncementForm(await event.request.formData());
		const errors = validateAudienceChoice(values);

		if (hasAnnouncementErrors(errors)) {
			return refuseForm(values, errors, null);
		}

		requireOfferedGroup(values, lists);

		const audienceCount = await countChoice(
			event.locals.supabase,
			conference.id,
			values,
			lists,
			user.id
		);

		return { values, errors: {}, audienceCount, message: null } satisfies AnnouncementsPageResult;
	},

	/** Publish a new announcement, which notifies its whole audience at once. */
	publish: async (event) => {
		const { user, conference, lists } = await startAction(event);
		const formData = await event.request.formData();
		const values = readAnnouncementForm(formData);
		const errors = validateAnnouncementForm(values, false);

		if (hasAnnouncementErrors(errors)) {
			const audienceCount = await countChoice(
				event.locals.supabase,
				conference.id,
				values,
				lists,
				user.id
			);

			return refuseForm(values, errors, audienceCount);
		}

		requireOfferedGroup(values, lists);

		const input = toAnnouncementInput(values);

		// The trigger that sends the notifications does not say how many it sent,
		// so the audience is counted just before, by the same database function.
		const recipientCount = await countAudience(
			event.locals.supabase,
			conference.id,
			input,
			user.id
		);

		// The id the browser already shows the new row under (T142), so the row
		// the organiser sees and the row the database saves are the same one.
		const newAnnouncementId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));

		await createAnnouncement(
			event.locals.supabase,
			conference.id,
			user.id,
			input,
			newAnnouncementId
		);

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(event.cookies, { tone: 'success', message: publishedMessage(recipientCount) });
		redirect(303, manageAnnouncementsUrl(event.params.slug));
	},

	/** Save what an announcement says. Its audience stays, and nobody is notified again. */
	update: async (event) => {
		const { user, conference, permissions } = await requireConference(event);
		const submitted = readAnnouncementForm(await event.request.formData());

		const existing = await getAnnouncement(
			event.locals.supabase,
			conference.id,
			submitted.announcementId
		);

		// One deleted in another tab gets a message; one that is not the reader's, a 404.
		if (!existing) {
			return refuse(NO_SUCH_ANNOUNCEMENT);
		}

		requireChangeable(existing, permissions, user.id);

		// The edit form sends no audience, so the saved one is put back for the
		// form to show again if something is refused.
		const savedValues = announcementFormValues(existing);
		const values = {
			...submitted,
			audience: savedValues.audience,
			committeeId: savedValues.committeeId,
			delegationId: savedValues.delegationId
		};
		const errors = validateAnnouncementForm(values, true);

		if (hasAnnouncementErrors(errors)) {
			return refuseForm(values, errors, null);
		}

		await updateAnnouncement(event.locals.supabase, existing.id, {
			title: values.title,
			body: values.body,
			isPinned: values.isPinned
		});

		setFlash(event.cookies, {
			tone: 'success',
			message: 'Announcement updated. No new notification was sent.'
		});
		redirect(303, manageAnnouncementsUrl(event.params.slug));
	},

	/**
	 * Pin an announcement, or unpin it.
	 *
	 * The announcement travels in the action's own address,
	 * `?/togglePin&announcementId=…`, because the row's menu is one small form
	 * shared by every line in it and so cannot carry a field for each.
	 */
	togglePin: async (event) => {
		const { user, conference, permissions } = await requireConference(event);
		const announcementId = event.url.searchParams.get('announcementId') ?? '';

		const existing = await getAnnouncement(event.locals.supabase, conference.id, announcementId);

		if (!existing) {
			return refuse(NO_SUCH_ANNOUNCEMENT);
		}

		requireChangeable(existing, permissions, user.id);

		const isPinned = !existing.isPinned;

		await setAnnouncementPinned(event.locals.supabase, existing.id, isPinned);

		setFlash(event.cookies, { tone: 'success', message: isPinned ? 'Pinned.' : 'Unpinned.' });
		redirect(303, manageAnnouncementsUrl(event.params.slug));
	},

	/** Delete an announcement, once `ConfirmButton` has asked. Its notifications stay. */
	delete: async (event) => {
		const { user, conference, permissions } = await requireConference(event);

		const formData = await event.request.formData();
		const announcementId = String(formData.get('announcementId') ?? '');

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') {
			return refuse('Please confirm before deleting an announcement.');
		}

		const existing = await getAnnouncement(event.locals.supabase, conference.id, announcementId);

		if (!existing) {
			return refuse(NO_SUCH_ANNOUNCEMENT);
		}

		requireChangeable(existing, permissions, user.id);

		await deleteAnnouncement(event.locals.supabase, existing.id);

		setFlash(event.cookies, {
			tone: 'success',
			message: 'Announcement deleted. Notifications already sent will say it was removed.'
		});
		redirect(303, manageAnnouncementsUrl(event.params.slug));
	}
};
