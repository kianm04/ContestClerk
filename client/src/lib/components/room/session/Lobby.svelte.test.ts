import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { LobbyView } from '$lib/room-ready';
import Lobby from './Lobby.svelte';

const ROOM = '/conferences/northbridge/committees/unsc/chair';

/** Day 2 of 3 of a conference committee, after Session 1. */
const VIEW: LobbyView = {
	committeeName: 'Security Council',
	whereLine: 'Northbridge MUN · Council Chamber · day 2 of 3',
	sessionName: 'Session 2',
	startLabel: 'Start Session 2',
	isPracticeSession: false,
	agendaLine: 'Agenda carries over: Humanitarian access in armed conflict',
	seatsLine: '6 seats · 6 delegates assigned',
	hasSeats: true,
	addSeatsHref: null,
	lastSession: {
		summary: 'Session 1 · ended yesterday at 17:40 · 2 h 14 min',
		recordLine: '23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution 1.1 passed',
		recordHref: `${ROOM}/motions?session=session-1` as ResolvedPathname
	},
	nextOnSchedule: 'Session 2 · 09:30, Council Chamber',
	editDelegationsHref: null
};

/** The screen's filled controls: they carry the dark blue. */
function filledControls(): Element[] {
	return [...document.querySelectorAll('a.bg-primary, button.bg-primary')];
}

describe('Lobby', () => {
	it('names the committee as the page heading, with where and when it meets', () => {
		render(Lobby, { props: { view: VIEW } });

		expect(screen.getByRole('heading', { level: 1, name: 'Security Council' })).toBeTruthy();
		expect(screen.getByText('Northbridge MUN · Council Chamber · day 2 of 3')).toBeTruthy();
	});

	it('offers the next session as the one filled button, with the agenda and the seats', () => {
		render(Lobby, { props: { view: VIEW } });

		const start = screen.getByRole('button', { name: 'Start Session 2' });

		expect(screen.getByRole('heading', { level: 2, name: 'Session 2' })).toBeTruthy();
		expect(filledControls()).toEqual([start]);
		expect(start.closest('form')?.getAttribute('action')).toBe('?/startSession');
		expect(screen.getByText(VIEW.agendaLine ?? '')).toBeTruthy();
		expect(screen.getByText('6 seats · 6 delegates assigned')).toBeTruthy();
	});

	it('renames the session through a field the start form sends, behind "Rename this session"', () => {
		render(Lobby, { props: { view: VIEW } });

		const field = screen.getByLabelText('Session name');
		const startForm = screen.getByRole('button', { name: 'Start Session 2' }).closest('form');

		expect(screen.getByText('Rename this session').closest('details')).toBeTruthy();
		expect(field.getAttribute('name')).toBe('name');
		expect(field.getAttribute('form')).toBe(startForm?.id);
		expect(field.getAttribute('placeholder')).toBe('Session 2');
	});

	it('shows the last session with its record, and the next event on the schedule', () => {
		render(Lobby, { props: { view: VIEW } });

		expect(screen.getByText(VIEW.lastSession?.summary ?? '')).toBeTruthy();
		expect(screen.getByText(VIEW.lastSession?.recordLine ?? '')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Session record →' }).getAttribute('href')).toBe(
			`${ROOM}/motions?session=session-1`
		);
		expect(screen.getByText('Session 2 · 09:30, Council Chamber')).toBeTruthy();
		// Papers waiting for review stay on `/home`; the lobby is not a dashboard.
		expect(screen.queryByText(/paper/i)).toBeNull();
	});

	it('before the first day starts a practice session and says why the numbering waits', () => {
		const practice = {
			...VIEW,
			sessionName: 'Practice session',
			startLabel: 'Start a practice session',
			isPracticeSession: true,
			lastSession: null,
			nextOnSchedule: null
		};
		render(Lobby, { props: { view: practice } });

		expect(screen.getByRole('button', { name: 'Start a practice session' })).toBeTruthy();
		expect(screen.getByText(/Practice sessions do not count towards Session 1/)).toBeTruthy();
		expect(screen.queryByText('Last session')).toBeNull();
	});

	it('without seats says so in plain ink, disables the start, and offers an organiser "Add seats"', () => {
		const empty = {
			...VIEW,
			seatsLine: 'This committee has no seats yet.',
			hasSeats: false,
			addSeatsHref: '/manage/northbridge/committees/committee-1' as ResolvedPathname
		};
		render(Lobby, { props: { view: empty } });

		const sentence = screen.getByText('This committee has no seats yet.');

		expect(sentence.className).not.toMatch(/warning|danger/);
		expect(screen.getByRole('button', { name: 'Start Session 2' }).hasAttribute('disabled')).toBe(
			true
		);
		expect(screen.getByRole('link', { name: 'Add seats' }).getAttribute('href')).toBe(
			'/manage/northbridge/committees/committee-1'
		);
	});

	it('draws a quick session’s lobby with "Edit delegations" and no conference line', () => {
		const quick = {
			...VIEW,
			whereLine: null,
			seatsLine: '12 delegations',
			nextOnSchedule: null,
			editDelegationsHref: '/quick/quick-ab12cd34ef/delegations' as ResolvedPathname
		};
		render(Lobby, { props: { view: quick } });

		const edit = screen.getByRole('link', { name: 'Edit delegations' });

		expect(edit.getAttribute('href')).toBe('/quick/quick-ab12cd34ef/delegations');
		expect(filledControls()).toEqual([screen.getByRole('button', { name: 'Start Session 2' })]);
		expect(screen.getByText('12 delegations')).toBeTruthy();
		expect(screen.queryByText(/Northbridge MUN/)).toBeNull();
		expect(screen.queryByText('Next on the schedule')).toBeNull();
	});
});
