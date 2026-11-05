import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { committeeMenuLinks, type CommitteeTools, type SessionControls } from '$lib/chair-frame';
import type { CommitteeSession } from '$lib/chair-room';
import { CLEARED_TIMER } from '$lib/committee-room';
import { signedInHomeUrl } from '$lib/urls';
import CommitteeMenu from './CommitteeMenu.svelte';

const ROOM = '/conferences/thimun-2027/committees/unsc/chair';

/** A chair who may open every page of the console. */
const EVERY_TOOL: CommitteeTools = {
	mayReviewPapers: true,
	mayWriteNotes: true,
	mayProposeAwards: true
};

const ENDED: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'ended',
	startedAt: '2027-03-11T08:00:00Z',
	endedAt: '2027-03-11T16:00:00Z'
};

/** Suspend and End for a phone, while Session 2 runs. */
const SESSION_CONTROLS: SessionControls = {
	session: { ...ENDED, id: 'session-2', name: 'Session 2', status: 'in_progress', endedAt: null },
	committeeState: {
		currentSessionId: 'session-2',
		mode: 'formal_debate',
		currentMotionId: null,
		activeSpeakersListId: 'gsl',
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: CLEARED_TIMER
	},
	clockOffsetMs: 0,
	isSuspendShown: true,
	isConfirming: false,
	suspendAction: `${ROOM}?/suspend`,
	endSessionAction: `${ROOM}?/endSession`,
	confirmHref: `${ROOM}?end=confirm`,
	cancelHref: ROOM,
	onAskToEnd: vi.fn(),
	onKeepGoing: vi.fn()
};

/** The menu, with the shortcuts on and no ask for the keys yet. */
function renderMenu(changes: Record<string, unknown> = {}) {
	const onToggleShortcuts = vi.fn();
	const result = render(CommitteeMenu, {
		props: {
			links: committeeMenuLinks('thimun-2027', 'unsc', [ENDED], EVERY_TOOL),
			leaveHref: signedInHomeUrl(),
			areShortcutsOn: true,
			onToggleShortcuts,
			keyListRequestCount: 0,
			sessionControls: null,
			...changes
		}
	});

	return { ...result, onToggleShortcuts };
}

describe('CommitteeMenu', () => {
	it('offers Papers, Notes, Awards, the session record and Leave chair room', () => {
		renderMenu();

		expect(screen.getByRole('link', { name: 'Papers' }).getAttribute('href')).toBe(
			`${ROOM}/papers`
		);
		expect(screen.getByRole('link', { name: 'Notes' }).getAttribute('href')).toBe(`${ROOM}/notes`);
		expect(screen.getByRole('link', { name: 'Awards' }).getAttribute('href')).toBe(
			`${ROOM}/awards`
		);
		expect(screen.getByRole('link', { name: 'Session record' }).getAttribute('href')).toBe(
			`${ROOM}/motions?session=session-1`
		);
		expect(screen.getByRole('link', { name: 'Leave chair room' }).getAttribute('href')).toBe(
			'/home'
		);
	});

	it('is a native menu that declares "?", and opens at the list of keys when "?" asks', async () => {
		const { container, rerender } = renderMenu();
		const menu = container.querySelector('details[data-committee-menu]') as HTMLDetailsElement;

		expect(menu.open).toBe(false);
		expect(menu.querySelector('summary')?.getAttribute('aria-keyshortcuts')).toBe('?');

		await rerender({ keyListRequestCount: 1 });
		await tick();

		expect(menu.open).toBe(true);
		expect(screen.getByText('Start, pause or resume the live clock')).toBeTruthy();
	});

	it('flips the keyboard shortcuts with a switch that says whether it is on', async () => {
		const { onToggleShortcuts } = renderMenu({ areShortcutsOn: false });
		await tick();

		const switchButton = screen.getByRole('button', { name: /Use keyboard shortcuts/ });
		expect(switchButton.getAttribute('aria-pressed')).toBe('false');

		await fireEvent.click(switchButton);
		expect(onToggleShortcuts).toHaveBeenCalledOnce();
	});

	it('leaves Awards out of a quick session, which has none', () => {
		renderMenu({ links: committeeMenuLinks('thimun-2027', 'unsc', [ENDED], EVERY_TOOL, true) });

		expect(screen.queryByRole('link', { name: 'Awards' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Notes' })).toBeTruthy();
	});

	it('holds Suspend and End for a phone while a session runs', () => {
		renderMenu({ sessionControls: SESSION_CONTROLS });

		expect(
			screen.getByRole('button', { name: 'Suspend' }).closest('form')?.getAttribute('action')
		).toBe(`${ROOM}?/suspend`);
		expect(screen.getByRole('link', { name: 'End' }).getAttribute('href')).toBe(
			`${ROOM}?end=confirm`
		);
	});

	it('leaves Suspend and End out while no session runs', () => {
		renderMenu();

		expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'End' })).toBeNull();
	});
});
