import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { HomeAnnouncement } from '$lib/home';
import AnnouncementRow from './AnnouncementRow.svelte';

/** The moment every row is drawn at: midday on 30 October 2026, in Amsterdam. */
const NOW = new Date('2026-10-30T12:00:00Z');

const announcement: HomeAnnouncement = {
	id: 'announcement-1',
	title: 'Position papers are due on 25 July',
	publishedAt: '2026-10-27T09:00:00Z',
	conferenceName: 'Amsterdam Open MUN 2027',
	conferenceSlug: 'amsterdam-open-mun-2027',
	conferenceTimezone: 'Europe/Amsterdam'
};

describe('AnnouncementRow', () => {
	it("is one link to the conference's announcements", () => {
		const { container } = render(AnnouncementRow, { props: { announcement, now: NOW } });

		const links = screen.getAllByRole('link');

		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('href')).toBe(
			'/conferences/amsterdam-open-mun-2027/announcements'
		);
		expect(container.querySelector('li')).not.toBeNull();
	});

	it('names the announcement, its conference and how long ago it was published', () => {
		render(AnnouncementRow, { props: { announcement, now: NOW } });

		expect(screen.getByText('Position papers are due on 25 July')).toBeTruthy();
		expect(screen.getByText('Amsterdam Open MUN 2027 · 3 days ago')).toBeTruthy();
	});

	it('writes the date instead once the announcement is a week old', () => {
		render(AnnouncementRow, {
			props: { announcement: { ...announcement, publishedAt: '2026-10-20T09:00:00Z' }, now: NOW }
		});

		expect(screen.getByText('Amsterdam Open MUN 2027 · 20 Oct 2026')).toBeTruthy();
	});

	it('shows the title and one line under it, with no badge and no body', () => {
		const { container } = render(AnnouncementRow, { props: { announcement, now: NOW } });

		expect(container.querySelectorAll('p')).toHaveLength(2);
		expect(container.querySelector('svg, .rounded-full')).toBeNull();
	});
});
