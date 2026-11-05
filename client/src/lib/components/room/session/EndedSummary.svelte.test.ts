import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { EndedSummaryView } from '$lib/room-ended';
import EndedSummary from './EndedSummary.svelte';

const ROOM = '/conferences/thimun-2027/committees/unsc/chair';

/** Day 2 of 3: more sessions to come, with the next one on the schedule. */
const VIEW: EndedSummaryView = {
	title: 'Session 1 has ended',
	summaryLine:
		'2 h 14 min · 23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution 1.1 passed',
	primary: 'start',
	startLabel: 'Start Session 2',
	awardsHref: `${ROOM}/awards` as ResolvedPathname,
	recordHref: `${ROOM}/motions?session=session-1` as ResolvedPathname,
	notesHref: `${ROOM}/notes/sessions/session-1` as ResolvedPathname,
	editDelegationsHref: null,
	nextOnSchedule: 'Session 2 · 09:30, Council Chamber'
};

/** The screen's filled controls: they carry the dark blue. */
function filledControls(): Element[] {
	return [...document.querySelectorAll('a.bg-primary, button.bg-primary')];
}

describe('EndedSummary', () => {
	it('names the session that ended as the page heading, with its length and record in one line', () => {
		render(EndedSummary, { props: { view: VIEW } });

		const heading = screen.getByRole('heading', { level: 1, name: 'Session 1 has ended' });

		expect(heading.getAttribute('tabindex')).toBe('-1');
		expect(heading.id).toBe('ended-heading');
		expect(screen.getByText(VIEW.summaryLine)).toBeTruthy();
	});

	it('on an earlier day starts the next session, with awards, the record and the notes beside it', () => {
		render(EndedSummary, { props: { view: VIEW } });

		const start = screen.getByRole('button', { name: 'Start Session 2' });

		expect(filledControls()).toEqual([start]);
		expect(start.closest('form')?.getAttribute('action')).toBe('?/startSession');
		expect(screen.getByRole('link', { name: 'Propose awards' }).getAttribute('href')).toBe(
			`${ROOM}/awards`
		);
		expect(screen.getByRole('link', { name: 'Session record' }).getAttribute('href')).toBe(
			`${ROOM}/motions?session=session-1`
		);
		expect(screen.getByRole('link', { name: 'Session notes' }).getAttribute('href')).toBe(
			`${ROOM}/notes/sessions/session-1`
		);
		expect(
			screen.getByText('Next on the schedule: Session 2 · 09:30, Council Chamber')
		).toBeTruthy();
	});

	it('on the last day makes "Propose awards" the step and another session a plain link', () => {
		const lastDay = {
			...VIEW,
			primary: 'awards' as const,
			startLabel: 'Start another session',
			nextOnSchedule: null
		};
		render(EndedSummary, { props: { view: lastDay } });

		const awards = screen.getByRole('link', { name: 'Propose awards' });
		const another = screen.getByRole('button', { name: 'Start another session' });

		expect(filledControls()).toEqual([awards]);
		expect(another.className).not.toContain('bg-primary');
		expect(screen.getAllByRole('link', { name: 'Propose awards' })).toHaveLength(1);
	});

	it('after a practice session has no filled button and no awards (R19)', () => {
		const practice = {
			...VIEW,
			title: 'Practice session has ended',
			primary: 'none' as const,
			startLabel: 'Start another practice session',
			awardsHref: null
		};
		render(EndedSummary, { props: { view: practice } });

		expect(screen.getByRole('button', { name: 'Start another practice session' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Propose awards' })).toBeNull();
		expect(filledControls()).toEqual([]);
	});

	it('in a quick session offers the next session, the record and "Edit delegations" only', () => {
		const quick = {
			...VIEW,
			awardsHref: null,
			notesHref: null,
			editDelegationsHref: '/quick/quick-abcdefghij/delegations' as ResolvedPathname,
			nextOnSchedule: null
		};
		render(EndedSummary, { props: { view: quick } });

		expect(screen.getByRole('button', { name: 'Start Session 2' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Session record' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Edit delegations' }).getAttribute('href')).toBe(
			'/quick/quick-abcdefghij/delegations'
		);
		expect(screen.queryByRole('link', { name: 'Propose awards' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Session notes' })).toBeNull();
		expect(screen.queryByText(/Next on the schedule/)).toBeNull();
	});
});
