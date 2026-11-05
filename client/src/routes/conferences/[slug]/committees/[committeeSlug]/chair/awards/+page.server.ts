import { fail, redirect } from '@sveltejs/kit';
import {
	CHAIR_AWARD_REFUSALS,
	awardFormErrors,
	chairDuplicateRefusal,
	checkAwardForm,
	readAwardForm,
	type AwardFormErrors,
	type AwardFormProblem,
	type AwardFormValues
} from '$lib/award-form';
import { canEditAward, canWithdrawAward, isAwardsPublished } from '$lib/awards';
import { countNotesBySeat } from '$lib/chair-notes';
import type { Flash } from '$lib/flash';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { chairAwardsUrl } from '$lib/urls';
import {
	askHasPermission,
	requireCommitteePermission,
	requireCommitteeTool
} from '$lib/server/access';
import { deleteAward, proposeAward, updateAwardProposal } from '$lib/server/award-changes';
import { listAwardSeats, listCommitteeAwards, readAwardsPublishedAt } from '$lib/server/awards';
import { listChairNotes } from '$lib/server/chair-notes';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * It adds the committee's awards, the seats that have a delegate, how many
 * chair notes each seat has (counted from the same notes the Notes page
 * lists, so the two numbers agree), and when the conference publishes its
 * awards. `?edit=<id>` names a proposal to reword in the form at the top.
 */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { conference, committee, readerId, committeeTools } = await parent();
	// The console opened for `run_room`; this page asks its own permission too.
	requireCommitteeTool(committeeTools, 'mayProposeAwards');

	const [awards, seats, notes, awardsPublishedAt, canManage] = await Promise.all([
		listCommitteeAwards(locals.supabase, committee.id),
		listAwardSeats(locals.supabase, [committee.id]),
		listChairNotes(locals.supabase, committee.id),
		readAwardsPublishedAt(locals.supabase, conference.id),
		// Whoever confirms awards may withdraw anybody's proposal, a chair only their own.
		askHasPermission(locals.supabase, conference.id, 'confirm_awards')
	]);

	const isPublished = isAwardsPublished(awardsPublishedAt);

	// An id that is not one of the reader's own open proposals opens an empty
	// form, so a stale "Edit" link shows the page rather than an error.
	const editId = url.searchParams.get('edit');
	const awardBeingEdited =
		awards.find((award) => award.id === editId && canEditAward(award, readerId, isPublished)) ??
		null;

	return {
		awards,
		filledSeats: seats.filter((seat) => seat.isFilled),
		noteCounts: countNotesBySeat(notes),
		awardsPublishedAt,
		canManage,
		awardBeingEdited
	};
};

/**
 * What a refused form sends back: the message as a toast, and for a refused
 * proposal what was chosen and typed, with a message under the field it is about.
 */
type AwardsPageResult = {
	flash: Flash;
	values: AwardFormValues | null;
	errors: AwardFormErrors;
};

/** Refuse, staying on the page. The root layout shows `flash` as a toast. */
function refuse(
	message: string,
	values: AwardFormValues | null = null,
	problem: AwardFormProblem | 'duplicate' | null = null
) {
	return fail(400, {
		flash: { tone: 'error', message },
		values,
		errors: problem === null ? {} : awardFormErrors(problem, message)
	} satisfies AwardsPageResult);
}

/**
 * The chair gate, asked again at the top of every action (an action is its
 * own request, so nothing `load` worked out reaches it), then the committee's
 * seats and whether the awards are already published.
 */
async function openAwards(event: RequestEvent) {
	const { user, conference, committee } = await requireCommitteePermission(
		event.locals,
		event.url,
		event.params.slug,
		event.params.committeeSlug,
		'propose_awards'
	);
	const [seats, awardsPublishedAt] = await Promise.all([
		listAwardSeats(event.locals.supabase, [committee.id]),
		readAwardsPublishedAt(event.locals.supabase, conference.id)
	]);

	return {
		user,
		conference,
		committee,
		seats,
		isPublished: isAwardsPublished(awardsPublishedAt)
	};
}

/** Back to the page with a message saying what happened. */
function finish(event: RequestEvent, message: string): never {
	// A redirect cannot carry a message, so it travels in a cookie.
	setFlash(event.cookies, { tone: 'success', message });
	redirect(303, chairAwardsUrl(event.params.slug, event.params.committeeSlug));
}

export const actions: Actions = {
	propose: async (event) => {
		const { committee, seats, isPublished } = await openAwards(event);
		const formData = await event.request.formData();
		const values = readAwardForm(formData);
		// The browser already chose an id for the award it is showing at once
		// (T141); saving it under that id keeps the shown row and the saved one
		// the same row. `readNewRowId` reads `$lib/new-row-id.ts`'s hidden field.
		const newAwardId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));

		if (isPublished) return refuse(CHAIR_AWARD_REFUSALS.published, values);

		const checked = checkAwardForm(values, seats);

		if ('problem' in checked) {
			return refuse(CHAIR_AWARD_REFUSALS[checked.problem], values, checked.problem);
		}

		const { result } = await proposeAward(
			event.locals.supabase,
			committee.id,
			checked.award,
			newAwardId
		);

		if (result === 'duplicate') {
			return refuse(chairDuplicateRefusal(checked.award.seatName), values, 'duplicate');
		}

		finish(event, 'Award proposed.');
	},

	update: async (event) => {
		const { user, committee, seats, isPublished } = await openAwards(event);
		const formData = await event.request.formData();
		const awardId = String(formData.get('awardId') ?? '');
		const values = readAwardForm(formData);

		if (isPublished) return refuse(CHAIR_AWARD_REFUSALS.published, values);

		const awards = await listCommitteeAwards(event.locals.supabase, committee.id);
		const award = awards.find((each) => each.id === awardId);

		if (!award || !canEditAward(award, user.id, isPublished)) {
			return refuse(CHAIR_AWARD_REFUSALS.notYours);
		}

		const checked = checkAwardForm(values, seats);

		if ('problem' in checked) {
			return refuse(CHAIR_AWARD_REFUSALS[checked.problem], values, checked.problem);
		}

		const result = await updateAwardProposal(event.locals.supabase, award.id, checked.award);

		if (result === 'duplicate') {
			return refuse(chairDuplicateRefusal(checked.award.seatName), values, 'duplicate');
		}

		finish(event, 'Proposal saved.');
	},

	withdraw: async (event) => {
		const { user, conference, committee, isPublished } = await openAwards(event);
		const formData = await event.request.formData();
		const awardId = String(formData.get('awardId') ?? '');

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') return refuse(CHAIR_AWARD_REFUSALS.confirm);
		if (isPublished) return refuse(CHAIR_AWARD_REFUSALS.published);

		const [awards, canManage] = await Promise.all([
			listCommitteeAwards(event.locals.supabase, committee.id),
			askHasPermission(event.locals.supabase, conference.id, 'confirm_awards')
		]);
		const award = awards.find((each) => each.id === awardId);

		if (!award || !canWithdrawAward(award, user.id, canManage, isPublished)) {
			return refuse(CHAIR_AWARD_REFUSALS.notYours);
		}

		const isDeleted = await deleteAward(event.locals.supabase, committee.id, award.id);

		if (!isDeleted) return refuse(CHAIR_AWARD_REFUSALS.notYours);

		finish(event, 'Proposal withdrawn.');
	}
};
