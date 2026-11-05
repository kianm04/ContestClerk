import {
	ROOM_REFUSALS,
	SESSION_NAME_MAX_LENGTH,
	isPastTopicLimit,
	isSessionRunning,
	readAgendaTopic,
	readNewTopic
} from '$lib/chair-room';
import { PRESSED_AT_FIELD, pressedMoment } from '$lib/clock-offset';
import { committeeRoomDependency } from '$lib/committee-room-live';
import { dayInTimezone } from '$lib/dates';
import type { Flash } from '$lib/flash';
import { FROM_VIEW_FIELD, readFromView } from '$lib/live-mode';
import { nextSessionName } from '$lib/room-ready';
import { SUSPENSION_REFUSALS } from '$lib/room-suspended';
import { readReturnTime } from '$lib/suspension';
import { chairPageUrl, chairRoomUrl } from '$lib/urls';
import { caucusActions } from '$lib/server/caucus-actions';
import {
	floorActions,
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent
} from '$lib/server/chair-floor-actions';
import {
	addCommitteeTopic,
	resumeRoom,
	setAgendaTopic,
	setSuspensionReturn,
	suspendRoom
} from '$lib/server/committee-room';
import { endSession, startSession } from '$lib/server/committee-sessions';
import { readLiveRoomViews } from '$lib/server/live-room-views';
import { readIsQuickSession, readLobbyFacts, readSuspendedRoom } from '$lib/server/room-screens';
import { singleSpeakerActions } from '$lib/server/single-speaker-actions';
import { queueActions } from '$lib/server/speaker-queue-actions';
import { voteActions } from '$lib/server/vote-view';
// `./$types` holds the types SvelteKit writes for this one route, from what
// the `load` functions return and the actions below.
import type { Actions, PageServerLoad } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 * This page is the live room, `chair`: it draws whatever the room is doing
 * (`05-pages/chair/committee-room.md`, "The room's states"), and reads what
 * that screen needs besides the frame.
 *
 * - The lobby and the ended screen: the seats with a delegate, the last
 *   session's record, the next event on the schedule and whether this is a
 *   quick session (`readLobbyFacts`). The schedule and the quick session are
 *   read always, so the ended screen shows them the moment "End session" is
 *   pressed, before this `load` runs again.
 * - A session under way: the live mode's view, with the same readers each
 *   view's own route calls (`readLiveRoomViews`): the General Speakers' List
 *   for the GSL view and the opening band, the running caucus, the single
 *   speaker or the vote. `?time=change` asks for a list's speaking time
 *   field, and `?vote=new`, `?cancel=confirm` and `?seat=` the Vote view's
 *   questions, which is how they work without JavaScript.
 * - Suspended: the list the room was working through, the vote it was on and
 *   the suspend motion's reason (`readSuspendedRoom`).
 */
export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	const { conference, committee, committeeState, seats, sessions, currentSession } = await parent();

	// The same name as the layout's, so one realtime change reloads both.
	depends(committeeRoomDependency(committee.id));

	const runningSession = isSessionRunning(currentSession) ? currentSession : null;
	const isSuspended = runningSession !== null && committeeState.mode === 'suspended';
	const reading = {
		conferenceId: conference.id,
		committeeId: committee.id,
		sessions,
		isSessionRunning: runningSession !== null,
		now: new Date()
	};
	const room = { committeeId: committee.id, committeeState, currentSession, seats };

	const [lobbyFacts, views, suspendedRoom] = await Promise.all([
		readLobbyFacts(locals.supabase, reading),
		readLiveRoomViews(locals.supabase, room, url),
		isSuspended ? readSuspendedRoom(locals.supabase, committeeState, seats) : null
	]);

	return {
		lobbyFacts,
		...views,
		suspendedRoom,
		isTimeFieldOpen: url.searchParams.get('time') === 'change'
	};
};

/**
 * Go back to the live room, which is where a press that changes what the room
 * is doing lands (`committee-room.md`, "Viewing is not the same as going
 * live"). `redirect` throws inside `returnTo`, which is how it stops the action.
 */
function backToRoom(event: ChairRequestEvent, flash: Flash | null = null) {
	returnTo(event, chairRoomUrl(event.params.slug, event.params.committeeSlug), flash);
}

/**
 * The page the chair pressed on, which the console's frame names in the
 * action's address (`chairFrameAction` in `$lib/urls.ts`): the agenda menu
 * and the live strip post here from every chair page, and a press that does
 * not change what the room is doing sends the chair back to where they were.
 * An address that names no page, or a page that does not exist, is `chair`.
 */
function fromViewAddress(event: ChairRequestEvent): string {
	const fromView = readFromView(event.url.searchParams.get(FROM_VIEW_FIELD));

	return chairPageUrl(event.params.slug, event.params.committeeSlug, fromView);
}

export const actions: Actions = {
	startSession: async (event) => {
		const { conference, committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();

		if (frame.sessions.some((session) => session.status === 'in_progress')) {
			return refuseChairAction(ROOM_REFUSALS.sessionRunning);
		}

		// Without a typed name the session is "Session {n}", or a practice
		// session before the conference's first day in its own timezone; a
		// quick session has no practice sessions.
		const today = dayInTimezone(new Date(), conference.timezone);
		const isQuickSession = await readIsQuickSession(event.locals.supabase, conference.id);
		const typedName = String(formData.get('name') ?? '').trim();

		// The field carries a `maxlength`, so only a hand-made request gets here;
		// the database refuses the same length.
		if (typedName.length > SESSION_NAME_MAX_LENGTH) {
			return refuseChairAction(ROOM_REFUSALS.sessionNameTooLong);
		}

		const name =
			typedName === ''
				? nextSessionName(frame.sessions, conference, today, isQuickSession)
				: typedName;

		await startSession(event.locals.supabase, committee, name, new Date());

		backToRoom(event, { tone: 'success', message: `${name} started.` });
	},

	endSession: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();

		// End's confirmation always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') {
			return refuseChairAction('Please confirm before ending the session.');
		}

		const session = frame.currentSession;

		if (session === null || !isSessionRunning(session))
			return refuseChairAction(ROOM_REFUSALS.noSessionRunning);

		await endSession(event.locals.supabase, committee.id, session.id, new Date());

		backToRoom(event, { tone: 'success', message: 'Session ended.' });
	},

	// Suspend: one press, from any chair page. Every clock pauses at the moment
	// the chair's screen showed (`pressedAt`), and everything else is kept (D6).
	suspend: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();

		if (!isSessionRunning(frame.currentSession))
			return refuseChairAction(ROOM_REFUSALS.noSessionRunning);
		if (frame.committeeState.mode === 'suspended')
			return refuseChairAction(SUSPENSION_REFUSALS.alreadySuspended);

		const pressed = pressedMoment(formData.get(PRESSED_AT_FIELD), new Date());
		await suspendRoom(event.locals.supabase, committee.id, frame.committeeState, pressed);

		backToRoom(event);
	},

	// The suspended screen's 10, 15, 30 and 60 minute buttons (`minutes`) and
	// its time field (`backAt`), today in the conference's own timezone.
	setReturnTime: async (event) => {
		const { conference, committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const isSuspended =
			isSessionRunning(frame.currentSession) && frame.committeeState.mode === 'suspended';

		if (!isSuspended) return refuseChairAction(SUSPENSION_REFUSALS.notSuspended);

		const pressed = pressedMoment(formData.get(PRESSED_AT_FIELD), new Date());
		const reading = readReturnTime(
			formData.get('minutes'),
			formData.get('backAt'),
			pressed,
			conference.timezone
		);

		if (reading.suspendedUntil === null) {
			return refuseChairAction(reading.refusal ?? SUSPENSION_REFUSALS.notSuspended);
		}

		await setSuspensionReturn(event.locals.supabase, committee.id, reading.suspendedUntil);

		backToRoom(event);
	},

	// "Resume session" puts back exactly what was suspended, with both clocks still paused.
	resume: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const isSuspended =
			isSessionRunning(frame.currentSession) && frame.committeeState.mode === 'suspended';

		if (!isSuspended) return refuseChairAction(SUSPENSION_REFUSALS.notSuspended);

		await resumeRoom(event.locals.supabase, committee.id);

		backToRoom(event);
	},

	// The chair records the topic the committee has chosen to debate: one press
	// on a topic in the agenda menu or the opening band. In MUN the agenda is
	// usually set by a motion; the chair runs that vote on the floor and records
	// its outcome here (T127 decision in `open-questions.md`).
	setAgenda: async (event) => {
		const { committee } = await openChairRoom(event);
		const formData = await event.request.formData();
		const topic = readAgendaTopic(formData.get('topic'), committee.topics);

		if (topic === null) return refuseChairAction(ROOM_REFUSALS.agendaTopic);

		await setAgendaTopic(event.locals.supabase, committee.id, topic);

		// The agenda changes nothing about what the room is doing, so the chair stays where they were.
		returnTo(event, fromViewAddress(event), { tone: 'success', message: `Agenda set: ${topic}.` });
	},

	// A quick session's "Add a topic" in the agenda menu: its chair is its
	// organiser too, so the topic joins the committee's and becomes the agenda
	// in one press (`chair/quick-session.md`). Any other committee's topics
	// are its organisers', on the committee's page in the organiser area.
	addTopic: async (event) => {
		const { conference, committee } = await openChairRoom(event);
		const formData = await event.request.formData();
		const isQuickSession = await readIsQuickSession(event.locals.supabase, conference.id);

		if (!isQuickSession) return refuseChairAction(ROOM_REFUSALS.topicsElsewhere);

		const reading = readNewTopic(formData.get('topic'));

		if ('refusal' in reading) return refuseChairAction(reading.refusal);

		const { topic } = reading;

		if (isPastTopicLimit(committee.topics, topic)) {
			return refuseChairAction(ROOM_REFUSALS.tooManyTopics);
		}

		await addCommitteeTopic(event.locals.supabase, committee.id, committee.topics, topic);
		await setAgendaTopic(event.locals.supabase, committee.id, topic);

		returnTo(event, fromViewAddress(event), { tone: 'success', message: `Agenda set: ${topic}.` });
	},

	// Every view `chair` draws posts its buttons here, so the live room has
	// each view's actions, taken from the same place as the view's own route:
	// the floor (the timer, "Next", "End speech", the yields) and the queue
	// (add, move, remove, "Speak now", the list's settings) of the GSL, Mod,
	// Unmod and Single speaker views; the caucus's "Recognise", "Extend +5:00"
	// and "End caucus"; the single speaker's "Return to GSL"; and the Vote
	// view's. Each sends the chair back to the page they pressed on: here, or
	// the view the live strip was pressed on, or `chair` for a press that
	// changes what the room is doing ("End caucus", "Cancel vote", …). Every
	// name is different, so none of the five hides another.
	...floorActions(fromViewAddress),
	...queueActions(fromViewAddress),
	...caucusActions(fromViewAddress),
	...singleSpeakerActions(),
	...voteActions(fromViewAddress)
};
