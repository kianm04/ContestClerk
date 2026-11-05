import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ProgrammeRowData } from '$lib/home-rows';
import { conferenceScheduleUrl } from '$lib/urls';
import ProgrammeRow from './ProgrammeRow.svelte';

/** A row of "Today's programme": the time alone, the room alone, running now. */
const todayRow: ProgrammeRowData = {
	id: 'event-1',
	href: conferenceScheduleUrl('riverside-mun-2027', { day: '2027-02-12' }),
	when: '09:00 – 12:30',
	title: 'Committee session 3',
	meta: 'Room 2.04',
	isNow: true
};

/** A row of "Programme" on an ordinary day: the day as well, and the conference. */
const laterRow: ProgrammeRowData = {
	id: 'event-2',
	href: conferenceScheduleUrl('riverside-mun-2027', { day: '2027-02-13' }),
	when: 'Tomorrow · 09:00 – 10:30',
	title: 'Opening ceremony',
	meta: 'Aula · Riverside MUN 2027',
	isNow: false
};

describe('ProgrammeRow', () => {
	it("is one link to the conference's programme on the event's day", () => {
		const { container } = render(ProgrammeRow, { props: { row: todayRow } });

		const links = screen.getAllByRole('link');

		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('href')).toBe(
			'/conferences/riverside-mun-2027/schedule?day=2027-02-12'
		);
		expect(container.querySelector('li')).not.toBeNull();
	});

	it('shows when the event is, what it is and where', () => {
		const { container } = render(ProgrammeRow, { props: { row: laterRow } });

		expect(container.textContent).toContain('Tomorrow · 09:00 – 10:30');
		expect(container.textContent).toContain('Opening ceremony');
		expect(container.textContent).toContain('Aula · Riverside MUN 2027');
	});

	it('marks the event in progress "Now" with a light-blue dot', () => {
		const { container } = render(ProgrammeRow, { props: { row: todayRow } });

		expect(screen.getByText('Now')).toBeTruthy();
		expect(container.querySelector('.rounded-full')?.className).toContain('bg-ring');
	});

	it('says nothing beside an event that is not running', () => {
		const { container } = render(ProgrammeRow, { props: { row: laterRow } });

		expect(screen.queryByText('Now')).toBeNull();
		expect(container.querySelector('.rounded-full')).toBeNull();
	});

	it('leaves the second line out when there is nothing to say', () => {
		const { container } = render(ProgrammeRow, { props: { row: { ...todayRow, meta: null } } });

		expect(container.querySelectorAll('p')).toHaveLength(2);
	});

	it('gives a time on its own the narrow column, and a day and time the wide one', () => {
		render(ProgrammeRow, { props: { row: todayRow } });
		render(ProgrammeRow, { props: { row: laterRow } });

		expect(screen.getByText('09:00 – 12:30').className).toContain('sm:w-[9rem]');
		expect(screen.getByText('Tomorrow · 09:00 – 10:30').className).toContain('sm:w-[13rem]');
	});

	it('sets the time in tabular figures', () => {
		render(ProgrammeRow, { props: { row: todayRow } });

		expect(screen.getByText('09:00 – 12:30').className).toContain('tabular-nums');
	});
});
