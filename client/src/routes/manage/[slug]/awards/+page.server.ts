import { error, fail, redirect } from '@sveltejs/kit';
import {
	ORGANISER_AWARD_REFUSALS,
	awardFormErrors,
	checkAwardForm,
	checkAwardTitle,
	emptySeatPublishRefusal,
	readAwardForm,
	readPublishForm,
	readPublishMoment,
	type AwardFormErrors,
	type AwardFormProblem,
	type AwardFormValues,
	type PublishFormValues
} from '$lib/award-form';
import {
	canRenameAward,
	committeesWithoutConfirmedAwards,
	confirmedAwardOnEmptySeat,
	countAwards,
	findAward,
	isAwardsPublished
} from '$lib/awards';
import { formatDayAndTime } from '$lib/dates';
import type { Flash } from '$lib/flash';
import { manageAwardsUrl } from '$lib/urls';
import { requireManagePage, requirePermission, requireUser } from '$lib/server/access';
import {
	addConfirmedAward,
	deleteAward,
	publishAwards,
	renameAward,
	setAwardStatus,
	unpublishAwards
} from '$lib/server/award-changes';
import { listAwardSeats, listAwardsByCommittee, readAwardsPublishedAt } from '$lib/server/awards';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Runs on the server, after the `/manage/[slug]` layout has checked that the
 * reader organises this conference. `parent()` hands over what it returned.
 *
 * Every committee comes with its awards and the seats that have a delegate,
 * and the page says when the awards are published. `?edit=<id>` opens the
 * "Edit title" form on one row, which only a custom award the reader added
 * can have. `?add=<committee id>` opens that committee's "Add award" form,
 * which nothing opens once the awards are published.
 */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'awards');
	const user = await requireUser(locals, url);

	const [sections, awardsPublishedAt] = await Promise.all([
		listAwardsByCommittee(locals.supabase, conference.id),
		readAwardsPublishedAt(locals.supabase, conference.id)
	]);

	const isPublished = isAwardsPublished(awardsPublishedAt);
	const awardToRename = findAward(sections, url.searchParams.get('edit') ?? '');
	const canRename = awardToRename !== null && canRenameAward(awardToRename, user.id, isPublished);

	return {
		sections,
		awardsPublishedAt,
		counts: countAwards(sections),
		committeesWithoutAwards: committeesWithoutConfirmedAwards(sections),
		readerId: user.id,
		renamingAwardId: canRename ? awardToRename.id : null,
		addingCommitteeId: isPublished ? null : url.searchParams.get('add')
	};
};

/**
 * What a refused form sends back. The message is always a toast; the rest
 * puts what was typed back into the form it came from, with a message under
 * the field it was about.
 */
type AwardsPageResult = {
	flash: Flash;
	/** The committee whose "Add award" form was refused, or null. */
	committeeId: string | null;
	values: AwardFormValues | null;
	errors: AwardFormErrors;
	/** What the publish panel sent, when it was the one refused. */
	publish: PublishFormValues | null;
};

/** What a refusal carries besides its message. Anything left out is empty. */
type RefusalDetails = Partial<Omit<AwardsPageResult, 'flash'>>;

/** Refuse, staying on the page. The root layout shows `flash` as a toast. */
function refuse(message: string, details: RefusalDetails = {}) {
	return fail(400, {
		flash: { tone: 'error', message },
		committeeId: details.committeeId ?? null,
		values: details.values ?? null,
		errors: details.errors ?? {},
		publish: details.publish ?? null
	} satisfies AwardsPageResult);
}

/**
 * The `confirm_awards` gate, asked again at the top of every action (an action is its
 * own request, so nothing `load` worked out reaches it), then every committee
 * with its awards and whether the awards are already published.
 */
async function openAwards(event: RequestEvent) {
	const { user, conference } = await requirePermission(
		event.locals,
		event.url,
		event.params.slug,
		'confirm_awards'
	);
	const [sections, awardsPublishedAt] = await Promise.all([
		listAwardsByCommittee(event.locals.supabase, conference.id),
		readAwardsPublishedAt(event.locals.supabase, conference.id)
	]);

	return { user, conference, sections, isPublished: isAwardsPublished(awardsPublishedAt) };
}

/** Back to the page with a message saying what happened. */
function finish(event: RequestEvent, message: string): never {
	// A redirect cannot carry a message, so it travels in a cookie.
	setFlash(event.cookies, { tone: 'success', message });
	redirect(303, manageAwardsUrl(event.params.slug));
}

/** Confirm or unconfirm one award: the two buttons differ only in the status and the message. */
async function changeStatus(
	event: RequestEvent,
	status: 'confirmed' | 'proposed',
	message: string
) {
	const { sections, isPublished } = await openAwards(event);
	const formData = await event.request.formData();
	const award = findAward(sections, String(formData.get('awardId') ?? ''));

	if (isPublished) return refuse(ORGANISER_AWARD_REFUSALS.published);
	if (award === null) return refuse(ORGANISER_AWARD_REFUSALS.missing);

	// `freeze_award_user` would give an award on an empty seat to nobody.
	if (status === 'confirmed' && award.isSeatEmpty) {
		return refuse(ORGANISER_AWARD_REFUSALS.emptySeat);
	}

	const isChanged = await setAwardStatus(event.locals.supabase, award.id, status);

	if (!isChanged) return refuse(ORGANISER_AWARD_REFUSALS.missing);

	finish(event, message);
}

export const actions: Actions = {
	confirm: async (event) => changeStatus(event, 'confirmed', 'Confirmed.'),

	unconfirm: async (event) => changeStatus(event, 'proposed', 'Back to proposed.'),

	add: async (event) => {
		const { sections, isPublished } = await openAwards(event);
		const formData = await event.request.formData();
		const committeeId = String(formData.get('committeeId') ?? '');
		const values = readAwardForm(formData);
		const section = sections.find((each) => each.committee.id === committeeId);

		// The page only ever sends one of its own committees and their seats, so
		// anything else is a hand-made request for something that is not here.
		if (!section) error(404, 'That committee is not part of this conference.');

		const seats = await listAwardSeats(event.locals.supabase, [committeeId]);

		if (values.seatId !== '' && !seats.some((seat) => seat.id === values.seatId)) {
			error(404, 'That seat is not part of this committee.');
		}

		if (isPublished) return refuse(ORGANISER_AWARD_REFUSALS.published, { committeeId, values });

		const checked = checkAwardForm(values, seats);

		if ('problem' in checked) {
			return refuseAddForm(committeeId, values, checked.problem);
		}

		const result = await addConfirmedAward(event.locals.supabase, committeeId, checked.award);

		if (result === 'duplicate') return refuseAddForm(committeeId, values, 'duplicate');

		finish(event, 'Award added.');
	},

	updateTitle: async (event) => {
		const { user, sections, isPublished } = await openAwards(event);
		const formData = await event.request.formData();
		const award = findAward(sections, String(formData.get('awardId') ?? ''));
		const title = String(formData.get('title') ?? '');

		if (isPublished) return refuse(ORGANISER_AWARD_REFUSALS.published);
		if (award === null) return refuse(ORGANISER_AWARD_REFUSALS.missing);
		if (!canRenameAward(award, user.id, isPublished)) {
			return refuse(ORGANISER_AWARD_REFUSALS.notCustom);
		}

		const checked = checkAwardTitle(title);

		if ('problem' in checked) {
			const message = ORGANISER_AWARD_REFUSALS[checked.problem];
			const values = { seatId: award.seatId, kind: award.kind, title };

			return refuse(message, { values, errors: { title: message } });
		}

		await renameAward(event.locals.supabase, award, checked.title);

		finish(event, 'Title saved.');
	},

	delete: async (event) => {
		const { sections, isPublished } = await openAwards(event);
		const formData = await event.request.formData();
		const award = findAward(sections, String(formData.get('awardId') ?? ''));

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') return refuse(ORGANISER_AWARD_REFUSALS.confirm);
		if (isPublished) return refuse(ORGANISER_AWARD_REFUSALS.published);
		if (award === null) return refuse(ORGANISER_AWARD_REFUSALS.missing);

		const isDeleted = await deleteAward(event.locals.supabase, award.committeeId, award.id);

		if (!isDeleted) return refuse(ORGANISER_AWARD_REFUSALS.missing);

		finish(event, 'Award removed.');
	},

	publish: async (event) => {
		const { conference, sections, isPublished } = await openAwards(event);
		const publish = readPublishForm(await event.request.formData());

		if (isPublished) return refuse(ORGANISER_AWARD_REFUSALS.published, { publish });
		if (countAwards(sections).confirmed === 0) {
			return refuse(ORGANISER_AWARD_REFUSALS.noConfirmed, { publish });
		}

		const strandedAward = confirmedAwardOnEmptySeat(sections);

		if (strandedAward !== null) {
			return refuse(emptySeatPublishRefusal(strandedAward), { publish });
		}

		const moment = readPublishMoment(publish, new Date(), conference.timezone);

		if ('problem' in moment) return refuse(moment.problem, { publish });

		await publishAwards(event.locals.supabase, conference.id, moment.publishAt);

		if (publish.when !== 'scheduled') {
			finish(event, 'Awards published. Recipients have been notified.');
		}

		finish(
			event,
			`Awards will be visible from ${formatDayAndTime(moment.publishAt, conference.timezone)}.`
		);
	},

	unpublish: async (event) => {
		const { conference } = await requirePermission(
			event.locals,
			event.url,
			event.params.slug,
			'confirm_awards'
		);
		const formData = await event.request.formData();

		if (formData.get('confirm') !== '1') return refuse(ORGANISER_AWARD_REFUSALS.confirm);

		await unpublishAwards(event.locals.supabase, conference.id);

		finish(event, 'Awards hidden again. Notifications already sent stay.');
	}
};

/** Refuse an "Add award" form, sending back what was chosen with a message under its field. */
function refuseAddForm(
	committeeId: string,
	values: AwardFormValues,
	problem: AwardFormProblem | 'duplicate'
) {
	const message = ORGANISER_AWARD_REFUSALS[problem];

	return refuse(message, { committeeId, values, errors: awardFormErrors(problem, message) });
}
