/**
 * The one instant form every committee room action is sent through (T141),
 * and what each press is expected to change.
 *
 * The chair layout makes the form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) and shares it. A button hands
 * `chairForm.submitExpecting(...)` to `use:enhance`, saying at the moment of
 * the press what the press will change: the fields of the room's state it
 * sets, the rows it adds, changes or deletes. Every screen draws the page's
 * data with those expectations laid on top (`rowsAfterChanges`,
 * `roomFrameAfterPresses`), so the result shows before the server answers.
 *
 * Why this cannot show a change twice: an expectation says what things will
 * be, never "one more" or "one further down". Laying it over data that
 * already holds the change, because realtime brought it in before the answer
 * came back, gives the same screen. A row the press adds carries an id the
 * browser chose (`newRowId` below, sent in `NEW_ROW_ID_FIELD` from
 * `$lib/new-row-id.ts`), and the server saves it under that id,
 * so the saved row and the expected one are the same row.
 *
 * Roll call's answers have their own form (`$lib/roll-call-preview.ts`).
 */
import { getContext, setContext } from 'svelte';
import type {
	ChairMotion,
	CommitteeSession,
	CommitteeStateView,
	RoomSpeaker,
	SpeakersListSummary
} from '$lib/chair-room';
import type { ChairNote } from '$lib/chair-notes';
import type { Award } from '$lib/awards';
import type { RoomSeat } from '$lib/committee-room';
import {
	createInstantForm,
	type InstantForm,
	type InstantPress,
	type InstantSubmitInput
} from '$lib/instant-form.svelte';
import type { SessionMotion } from '$lib/motions';
// The form field a new row's id travels in; the server reads it with `readNewRowId`.
export { NEW_ROW_ID_FIELD } from '$lib/new-row-id';
import type { ReviewedPaper } from '$lib/paper-presses';
// Every instant form of the app lays its changes on rows the same way (T142).
import { rowsAfterChanges, type RowChange } from '$lib/row-changes';
export { rowsAfterChanges, type RowChange };
import type { ListedSpeaker } from '$lib/speakers-lists';
import type { SessionVote } from '$lib/votes';

/** A change to an entry of one speakers list. */
export type SpeakerChange = RowChange<ListedSpeaker> & {
	/** The list the entry is on, so a page showing another list leaves it alone. */
	listId: string;
};

/**
 * What one press is expected to change. Everything is optional: a press says
 * only what it touches.
 */
export type ChairExpectation = {
	/** Fields of the room's state the press sets, such as `{ mode: 'suspended' }`. */
	state?: Partial<CommitteeStateView>;
	/** The motion the room runs after the press; null when it runs none. */
	currentMotion?: ChairMotion | null;
	/** The session after the press, such as the same one marked ended. */
	currentSession?: CommitteeSession | null;
	speakers?: SpeakerChange[];
	/** A list's settings: its speaking time, and whether it takes new speakers. */
	speakersLists?: RowChange<SpeakersListSummary>[];
	motions?: RowChange<SessionMotion>[];
	votes?: RowChange<SessionVote>[];
	awards?: RowChange<Award>[];
	notes?: RowChange<ChairNote>[];
	/** A paper's review, by the paper's own id (`ReviewedPaper` in `$lib/paper-presses.ts`). */
	papers?: RowChange<ReviewedPaper>[];
};

/** A press of the chair's form, with what it is expected to change. */
export type ChairPress = InstantPress<ChairExpectation>;

/** The chair's instant form. */
export type ChairForm = InstantForm<ChairExpectation>;

/** What `use:enhance` hands over at the moment of a press. */
export type ChairSubmitInput = InstantSubmitInput;

/**
 * The start of the toast when a press fails, by the chair page's name (the
 * last part of its address, `chair` for the live room) and the action, or by
 * the action alone when it means the same on every page that has it. The
 * reason follows it.
 */
const FAILURES: Record<string, string> = {
	// The live room's own, which the frame posts from every chair page (S3, S11).
	'chair?/endSession': 'The session was not ended.',
	'chair?/setAgenda': 'The agenda was not set.',
	'chair?/suspend': 'The session was not suspended.',
	'chair?/setReturnTime': 'The return time was not set.',
	'chair?/resume': 'The session was not resumed.',
	// The floor's and the queue's, the same on the live room and on each view (S4).
	'?/timerStart': 'The timer was not started.',
	'?/timerPause': 'The timer was not paused.',
	'?/timerResume': 'The timer was not resumed.',
	'?/timerAdd': 'No time was added.',
	'?/timerReset': 'The timer was not reset.',
	'?/nextSpeaker': 'The next speaker was not called.',
	'?/endSpeech': 'The speech was not ended.',
	'?/yieldToChair': 'The speaker did not yield.',
	'?/yieldToSeat': 'The speaker did not yield.',
	'?/add': 'The speaker was not added.',
	'?/remove': 'The speaker was not removed.',
	'?/moveUp': 'The speaker was not moved.',
	'?/moveDown': 'The speaker was not moved.',
	'?/moveToTop': 'The speaker was not moved.',
	'?/moveTo': 'The speaker was not moved.',
	'?/speakNow': 'The speaker was not given the floor.',
	'?/setSpeakingTime': 'The speaking time was not changed.',
	'?/closeList': 'The list was not closed.',
	'?/openList': 'The list was not opened.',
	// The Mod, Unmod and Single speaker views, on their own routes and on the live room (S7, S8, S9).
	'mod?/startModerated': 'The caucus was not started.',
	'unmod?/startUnmoderated': 'The caucus was not started.',
	'single?/startSingle': 'The floor was not given.',
	'?/recognise': 'The delegation was not recognised.',
	'?/extendCaucus': 'The caucus was not extended.',
	'?/endCaucus': 'The caucus was not ended.',
	'?/returnToGsl': 'The room did not return to the GSL.',
	'motions?/propose': 'The motion was not recorded.',
	'motions?/vote': 'The motion was not decided.',
	'motions?/withdraw': 'The motion was not withdrawn.',
	'motions?/clearFloor': 'The floor was not cleared.',
	'motions?/restore': 'The motions were not put back on the floor.',
	// The Vote view, on `chair/voting` and on the live room while it votes (S10).
	// A roll call answer names its seat instead (`describeChairFailure`).
	'?/openVote': 'The vote was not opened.',
	'?/countVote': 'The count was not saved.',
	'?/closeVote': 'The vote was not closed.',
	'?/cancelVote': 'The vote was not cancelled.',
	'?/endVoting': 'Voting did not end.',
	'awards?/propose': 'The award was not proposed.',
	'awards?/withdraw': 'The award was not withdrawn.',
	'notes?/add': 'The note was not saved.',
	'notes?/delete': 'The note was not deleted.',
	'papers?/approve': 'The paper was not approved.',
	'papers?/requestChanges': 'The request for changes was not sent.',
	'papers?/approveAll': 'The papers were not approved.'
};

/**
 * A roll call vote's answers, which name the seat: "France’s vote was not
 * recorded." (`chair/voting.md`, "Actions and forms").
 */
const SEAT_VOTE_FAILURES: Record<string, (seatName: string) => string> = {
	'?/castRollCall': (seatName) => `${seatName}’s vote was not recorded.`,
	'?/clearRollCall': (seatName) => `${seatName}’s vote was not cleared.`
};

/** What the toast says when an action is missing from the list above. */
const UNKNOWN_FAILURE = 'That change was not saved.';

/** The chair page a press was made on: the last part of its address, such as `motions`. */
export function chairPageOf(press: ChairPress): string {
	const parts = press.action.pathname.split('/');

	return parts[parts.length - 1];
}

/**
 * The action a press posted to, written the way the list above writes it:
 * `?/approve`. A page with a filter or a chosen seat puts that first, as in
 * `?status=submitted&/approve`, and SvelteKit reads the action from the one
 * query key that starts with a slash, so this does the same.
 */
function actionOf(press: ChairPress): string {
	for (const key of press.action.searchParams.keys()) {
		if (key.startsWith('/')) return `?${key}`;
	}

	return press.action.search;
}

/**
 * The sentence a failed press's toast starts with. The live room and the
 * views share the timer, floor, queue and vote actions, so those are listed
 * by the action alone. A roll call vote's answer names the seat it was for,
 * found among `seats`, the committee's.
 */
export function describeChairFailure(press: ChairPress, seats: RoomSeat[] = []): string {
	const action = actionOf(press);
	const seatFailure = SEAT_VOTE_FAILURES[action];

	if (seatFailure !== undefined) {
		const seatId = press.formData.get('seatId');
		const seatName = seats.find((seat) => seat.id === seatId)?.name ?? 'The seat';

		return seatFailure(seatName);
	}

	const onThisPage = FAILURES[`${chairPageOf(press)}${action}`];

	return onThisPage ?? FAILURES[action] ?? UNKNOWN_FAILURE;
}

/** Every expectation the presses carry, oldest first. */
export function expectationsOf(presses: ChairPress[]): ChairExpectation[] {
	const expectations: ChairExpectation[] = [];

	for (const press of presses) {
		if (press.expected !== null) expectations.push(press.expected);
	}

	return expectations;
}

/** The entries of the list `listId` with every press's changes to them laid on top. */
export function speakersAfterPresses<Entry extends RoomSpeaker>(
	entries: Entry[],
	listId: string | null,
	presses: ChairPress[]
): Entry[] {
	const changes: RowChange<Entry>[] = [];

	for (const expectation of expectationsOf(presses)) {
		const onThisList = (expectation.speakers ?? []).filter((change) => change.listId === listId);

		// A list's rows are `RoomSpeaker` on the Room page and `ListedSpeaker`
		// on the Speakers page. Both have every field a change sets, and an
		// added entry is a `ListedSpeaker`, which is a `RoomSpeaker` too.
		changes.push(...(onThisList as RowChange<Entry>[]));
	}

	return rowsAfterChanges(entries, changes);
}

/** A speakers list's settings with every press's changes to them laid on top. */
export function speakersListAfterPresses(
	list: SpeakersListSummary,
	presses: ChairPress[]
): SpeakersListSummary {
	const changes: RowChange<SpeakersListSummary>[] = [];

	for (const expectation of expectationsOf(presses)) {
		changes.push(...(expectation.speakersLists ?? []));
	}

	// The list is always there, so `rowsAfterChanges` gives exactly one row back.
	return rowsAfterChanges([list], changes)[0];
}

/** The part of the chair layout's data that the room's presses change. */
export type RoomFrame = {
	committeeState: CommitteeStateView;
	currentSession: CommitteeSession | null;
	currentMotion: ChairMotion | null;
};

/**
 * The room's state, session and motion with every press's expectations laid
 * on top. The chair layout draws its top strip from this, and each page works
 * it out again from the same data, since a layout cannot hand values to the
 * page inside it.
 */
export function roomFrameAfterPresses(frame: RoomFrame, presses: ChairPress[]): RoomFrame {
	let { committeeState, currentSession, currentMotion } = frame;

	for (const expectation of expectationsOf(presses)) {
		if (expectation.state) committeeState = { ...committeeState, ...expectation.state };
		if (expectation.currentSession !== undefined) currentSession = expectation.currentSession;
		if (expectation.currentMotion !== undefined) currentMotion = expectation.currentMotion;
	}

	return { committeeState, currentSession, currentMotion };
}

/** A fresh id for a row a press adds. The browser chooses it so the server can save it as is. */
export function newRowId(): string {
	return crypto.randomUUID();
}

/*
	Why context rather than props: presses are made on every chair page and
	drawn both in the layout's top strip and on the page, and they must carry
	on when the chair moves to another chair page. A page cannot hand anything
	up to the layout around it through props, so the layout puts the one form
	in Svelte's context, where the components under it can reach it.
	`setContext` and `getContext` only work while a component is being set up,
	so call these at the top of a `<script>`.
*/

/** The name the form is kept under; nothing else can find it without this. */
const CHAIR_FORM_KEY = Symbol('chair instant form');

/** Share `form` with every component inside the calling one. Used by the chair layout. */
export function shareChairForm(form: ChairForm): void {
	setContext(CHAIR_FORM_KEY, form);
}

/**
 * The chair's instant form, which the chair layout makes once and shares
 * (`shareChairForm`). A failed press's toast names what failed, and a roll
 * call vote's answer names its seat, found among `seats()`: the committee's
 * seats as they are when the press fails.
 */
export function createChairForm(seats: () => RoomSeat[]): ChairForm {
	return createInstantForm<ChairExpectation>({
		describeFailure: (press) => describeChairFailure(press, seats())
	});
}

/**
 * The form the chair layout shared. A component drawn outside the chair
 * pages, as in a component test, gets one of its own.
 */
export function sharedChairForm(): ChairForm {
	const shared = getContext<ChairForm | undefined>(CHAIR_FORM_KEY);

	return shared ?? createChairForm(() => []);
}
