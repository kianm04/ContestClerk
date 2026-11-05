import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type {
	ApplicationListConference,
	ApplicationListEntry,
	MyApplicationListItem,
	MyDelegationListItem
} from '$lib/applications';
import ApplicationRow from './ApplicationRow.svelte';

/** The moment every row is drawn at: a fortnight before the conference closes its applications. */
const NOW = new Date('2026-10-20T12:00:00Z');

/** The conference an application row or a delegation row names. */
function makeConference(
	overrides: Partial<ApplicationListConference> = {}
): ApplicationListConference {
	return {
		id: 'conference-1',
		slug: 'bermun-2026',
		name: 'BERMUN 2026',
		organizationName: 'Sample Europe MUN Network',
		logoPath: null,
		bannerPath: null,
		startDate: '2026-12-25',
		endDate: '2026-12-29',
		timezone: 'Europe/Berlin',
		isArchived: false,
		applicationsCloseAt: '2026-11-03T22:00:00Z',
		city: 'Berlin',
		venueName: null,
		locationMode: 'in_person',
		...overrides
	};
}

/** One application of the reader's own, as an entry on the merged list. */
function makeApplicationEntry(
	overrides: Partial<MyApplicationListItem> = {}
): ApplicationListEntry {
	const application: MyApplicationListItem = {
		id: 'application-1',
		status: 'submitted',
		submittedAt: '2026-10-02T09:00:00Z',
		updatedAt: '2026-10-02T09:00:00Z',
		conference: makeConference(),
		seat: null,
		...overrides
	};

	return { kind: 'individual', id: application.id, application };
}

/** One delegation the reader belongs to, as an entry on the same list. */
function makeDelegationEntry(overrides: Partial<MyDelegationListItem> = {}): ApplicationListEntry {
	const membership: MyDelegationListItem = {
		id: 'delegation-1',
		name: 'Rotterdam Grammar Delegation',
		status: 'submitted',
		conference: makeConference(),
		seat: null,
		...overrides
	};

	return { kind: 'delegation', id: membership.id, membership };
}

describe('ApplicationRow', () => {
	it('is one link to the application, with the conference’s name in serif and when it was sent', () => {
		render(ApplicationRow, { props: { entry: makeApplicationEntry(), now: NOW } });

		const link = screen.getByRole('link');
		const heading = within(link).getByRole('heading', { level: 3 });

		expect(screen.getAllByRole('link')).toHaveLength(1);
		expect(link.getAttribute('href')).toBe('/applications/application-1');
		expect(link.className).toContain('hover:bg-accent');
		expect(heading.textContent).toBe('BERMUN 2026');
		expect(heading.className).toContain('font-display');
		expect(within(link).getByText('Submitted 2 Oct 2026')).toBeTruthy();
	});

	it('leads a delegation row to the delegation and names it', () => {
		render(ApplicationRow, { props: { entry: makeDelegationEntry(), now: NOW } });

		expect(screen.getByRole('link').getAttribute('href')).toBe('/delegations/delegation-1');
		expect(screen.getByText('Delegation · Rotterdam Grammar Delegation')).toBeTruthy();
	});

	it('says "Under review" with an amber dot for an application waiting on the organisers', () => {
		render(ApplicationRow, { props: { entry: makeApplicationEntry(), now: NOW } });

		const word = screen.getByText('Under review');

		expect(word.querySelector('[aria-hidden="true"]')?.className).toContain('bg-warning');
	});

	it('says "Waitlisted" with an amber dot', () => {
		render(ApplicationRow, {
			props: { entry: makeApplicationEntry({ status: 'waitlisted' }), now: NOW }
		});

		expect(
			screen.getByText('Waitlisted').querySelector('[aria-hidden="true"]')?.className
		).toContain('bg-warning');
	});

	it('says "Not accepted" with a red dot for a refused application', () => {
		render(ApplicationRow, {
			props: { entry: makeApplicationEntry({ status: 'rejected' }), now: NOW }
		});

		const word = screen.getByText('Not accepted');

		expect(word.querySelector('[aria-hidden="true"]')?.className).toContain('bg-destructive');
	});

	it('says "Draft" plainly, without a dot, because grey would add nothing', () => {
		const draft = makeApplicationEntry({ status: 'draft', submittedAt: null });

		render(ApplicationRow, { props: { entry: draft, now: NOW } });

		const word = screen.getByText('Draft');

		expect(word.className).toContain('text-small');
		expect(word.querySelector('[aria-hidden="true"]')).toBeNull();
	});

	it('reads a delegation’s status as a delegation’s', () => {
		render(ApplicationRow, {
			props: { entry: makeDelegationEntry({ status: 'rejected' }), now: NOW }
		});

		expect(screen.getByText('Not accepted')).toBeTruthy();
	});

	it('draws no logo, badge or arrow: the name, the line and the word are the row', () => {
		const { container } = render(ApplicationRow, {
			props: { entry: makeApplicationEntry(), now: NOW }
		});

		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('svg')).toBeNull();
		expect(container.textContent).not.toContain('Sample Europe MUN Network');
	});
});
