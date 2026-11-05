import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { openingBandLinks } from '$lib/room-opening';
import OpeningBand from './OpeningBand.svelte';

const ROOM = '/conferences/thimun-2027/committees/unsc/chair';
const TOPICS = ['Humanitarian access', 'Maritime security'];

/** The band on `chair`, before either step is done. */
const PROPS = {
	rollCall: null,
	topics: TOPICS,
	agendaTopic: null,
	links: openingBandLinks('thimun-2027', 'unsc', 'chair'),
	changeAgendaHref: `${ROOM}?agenda=change`,
	fromView: 'chair' as const
};

/** The band's filled controls: they carry the dark blue. */
function filledControls(): Element[] {
	return [...document.querySelectorAll('a.bg-primary, button.bg-primary')];
}

describe('OpeningBand', () => {
	it('is headed "Before debate", which can take the focus', () => {
		render(OpeningBand, { props: PROPS });

		const heading = screen.getByRole('heading', { level: 2, name: 'Before debate' });

		expect(heading.id).toBe('opening-heading');
		expect(heading.getAttribute('tabindex')).toBe('-1');
	});

	it('offers "Mark all present" as the one filled button, posting to the roll call with the page', () => {
		render(OpeningBand, { props: PROPS });

		const markAll = screen.getByRole('button', { name: 'Mark all present' });
		const form = markAll.closest('form');

		expect(filledControls()).toEqual([markAll]);
		expect(form?.getAttribute('action')).toBe(`${ROOM}/roll-call?/markAllPresent`);
		// No roll call is named, so the server gets or makes the session's (R2).
		expect(form?.querySelector('[name="rollCallId"]')).toBeNull();
		expect(form?.querySelector<HTMLInputElement>('[name="fromView"]')?.value).toBe('chair');
		expect(screen.getByRole('link', { name: 'Take it seat by seat' }).getAttribute('href')).toBe(
			`${ROOM}/roll-call`
		);
	});

	it('offers one outlined button per topic, each posting `setAgenda` with its own topic', () => {
		render(OpeningBand, { props: PROPS });

		const buttons = TOPICS.map((topic) => screen.getByRole('button', { name: topic }));

		expect(buttons.map((button) => button.getAttribute('value'))).toEqual(TOPICS);
		expect(buttons.every((button) => !button.className.includes('bg-primary'))).toBe(true);
		expect(buttons[0].closest('form')?.getAttribute('action')).toBe(`${ROOM}?/setAgenda`);
	});

	it('ticks each step off once done, with "Edit" and "Change", and no warning colour (P4)', () => {
		render(OpeningBand, {
			props: {
				...PROPS,
				rollCall: { presentCount: 2, availableSeats: 6, hasQuorum: false },
				agendaTopic: 'Maritime security'
			}
		});

		expect(screen.getByText('2 of 6 present · no quorum')).toBeTruthy();
		expect(screen.getByText('Maritime security')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
			`${ROOM}/roll-call`
		);
		expect(screen.getByRole('link', { name: 'Change' }).getAttribute('href')).toBe(
			`${ROOM}?agenda=change`
		);
		expect(screen.queryByRole('button', { name: 'Mark all present' })).toBeNull();
		expect(filledControls()).toEqual([]);
		expect(document.querySelector('[class*="warning"], [class*="danger"]')).toBeNull();
	});

	it('has no agenda row for a committee without topics, and one button for one topic', () => {
		const { unmount } = render(OpeningBand, { props: { ...PROPS, topics: [] } });

		expect(screen.queryByText('Agenda')).toBeNull();
		unmount();

		render(OpeningBand, { props: { ...PROPS, topics: ['Water'] } });

		expect(screen.getByRole('button', { name: 'Water' })).toBeTruthy();
	});

	it('on the GSL view names that page, so every press comes back to it', () => {
		render(OpeningBand, {
			props: { ...PROPS, links: openingBandLinks('thimun-2027', 'unsc', 'gsl'), fromView: 'gsl' }
		});

		const markAll = screen.getByRole('button', { name: 'Mark all present' });

		expect(
			markAll.closest('form')?.querySelector<HTMLInputElement>('[name="fromView"]')?.value
		).toBe('gsl');
		expect(
			screen.getByRole('button', { name: TOPICS[0] }).closest('form')?.getAttribute('action')
		).toBe(`${ROOM}?fromView=gsl&/setAgenda`);
	});
});
