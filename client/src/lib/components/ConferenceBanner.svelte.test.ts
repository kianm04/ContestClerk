import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Conference } from '$lib/conferences';
import ConferenceBanner from './ConferenceBanner.svelte';

/** A conference with no banner picture, which is the interesting case. */
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
	expectedDelegates: null,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 0,
	committeeNames: [],
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

describe('ConferenceBanner', () => {
	it('shows the conference initials when there is no picture', () => {
		render(ConferenceBanner, { props: { conference } });

		expect(screen.getByText('TH')).toBeTruthy();
	});

	it('reads out the conference name whether or not there is a picture', () => {
		render(ConferenceBanner, { props: { conference } });

		expect(screen.getByRole('img', { name: 'The Hague International MUN' })).toBeTruthy();
	});

	it('shows the picture when the conference has one', () => {
		const withBanner = { ...conference, bannerPath: 'conferences/11111111/banner-a1.jpg' };

		render(ConferenceBanner, { props: { conference: withBanner } });

		const image = screen.getByRole('img', { name: 'The Hague International MUN' });

		expect(image.getAttribute('src')).toContain('conferences/11111111/banner-a1.jpg');
	});

	it('is shorter in the card shape than on the conference page', () => {
		render(ConferenceBanner, { props: { conference, aspect: 'card' } });

		expect(screen.getByRole('img', { name: 'The Hague International MUN' }).className).toContain(
			'aspect-[5/2]'
		);
	});

	it('gives a card the same shape with a picture as without one, so a row lines up', () => {
		const withBanner = { ...conference, bannerPath: 'conferences/11111111/banner-a1.jpg' };

		render(ConferenceBanner, { props: { conference: withBanner, aspect: 'card' } });

		expect(screen.getByRole('img', { name: 'The Hague International MUN' }).className).toContain(
			'aspect-[5/2]'
		);
	});

	it('is 3:1 in the listing shape, with a picture and without one', () => {
		const withBanner = { ...conference, bannerPath: 'conferences/11111111/banner-a1.jpg' };

		const { unmount } = render(ConferenceBanner, { props: { conference, aspect: 'listing' } });

		expect(screen.getByRole('img', { name: 'The Hague International MUN' }).className).toContain(
			'aspect-[3/1]'
		);

		unmount();
		render(ConferenceBanner, { props: { conference: withBanner, aspect: 'listing' } });

		expect(screen.getByRole('img', { name: 'The Hague International MUN' }).className).toContain(
			'aspect-[3/1]'
		);
	});

	it('draws the initials lower than a picture on a wide screen', () => {
		render(ConferenceBanner, { props: { conference, aspect: 'wide' } });

		expect(screen.getByRole('img', { name: 'The Hague International MUN' }).className).toContain(
			'md:aspect-[4/1]'
		);
	});
});
