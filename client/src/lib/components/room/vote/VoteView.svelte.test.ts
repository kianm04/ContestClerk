import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import type { CommitteeStateView } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import type { VoteViewFrame } from '$lib/vote-view';
import type { OpenVote, SessionVote, VoteViewData } from '$lib/votes';
import VoteView from './VoteView.svelte';

// SvelteKit's `enhance` needs a running app; standing it in keeps every form
// on the page, so these tests are about what the view draws.
vi.mock('$app/forms', () => ({
	applyAction: vi.fn(),
	enhance: (form: HTMLFormElement) => {
		const stopSubmit = (event: Event) => event.preventDefault();
		form.addEventListener('submit', stopSubmit);
		return { destroy: () => form.removeEventListener('submit', stopSubmit) };
	}
}));

const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const CHINA: RoomSeat = { id: 'seat-cn', name: 'China', countryCode: 'CN' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-gh', name: 'Ghana', countryCode: 'GH' };

/** The room in formal debate, or voting on `currentVoteId`. */
function stateOf(
	currentVoteId: string | null,
	mode: CommitteeStateView['mode']
): CommitteeStateView {
	return {
		currentSessionId: 'session-1',
		mode,
		currentMotionId: null,
		activeSpeakersListId: 'gsl-1',
		currentSpeakerEntryId: null,
		currentVoteId,
		agendaTopic: null,
		timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
	};
}

/** The chair layout's data: France present and voting, Brazil and China present, Ghana absent. */
function frameOf(
	state: CommitteeStateView,
	latestRollCallId: string | null = 'roll-1'
): VoteViewFrame {
	return {
		conference: { slug: 'mun', timezone: 'Europe/Amsterdam' },
		committee: { slug: 'unsc' },
		committeeState: state,
		currentSession: null,
		currentMotion: null,
		seats: [GHANA, FRANCE, CHINA, BRAZIL],
		attendance:
			latestRollCallId === null
				? {}
				: {
						'seat-fr': 'present_and_voting',
						'seat-br': 'present',
						'seat-cn': 'present',
						'seat-gh': 'absent'
					},
		latestRollCallId
	};
}

/** A vote of the session. */
function voteOf(overrides: Partial<OpenVote> = {}): OpenVote {
	return {
		id: 'vote-1',
		subject: 'Draft Resolution 1.1',
		kind: 'substantive',
		method: 'roll_call',
		majority: 'simple',
		status: 'open',
		votesFor: null,
		votesAgainst: null,
		votesAbstain: null,
		passed: null,
		openedAt: '2026-01-01T10:00:00.000Z',
		closedAt: null,
		entries: {},
		...overrides
	};
}

const CLOSED: SessionVote = {
	...voteOf({ id: 'vote-0', subject: 'Draft Resolution 1.0', method: 'show_of_hands' }),
	status: 'closed',
	votesFor: 1,
	votesAgainst: 2,
	votesAbstain: 0,
	passed: false,
	closedAt: '2026-01-01T09:30:00.000Z'
};

/** The view's own data. */
function viewOf(vote: OpenVote | null, overrides: Partial<VoteViewData> = {}): VoteViewData {
	return {
		vote,
		closedVotes: [],
		isNewVoteShown: false,
		isCancelConfirming: false,
		focusedSeatId: null,
		subjects: [],
		...overrides
	};
}

/** The view, drawn on `chair/voting`. */
function renderView(view: VoteViewData, frame: VoteViewFrame) {
	return render(VoteView, {
		props: { view, frame, refusedValues: null, refusedErrors: {}, page: 'voting' }
	});
}

describe('VoteView', () => {
	it('sets a vote up with the attendance line, "Open vote" the one filled button, and the votes so far', () => {
		renderView(viewOf(null, { closedVotes: [CLOSED] }), frameOf(stateOf(null, 'formal_debate')));

		expect(screen.getByRole('heading', { name: 'Open a vote' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Substantive' })).toHaveProperty('checked', true);
		expect(screen.getByRole('radio', { name: 'Simple' })).toHaveProperty('checked', true);
		expect(screen.getByRole('radio', { name: 'Count hands' })).toHaveProperty('checked', true);
		expect(
			screen.getByText(/3 present, 1 of them present and voting/).parentElement?.textContent
		).toContain('simple majority: more for than against');
		expect(screen.getByRole('button', { name: 'Open vote' }).hasAttribute('disabled')).toBe(false);
		expect(screen.queryByRole('button', { name: 'End voting' })).toBeNull();

		const history = screen.getByRole('region', { name: 'Votes this session' });
		expect(within(history).getByText('Failed')).toBeTruthy();
		expect(within(history).getByText('1–2–0 · simple majority · 10:30')).toBeTruthy();
	});

	it('puts the chosen majority into words', async () => {
		renderView(viewOf(null), frameOf(stateOf(null, 'formal_debate')));

		await fireEvent.click(screen.getByRole('radio', { name: 'Two-thirds' }));

		expect(screen.getByText(/two thirds of those voting for or against/)).toBeTruthy();
	});

	it('waits for a roll call, saying so in a neutral tone with the way to take one', () => {
		renderView(viewOf(null), frameOf(stateOf(null, 'formal_debate'), null));

		expect(screen.getByText(/Take roll call before opening a vote\./)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Take roll call' }).getAttribute('href')).toContain(
			'/roll-call?from=voting'
		);
		expect(screen.getByRole('button', { name: 'Open vote' }).hasAttribute('disabled')).toBe(true);
	});

	it('offers "End voting" beside "Open vote" while the room votes with no vote open', () => {
		renderView(viewOf(null), frameOf(stateOf(null, 'voting')));

		expect(screen.getByRole('button', { name: 'End voting' })).toBeTruthy();
		expect(screen.getByLabelText('On')).toBe(document.activeElement);
	});

	it('lists the drafts in "On" once debate is closed, the first picked and nothing to type', () => {
		const draft = { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' };
		renderView(viewOf(null, { subjects: [draft] }), frameOf(stateOf(null, 'voting')));

		expect(screen.getByLabelText('On').textContent).toContain('Draft resolution 1.1');
		expect(screen.queryByRole('textbox', { name: 'Other' })).toBeNull();
	});

	it('keeps a closed vote’s result on show, with "End voting" the one filled button', () => {
		const closed = voteOf({
			status: 'closed',
			votesFor: 9,
			votesAgainst: 4,
			votesAbstain: 2,
			passed: true
		});

		renderView(viewOf(closed), frameOf(stateOf('vote-1', 'voting')));

		expect(screen.getByText('Draft Resolution 1.1 passes')).toBeTruthy();
		expect(screen.getByText('9 for · 4 against · 2 abstentions')).toBeTruthy();
		expect(screen.getByText('Vote closed')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open another vote' }).getAttribute('href')).toBe(
			'/conferences/mun/committees/unsc/chair/voting?vote=new'
		);
		expect(screen.getByRole('button', { name: 'End voting' })).toBeTruthy();
	});

	it('sets the next vote up when "Open another vote" asked for it', () => {
		const closed = voteOf({ status: 'closed', passed: true });

		renderView(viewOf(closed, { isNewVoteShown: true }), frameOf(stateOf('vote-1', 'voting')));

		expect(screen.getByRole('heading', { name: 'Open a vote' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'End voting' })).toBeTruthy();
	});

	it('calls the roll from the top, alphabetically, with the marker on the first seat to answer', () => {
		renderView(
			viewOf(voteOf({ entries: { 'seat-br': 'for' } })),
			frameOf(stateOf('vote-1', 'voting'))
		);

		const rows = within(screen.getByRole('list', { name: 'Seats voting' })).getAllByRole(
			'listitem'
		);
		expect(rows.map((row) => row.textContent?.match(/Brazil|China|France/)?.[0])).toEqual([
			'Brazil',
			'China',
			'France'
		]);
		expect(rows[1].getAttribute('aria-current')).toBe('true');
		expect(
			within(rows[1]).getByRole('button', { name: 'Yes' }).getAttribute('aria-keyshortcuts')
		).toBe('Y');
		expect(
			within(rows[2]).getByRole('button', { name: 'Yes' }).hasAttribute('aria-keyshortcuts')
		).toBe(false);
		expect(within(rows[0]).getByRole('button', { name: 'Clear' })).toBeTruthy();
		expect(screen.getByText('2 to call')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Close vote: passes' })).toBeTruthy();
	});

	it('will not let a present and voting seat abstain, saying why', () => {
		renderView(viewOf(voteOf()), frameOf(stateOf('vote-1', 'voting')));

		const france = screen.getByRole('form', { name: 'Vote of France' });
		const abstain = within(france).getByRole('button', { name: 'Abstain' });

		expect(abstain.hasAttribute('disabled')).toBe(true);
		expect(abstain.parentElement?.getAttribute('title')).toBe(
			'Present and voting seats cannot abstain.'
		);
	});

	it('moves the marker with ↑ and ↓ inside the list', async () => {
		renderView(viewOf(voteOf()), frameOf(stateOf('vote-1', 'voting')));
		const list = screen.getByRole('list', { name: 'Seats voting' });

		await fireEvent.keyDown(within(list).getAllByRole('button', { name: 'Yes' })[0], {
			key: 'ArrowDown'
		});

		const rows = within(list).getAllByRole('listitem');
		expect(rows[1].getAttribute('aria-current')).toBe('true');
	});
});
