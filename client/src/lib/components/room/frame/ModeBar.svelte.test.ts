import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { SessionControls } from '$lib/chair-frame';
import { CLEARED_TIMER } from '$lib/committee-room';
import { modeBarTabs, type ModeBarFacts } from '$lib/live-mode';
import ModeBar from './ModeBar.svelte';

const ROOM = '/conferences/thimun-2027/committees/unsc/chair';

/** The mode bar's tabs, as the layout works them out, for the facts given. */
function tabs(changes: Partial<ModeBarFacts> = {}) {
	return modeBarTabs({
		page: 'chair',
		mode: 'formal_debate',
		motionsOnFloorCount: 0,
		builtViews: ['gsl', 'motions', 'voting'],
		...changes
	});
}

/** Suspend and End for Session 1, nothing asked yet. */
function controls(changes: Partial<SessionControls> = {}): SessionControls {
	return {
		session: {
			id: 'session-1',
			name: 'Session 1',
			status: 'in_progress',
			startedAt: '2027-03-12T08:00:00Z',
			endedAt: null
		},
		committeeState: {
			currentSessionId: 'session-1',
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
		onKeepGoing: vi.fn(),
		...changes
	};
}

/** Draws the bar on the live room with the given tabs and controls. */
function renderBar(tabList = tabs(), sessionControls = controls()) {
	return render(ModeBar, {
		props: { tabs: tabList, conferenceSlug: 'thimun-2027', committeeSlug: 'unsc', sessionControls }
	});
}

describe('ModeBar', () => {
	it('shows the built views in order, each a link with its key', () => {
		renderBar();

		const nav = screen.getByRole('navigation', { name: 'Modes' });
		const links = Array.from(nav.querySelectorAll('a[aria-keyshortcuts]'));

		expect(links.map((link) => link.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2 M', '6']);
	});

	it('marks the live view with a dot, says "live" and links it to the live room', () => {
		renderBar(tabs({ page: 'motions' }));

		const gsl = screen.getByRole('link', { name: /GSL/ });
		expect(gsl.textContent).toContain('live');
		expect(gsl.getAttribute('href')).toBe(ROOM);
		expect(gsl.querySelector('.bg-brand-500')).not.toBeNull();
	});

	it('marks the view being looked at as the current page, and links the others to their routes', () => {
		renderBar(tabs({ page: 'motions' }));

		const motions = screen.getByRole('link', { name: /Motions/ });
		expect(motions.getAttribute('aria-current')).toBe('page');
		expect(motions.className).toContain('text-brand-900');
		expect(screen.getByRole('link', { name: /Vote/ }).getAttribute('href')).toBe(`${ROOM}/voting`);
		expect(screen.getByRole('link', { name: /GSL/ }).hasAttribute('aria-current')).toBe(false);
	});

	it('counts the motions on the floor, and shows no count without any', () => {
		const { unmount } = renderBar(tabs({ motionsOnFloorCount: 2 }));
		// The count is the pill in figures of one width; the key's hint is a `<kbd>`.
		const countOf = () =>
			screen.getByRole('link', { name: /Motions/ }).querySelector('span.tabular-nums');

		expect(countOf()?.textContent?.trim()).toBe('2');
		unmount();

		renderBar(tabs({ motionsOnFloorCount: 0 }));
		expect(countOf()).toBeNull();
	});

	it('puts no dot anywhere while the room is suspended, and leaves Suspend out', () => {
		const suspended = tabs({ mode: 'suspended' });
		renderBar(suspended, controls({ isSuspendShown: false }));

		expect(suspended.some((tab) => tab.isLive)).toBe(false);
		expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
		expect(screen.getByRole('link', { name: 'End' })).toBeTruthy();
	});

	it('offers Suspend and End while a session runs; End links to the confirmation without JavaScript', () => {
		renderBar();

		expect(
			screen.getByRole('button', { name: 'Suspend' }).closest('form')?.getAttribute('action')
		).toBe(`${ROOM}?/suspend`);
		expect(screen.getByRole('link', { name: 'End' }).getAttribute('href')).toBe(
			`${ROOM}?end=confirm`
		);
	});

	it('asks in place when End is pressed', async () => {
		const onAskToEnd = vi.fn();
		renderBar(tabs(), controls({ onAskToEnd }));

		await fireEvent.click(screen.getByRole('link', { name: 'End' }));

		expect(onAskToEnd).toHaveBeenCalledOnce();
	});

	it('draws the confirmation in place of Suspend and End, with Escape on "Keep going"', async () => {
		const onKeepGoing = vi.fn();
		renderBar(tabs(), controls({ isConfirming: true, onKeepGoing }));

		expect(screen.getByText('End Session 1?')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
		const keepGoing = screen.getByRole('link', { name: 'Keep going' });
		expect(keepGoing.getAttribute('aria-keyshortcuts')).toBe('Escape');
		expect(keepGoing.getAttribute('href')).toBe(ROOM);

		const endSession = screen.getByRole('button', { name: 'End session' });
		expect(endSession.className).toContain('bg-destructive');
		const form = endSession.closest('form');
		expect(form?.getAttribute('action')).toBe(`${ROOM}?/endSession`);
		expect(form?.querySelector('input[name="confirm"]')?.getAttribute('value')).toBe('1');

		await fireEvent.click(keepGoing);
		await tick();
		expect(onKeepGoing).toHaveBeenCalledOnce();
	});
});
