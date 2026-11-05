import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Conference } from '$lib/conferences';
import ConferenceCard from './ConferenceCard.svelte';

/**
 * The moment every test below draws the card at.
 *
 * The card takes `now` as a prop rather than reading the clock, so the tests can
 * pin it here. A fixed moment also means the applications pill says the same
 * thing in a year's time as it does today.
 */
const NOW = new Date('2026-06-01T12:00:00Z');

/**
 * One conference the tests start from. Each test spreads it and overrides only
 * the field it is about, so a new field on `Conference` is added in one place.
 *
 * Its application window is open at `NOW`.
 */
const conference: Conference = {
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
	committeeCount: 8,
	committeeNames: ['General Assembly', 'DISEC', 'SPECPOL', 'ECOSOC', 'UNHRC', 'UNEP', 'WHO', 'ICJ'],
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
	acceptsDelegations: true
};

/**
 * The words of every committee chip on the card, in the order they are drawn.
 *
 * The chips share their row with words only a screen reader hears, "Committees:",
 * so the chips are every other child of that row.
 */
function chipTexts(): string[] {
	const label = screen.getByText('Committees:');
	const chips = Array.from(label.parentElement?.children ?? []).filter((chip) => chip !== label);

	return chips.map((chip) => chip.textContent?.trim() ?? '');
}

describe('ConferenceCard', () => {
	it('links to the conference page', () => {
		render(ConferenceCard, { props: { conference, now: NOW } });

		expect(screen.getByRole('link').getAttribute('href')).toBe('/conferences/thimun-2027');
	});

	it('shows the name, the organiser, the dates and where it is', () => {
		const { container } = render(ConferenceCard, { props: { conference, now: NOW } });

		expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
			'The Hague International MUN'
		);
		expect(screen.getByText('Stichting THIMUN')).toBeTruthy();
		expect(container.textContent).toContain('24 – 29 Jan 2027');
		expect(screen.getByText('The Hague, Netherlands')).toBeTruthy();
	});

	it('leaves the organiser line out when the organisation could not be found', () => {
		const withoutOrganization = { ...conference, organizationName: null };

		const { container } = render(ConferenceCard, {
			props: { conference: withoutOrganization, now: NOW }
		});

		expect(container.querySelectorAll('h3 + p')).toHaveLength(0);
	});

	it('draws the banner at 3:1, as the directory card does, never 2:1', () => {
		render(ConferenceCard, { props: { conference, now: NOW } });

		const banner = screen.getByRole('img', { name: 'The Hague International MUN' });

		expect(banner.className).toContain('aspect-[3/1]');
		expect(banner.className).not.toContain('aspect-[2/1]');
	});

	it('puts the applications pill on the banner, as the mockup does (Trello WMcXfry0)', () => {
		render(ConferenceCard, { props: { conference, now: NOW } });

		const banner = screen.getByRole('img', { name: 'The Hague International MUN' });
		const pill = screen.getByText('Applications open');

		expect(banner.parentElement?.contains(pill)).toBe(true);
	});

	it('shows "Closing soon" in the last days before the closing day', () => {
		const closingSoon = { ...conference, applicationsCloseAt: '2026-06-05T15:00:00Z' };

		render(ConferenceCard, { props: { conference: closingSoon, now: NOW } });

		expect(screen.getByText('Closing soon')).toBeTruthy();
	});

	it('shows the opening date while the window is still ahead', () => {
		const opensLater = {
			...conference,
			applicationsOpenAt: '2026-11-03T09:00:00Z',
			applicationsCloseAt: '2026-12-01T17:00:00Z'
		};

		render(ConferenceCard, { props: { conference: opensLater, now: NOW } });

		expect(screen.getByText('Opens 3 Nov 2026')).toBeTruthy();
	});

	it('shows "Applications closed" once the window has closed', () => {
		const alreadyClosed = {
			...conference,
			applicationsOpenAt: '2026-01-01T09:00:00Z',
			applicationsCloseAt: '2026-02-01T17:00:00Z'
		};

		render(ConferenceCard, { props: { conference: alreadyClosed, now: NOW } });

		expect(screen.getByText('Applications closed')).toBeTruthy();
	});

	it('shows the level and the delegates on one line', () => {
		render(ConferenceCard, { props: { conference, now: NOW } });

		expect(screen.getByText('High school · 3000+ delegates')).toBeTruthy();
	});

	it('rounds the delegates down, so the "+" stays true', () => {
		const withDelegates = { ...conference, expectedDelegates: 237 };

		render(ConferenceCard, { props: { conference: withDelegates, now: NOW } });

		expect(screen.getByText('High school · 200+ delegates')).toBeTruthy();
	});

	it('shows the level alone when the organisers have not said how many delegates', () => {
		const withoutDelegates = { ...conference, expectedDelegates: null };

		render(ConferenceCard, { props: { conference: withoutDelegates, now: NOW } });

		expect(screen.getByText('High school')).toBeTruthy();
	});

	it('names the first two committees and counts the rest', () => {
		render(ConferenceCard, { props: { conference, now: NOW } });

		expect(chipTexts()).toEqual(['General Assembly', 'DISEC', '+6']);
	});

	it('draws no committee chips for a conference without committees', () => {
		const withoutCommittees = { ...conference, committeeCount: 0, committeeNames: [] };

		render(ConferenceCard, { props: { conference: withoutCommittees, now: NOW } });

		expect(screen.queryByText('Committees:')).toBeNull();
	});

	it('shows the reader’s role in the pill’s place', () => {
		const { container } = render(ConferenceCard, {
			props: { conference, now: NOW, role: 'Delegate' }
		});

		const banner = screen.getByRole('img', { name: 'The Hague International MUN' });

		expect(banner.parentElement?.contains(screen.getByText('Delegate'))).toBe(true);
		expect(container.textContent).not.toContain('Applications open');
	});

	it('shows no role badge unless the reader has a role at this conference', () => {
		const { container } = render(ConferenceCard, { props: { conference, now: NOW } });

		expect(container.textContent).not.toContain('Delegate');
	});

	it('tells a screen reader it leads to applying while applications are open', () => {
		render(ConferenceCard, { props: { conference, now: NOW } });

		const hiddenWords = screen.getByText('View and apply');

		expect(hiddenWords.classList.contains('sr-only')).toBe(true);
		expect(screen.getByRole('link').textContent).toContain('View and apply');
	});

	it('tells a screen reader it leads to the conference once applications have closed', () => {
		const alreadyClosed = {
			...conference,
			applicationsOpenAt: '2026-01-01T09:00:00Z',
			applicationsCloseAt: '2026-02-01T17:00:00Z'
		};

		render(ConferenceCard, { props: { conference: alreadyClosed, now: NOW } });

		expect(screen.getByText('View conference').classList.contains('sr-only')).toBe(true);
		expect(screen.queryByText('View and apply')).toBeNull();
	});

	it('does not ask a reader who already has a role here to apply', () => {
		render(ConferenceCard, { props: { conference, now: NOW, role: 'Delegate' } });

		expect(screen.getByText('View conference')).toBeTruthy();
	});
});
