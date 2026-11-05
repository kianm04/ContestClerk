import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ApplyPanelState, Conference } from '$lib/conferences';
import { applyUrl, delegationUrl, newDelegationUrl } from '$lib/urls';
import ApplyPanel from './ApplyPanel.svelte';

/*
	A component test outside `src/lib/components`, as `register/page.svelte.test.ts` is.
	`specs/02-architecture/testing.md` puts a component's test next to the
	component, and this panel belongs to this route alone, so its test belongs
	here too.

	It is a component test rather than a browser one because the case it covers
	cannot be built in a browser. It needs a published conference with an open
	application window, which means dates in the future, and every such
	conference is listed in the directory, where `tests/e2e/conferences.spec.ts`
	asserts "Showing 1-12 of {the seeded count}" and "Page 1 of 2".
*/

/**
 * A conference for the panel to be drawn against.
 *
 * Only `slug` is ever read, and only by the `seated` state, but the prop is a
 * whole `Conference`, so the fixture is one.
 */
const CONFERENCE: Conference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: 'The oldest Model United Nations conference in Europe.',
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
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
	websiteUrl: 'https://thimun.org',
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: 3000,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 8,
	committeeNames: [],
	tagline: 'Where the world meets in The Hague.',
	venueName: 'World Forum The Hague',
	venueAddress: 'Churchillplein 10, 2517 JW The Hague',
	contactEmail: 'info@thimun.org',
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: 14,
	maxAge: 19,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** Applications are open, and this conference takes both routes in. */
const OPEN: ApplyPanelState = {
	kind: 'open',
	closesOn: '15 Dec 2026',
	paperDueOn: null,
	acceptsIndividuals: true,
	acceptsDelegations: true
};

/** Both buttons need an address, and the page above works each one out. */
const BOTH_HREFS = {
	applyHref: applyUrl(CONFERENCE.slug),
	registerDelegationHref: newDelegationUrl(CONFERENCE.slug)
};

describe('ApplyPanel', () => {
	it('offers both buttons while the conference takes both', () => {
		render(ApplyPanel, { props: { state: OPEN, conference: CONFERENCE, ...BOTH_HREFS } });

		expect(screen.getByText('Apply as a delegate')).toBeTruthy();
		expect(screen.getByText('Register a delegation')).toBeTruthy();
		expect(screen.getByText('Closes 15 Dec 2026')).toBeTruthy();
	});

	it('says who each way in is for, with only "Apply as a delegate" filled', () => {
		// `05-pages/public/conference.md`, "Two ways to take part, told apart".
		render(ApplyPanel, { props: { state: OPEN, conference: CONFERENCE, ...BOTH_HREFS } });

		expect(screen.getByText('On your own')).toBeTruthy();
		expect(screen.getByText('With your school or club')).toBeTruthy();
		expect(
			screen.getByText('One person registers the group and shares a join code with the others.')
		).toBeTruthy();

		// `bg-primary` is the filled look of a primary `Button`.
		const apply = screen.getByRole('link', { name: 'Apply as a delegate' });
		const register = screen.getByRole('link', { name: 'Register a delegation' });

		expect(apply.className).toContain('bg-primary');
		expect(register.className).not.toContain('bg-primary');
	});

	it("makes the phone bar's delegation a plain link under the one filled button", () => {
		render(ApplyPanel, {
			props: { state: OPEN, conference: CONFERENCE, ...BOTH_HREFS, isCompact: true }
		});

		const register = screen.getByRole('link', { name: 'Register a delegation' });

		expect(screen.getByText(/With a school or club\?/)).toBeTruthy();
		expect(screen.queryByText('On your own')).toBeNull();
		// A plain link has none of a button's border or fill.
		expect(register.className).not.toContain('border');
		expect(register.className).not.toContain('bg-primary');
		expect(screen.getByRole('link', { name: 'Apply as a delegate' }).className).toContain(
			'bg-primary'
		);
	});

	it('leaves the apply button out when the conference takes delegations only', () => {
		// `05-pages/public/conference.md`'s "accepting, one route off | only the
		// enabled button". The badge and the closing date stay; the button that
		// would dead-end on `canApply`'s refusal goes.
		render(ApplyPanel, {
			props: {
				state: { ...OPEN, acceptsIndividuals: false },
				conference: CONFERENCE,
				...BOTH_HREFS
			}
		});

		expect(screen.queryByText('Apply as a delegate')).toBeNull();
		expect(screen.getByText('Register a delegation')).toBeTruthy();
		expect(screen.getByText('Applications open')).toBeTruthy();
		expect(screen.getByText('Closes 15 Dec 2026')).toBeTruthy();
	});

	it('leaves the delegation button out when the conference takes individuals only', () => {
		render(ApplyPanel, {
			props: {
				state: { ...OPEN, acceptsDelegations: false },
				conference: CONFERENCE,
				...BOTH_HREFS
			}
		});

		expect(screen.getByText('Apply as a delegate')).toBeTruthy();
		expect(screen.queryByText('Register a delegation')).toBeNull();
	});

	it('shows a conference taking neither route the badge and nothing to press', () => {
		render(ApplyPanel, {
			props: {
				state: { ...OPEN, acceptsIndividuals: false, acceptsDelegations: false },
				conference: CONFERENCE,
				...BOTH_HREFS
			}
		});

		expect(screen.queryByText('Apply as a delegate')).toBeNull();
		expect(screen.queryByText('Register a delegation')).toBeNull();
		expect(screen.getByText('Applications open')).toBeTruthy();
		expect(screen.getByText('Closes 15 Dec 2026')).toBeTruthy();
	});

	it('links the delegation somebody is already in to its own page', () => {
		render(ApplyPanel, {
			props: {
				state: {
					kind: 'delegation',
					delegationId: 'delegation-delft',
					delegationName: 'Delft University'
				},
				conference: CONFERENCE,
				...BOTH_HREFS
			}
		});

		const link = screen.getByRole('link', { name: 'Delft University' });

		expect(link.getAttribute('href')).toBe(delegationUrl('delegation-delft'));
	});
});
