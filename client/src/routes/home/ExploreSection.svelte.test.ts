import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { Conference } from '$lib/conferences';
import ExploreSection from './ExploreSection.svelte';

/** The moment the section is drawn at; every conference below is open for applications then. */
const NOW = new Date('2026-06-01T12:00:00Z');

/**
 * One published conference, as the directory lists it. Each card below spreads
 * it and overrides only its name and address, so a new field on `Conference`
 * is added in one place.
 */
function makeConference(overrides: Partial<Conference> = {}): Conference {
	return {
		id: '11111111-1111-1111-1111-111111111111',
		slug: 'thimun-2027',
		name: 'The Hague International MUN',
		description: null,
		organizationName: 'Stichting THIMUN',
		organizationSlug: 'stichting-thimun',
		city: 'The Hague',
		countryCode: 'NL',
		countryName: 'Netherlands',
		locationMode: 'in_person',
		venueStatus: 'tba',
		conferenceTimeStatus: 'tba',
		startTime: null,
		endTime: null,
		feeStatus: 'undecided',
		applicationOpenMode: 'on_publish',
		startDate: '2027-01-24',
		endDate: '2027-01-29',
		websiteUrl: null,
		bannerPath: null,
		logoPath: null,
		level: 'high_school',
		status: 'published',
		timezone: 'Europe/Amsterdam',
		expectedDelegates: 3000,
		applicationsOpenAt: '2026-03-01T09:00:00Z',
		applicationsCloseAt: '2026-12-01T17:00:00Z',
		committeeCount: 2,
		committeeNames: ['General Assembly', 'DISEC'],
		tagline: null,
		venueName: null,
		venueAddress: null,
		contactEmail: null,
		instagramUrl: null,
		contactPhone: null,
		facebookUrl: null,
		linkedinUrl: null,
		youtubeUrl: null,
		tiktokUrl: null,
		language: 'English',
		minAge: null,
		maxAge: null,
		positionPaperRequired: false,
		positionPaperDeadline: null,
		acceptsIndividualApplications: true,
		acceptsDelegations: true,
		...overrides
	};
}

/** The three the server hands the page, closing soonest first. */
const conferences: Conference[] = [
	makeConference({
		id: 'conference-1',
		slug: 'vienna-mun-2027',
		name: 'Vienna University MUN 2027'
	}),
	makeConference({
		id: 'conference-2',
		slug: 'thimun-junior',
		name: 'The Hague International MUN Junior'
	}),
	makeConference({ id: 'conference-3', slug: 'bermun-2026', name: 'BERMUN 2026' })
];

describe('ExploreSection', () => {
	it('is a section called "Open for applications" whose title link opens the directory’s open conferences', () => {
		render(ExploreSection, { props: { conferences, now: NOW } });

		const section = screen.getByRole('region', { name: 'Open for applications' });

		expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe(
			'Open for applications'
		);
		expect(
			within(section).getByRole('link', { name: 'All conferences' }).getAttribute('href')
		).toBe('/conferences?open=1');
	});

	it('draws each conference as the directory’s card, each a link to its page', () => {
		render(ExploreSection, { props: { conferences, now: NOW } });

		const items = screen.getAllByRole('listitem');

		expect(items).toHaveLength(3);
		expect(within(items[0]).getByRole('heading', { level: 3 }).textContent).toBe(
			'Vienna University MUN 2027'
		);
		expect(within(items[0]).getByRole('link').getAttribute('href')).toBe(
			'/conferences/vienna-mun-2027'
		);
		expect(within(items[2]).getByRole('link').getAttribute('href')).toBe(
			'/conferences/bermun-2026'
		);
	});

	it('hides the third card below lg, where only two fit in a row', () => {
		render(ExploreSection, { props: { conferences, now: NOW } });

		const [first, second, third] = screen.getAllByRole('listitem');

		expect(first.className).not.toContain('hidden');
		expect(second.className).not.toContain('hidden');
		expect(third.className).toContain('hidden');
		expect(third.className).toContain('lg:block');
	});

	it('lays the cards out three across on a wide screen, every one the row’s height', () => {
		const { container } = render(ExploreSection, { props: { conferences, now: NOW } });

		const grid = container.querySelector('ul');

		expect(grid?.className).toContain('grid');
		expect(grid?.className).toContain('lg:grid-cols-3');
		for (const item of screen.getAllByRole('listitem')) {
			expect(item.className).toContain('h-full');
		}
	});

	it('puts nothing under the grid: no footnote, no sentence about organising', () => {
		render(ExploreSection, { props: { conferences, now: NOW } });

		const section = screen.getByRole('region', { name: 'Open for applications' });

		expect(section.lastElementChild?.tagName).toBe('UL');
		expect(section.textContent).not.toMatch(/Organising a conference/);
	});
});
