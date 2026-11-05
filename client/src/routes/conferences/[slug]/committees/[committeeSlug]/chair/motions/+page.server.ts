import { fail } from '@sveltejs/kit';
import { isSessionRunning, presentSeats, type CommitteeSession } from '$lib/chair-room';
import { simpleMajority } from '$lib/committee-room';
import { committeeRoomDependency } from '$lib/committee-room-live';
import type { Flash } from '$lib/flash';
import { motionPassLanding } from '$lib/live-mode';
import { motionCountRefusal, motionPresentCount } from '$lib/motion-count';
import {
	MOTION_REFUSALS,
	chooseShownSession,
	droppedMotionsMessage,
	endedSessions,
	isCaucusMode,
	readMotionForm,
	readMotionIds,
	readMotionResult,
	readMotionTally,
	type MotionFormErrors,
	type MotionFormValues,
	type SessionMotion
} from '$lib/motions';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { chairMotionsRestoreAction, chairMotionsUrl, chairPageUrl } from '$lib/urls';
import {
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent
} from '$lib/server/chair-floor-actions';
import { applyPassedMotion } from '$lib/server/motion-effects';
import {
	decideMotion,
	dropMotions,
	listMotions,
	proposeMotion,
	restoreMotions
} from '$lib/server/motions';
import { listApprovedPapers } from '$lib/server/papers-on-floor';
import type { Actions, PageServerLoad } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * It adds the motions of the session being shown: the one running in the
 * room, or the ended one `?session=<id>` names, which is drawn read-only as
 * the session record (with the other ended sessions linked). `?motion=<id>`
 * names a motion put to the vote out of order. The majority is counted from
 * the seats present at the latest roll call, or from every seat before the
 * session has one. Because this `load` reads the address, SvelteKit runs it
 * again whenever `?motion` or `?session` changes. The approved papers are
 * the ones a motion to introduce a document may name, read only while the
 * composer is there to name them.
 */
export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	const { committee, sessions, currentSession, seats, attendance, latestRollCallId } =
		await parent();

	// The same name as the layout's, so a realtime change reloads this page too.
	depends(committeeRoomDependency(committee.id));

	const shown = chooseShownSession(sessions, currentSession, url.searchParams.get('session'));
	// Neither read needs the other's answer, so they run side by side.
	const [motions, approvedPapers] = await Promise.all([
		shown.session ? listMotions(locals.supabase, shown.session.id) : [],
		shown.isReadOnly ? [] : listApprovedPapers(locals.supabase, committee.id)
	]);
	const hasRollCall = latestRollCallId !== null;
	const presentCount = motionPresentCount(seats.length, attendance, hasRollCall);

	return {
		shownSession: shown.session,
		isReadOnly: shown.isReadOnly,
		motions,
		approvedPapers,
		// Only the session record lists the earlier sessions.
		earlierSessions: shown.isReadOnly ? endedSessions(sessions) : [],
		presentCount,
		majority: simpleMajority(presentCount),
		hasRollCall,
		requestedMotionId: url.searchParams.get('motion')
	};
};

/**
 * Refuse the composer, drawing it again with what was typed. `errors` go under
 * the fields; `message`, when there is one, is shown as a toast.
 */
function refuseMotionForm(
	values: MotionFormValues,
	errors: MotionFormErrors,
	message: string | null = null
) {
	const flash: Flash | null = message ? { tone: 'error', message } : null;

	return fail(400, { values, errors, flash });
}

/**
 * Go back to the Motions view, which is what every action does once it has
 * worked, unless a Pass changed what the room is doing. `redirect` throws
 * inside `returnTo`, which is how it stops the action.
 */
function backToMotions(event: ChairRequestEvent, flash: Flash | null = null) {
	returnTo(event, chairMotionsUrl(event.params.slug, event.params.committeeSlug), flash);
}

/** The running session, or null when the room has none. */
function runningSession(session: CommitteeSession | null): CommitteeSession | null {
	return session !== null && isSessionRunning(session) ? session : null;
}

/** The motion of the session that `formData` names, while it is still on the floor; otherwise null. */
async function findMotionOnFloor(
	event: ChairRequestEvent,
	sessionId: string,
	formData: FormData
): Promise<SessionMotion | null> {
	const motionId = String(formData.get('motionId') ?? '');
	const motions = await listMotions(event.locals.supabase, sessionId);
	const motion = motions.find((candidate) => candidate.id === motionId);

	return motion?.status === 'proposed' ? motion : null;
}

/**
 * The toast after motions were dropped at once, with "Undo" posting their
 * ids to `restore` from whichever chair page it is shown on. Null when none
 * were dropped, as when the floor held only the motion that passed.
 */
function droppedFlash(
	event: ChairRequestEvent,
	droppedIds: string[],
	areOthers: boolean
): Flash | null {
	if (droppedIds.length === 0) return null;

	const { slug, committeeSlug } = event.params;
	// On the server `resolve()` writes an address relative to the request
	// ("../../motions?/restore"), which would mean another page once the chair
	// has landed on `chair`. Read against the request's own address, it is
	// written from the site's root instead, as the toast's form needs.
	const restore = new URL(chairMotionsRestoreAction(slug, committeeSlug), event.url);

	return {
		tone: 'info',
		message: droppedMotionsMessage(droppedIds.length, areOthers),
		undo: {
			label: 'Undo',
			action: `${restore.pathname}${restore.search}`,
			motionIds: droppedIds
		}
	};
}

export const actions: Actions = {
	propose: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const presentSeatIds = presentSeats(frame.seats, frame.attendance).map((seat) => seat.id);
		const speakingSeconds = committee.defaultSpeakingTimeSeconds;
		const approvedPapers = await listApprovedPapers(event.locals.supabase, committee.id);
		const { values, errors, input } = readMotionForm(
			formData,
			presentSeatIds,
			speakingSeconds,
			approvedPapers
		);
		const session = runningSession(frame.currentSession);

		if (session === null) return refuseMotionForm(values, {}, MOTION_REFUSALS.noSession);
		if (input === null) return refuseMotionForm(values, errors);

		// An extension lengthens the caucus the room is running, so there has to be one.
		if (input.kind === 'extend_caucus' && !isCaucusMode(frame.committeeState.mode)) {
			return refuseMotionForm(values, {}, MOTION_REFUSALS.noCaucus);
		}

		const motionId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));
		await proposeMotion(event.locals.supabase, committee.id, session.id, input, motionId);

		backToMotions(event);
	},

	vote: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const session = runningSession(frame.currentSession);

		// The order of the checks is the one `motions.md` gives under "vote".
		if (session === null) return refuseChairAction(MOTION_REFUSALS.noSession);

		const result = readMotionResult(formData.get('result'));
		const tally = readMotionTally(formData);

		if (result === null) return refuseChairAction(MOTION_REFUSALS.noResult);
		if (tally === 'notWhole') return refuseChairAction(MOTION_REFUSALS.voteCounts);

		const hasRollCall = frame.latestRollCallId !== null;
		const presentCount = motionPresentCount(frame.seats.length, frame.attendance, hasRollCall);
		const countRefusal = motionCountRefusal(
			result,
			tally,
			presentCount,
			simpleMajority(presentCount)
		);

		if (countRefusal !== null) return refuseChairAction(countRefusal);

		const motion = await findMotionOnFloor(event, session.id, formData);

		if (motion === null) return refuseChairAction(MOTION_REFUSALS.notOnFloor);

		const counts = { votesFor: tally?.votesFor ?? null, votesAgainst: tally?.votesAgainst ?? null };
		const now = new Date();

		if (result === 'failed') {
			const decision = { status: 'failed' as const, ...counts };
			const wasDecided = await decideMotion(event.locals.supabase, motion.id, decision, now);

			if (!wasDecided) return refuseChairAction(MOTION_REFUSALS.notOnFloor);

			return backToMotions(event);
		}

		// `apply_passed_motion` passes the motion, drops the rest of the floor and
		// changes the room in one transaction, asking the room's own questions
		// again (an open vote, a suspension, a caucus to extend).
		const state = frame.committeeState;
		const supabase = event.locals.supabase;
		const outcome = await applyPassedMotion(
			supabase,
			committee.id,
			state,
			session.id,
			motion,
			now,
			counts
		);

		if ('refusal' in outcome) return refuseChairAction(outcome.refusal);

		// A pass that changes what the room is doing takes the chair to the live room.
		const { slug, committeeSlug } = event.params;
		const landing = chairPageUrl(slug, committeeSlug, motionPassLanding(motion.kind));

		returnTo(event, landing, droppedFlash(event, outcome.droppedMotionIds, true));
	},

	withdraw: async (event) => {
		const { frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const session = runningSession(frame.currentSession);

		if (session === null) return refuseChairAction(MOTION_REFUSALS.noSession);

		// Withdrawing is only offered while a motion is on the floor.
		const motion = await findMotionOnFloor(event, session.id, formData);

		if (motion === null) return refuseChairAction(MOTION_REFUSALS.notOnFloor);

		const decision = { status: 'withdrawn' as const, votesFor: null, votesAgainst: null };
		const wasDecided = await decideMotion(event.locals.supabase, motion.id, decision, new Date());

		if (!wasDecided) return refuseChairAction(MOTION_REFUSALS.notOnFloor);

		backToMotions(event);
	},

	clearFloor: async (event) => {
		const { frame } = await openChairRoom(event);
		const session = runningSession(frame.currentSession);

		if (session === null) return refuseChairAction(MOTION_REFUSALS.noSession);

		const droppedIds = await dropMotions(event.locals.supabase, session.id, new Date());

		if (droppedIds.length === 0) return refuseChairAction(MOTION_REFUSALS.emptyFloor);

		backToMotions(event, droppedFlash(event, droppedIds, false));
	},

	restore: async (event) => {
		const { frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const session = runningSession(frame.currentSession);

		if (session === null) return refuseChairAction(MOTION_REFUSALS.noSession);

		// Every motion named must be one of this session's dropped motions.
		const motionIds = readMotionIds(formData);
		const motions = await listMotions(event.locals.supabase, session.id);
		const isDropped = (motionId: string) =>
			motions.some((motion) => motion.id === motionId && motion.status === 'dropped');

		if (motionIds.length === 0 || !motionIds.every(isDropped)) {
			return refuseChairAction(MOTION_REFUSALS.notDropped);
		}

		await restoreMotions(event.locals.supabase, session.id, motionIds);

		backToMotions(event);
	}
};
