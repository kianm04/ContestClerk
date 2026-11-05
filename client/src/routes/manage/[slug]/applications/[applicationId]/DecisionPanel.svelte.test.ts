import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { ReviewApplication } from '$lib/application-review';
import DecisionPanel from './DecisionPanel.svelte';

/*
	Every `ConfirmButton` reads the page's address from `$app/state`, to build
	the confirmation page it falls back to without JavaScript. Outside a running
	app there is no address, so this stand-in gives it one.
*/
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/manage/thimun-2027/applications/application-1') }
}));

/*
	jsdom, the fake browser these tests run in, has no `<dialog>` behaviour of
	its own, and both "Not accepted" and "Revoke acceptance" open a
	`ConfirmButton` dialog. These stand-ins set `open` the way a real browser
	would, matching `ConfirmButton.svelte.test.ts`.
*/
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function showModal() {
		this.open = true;
	};

	HTMLDialogElement.prototype.close = function close() {
		this.open = false;
		this.dispatchEvent(new Event('close'));
	};
});

/** An application still under review. */
const APPLICATION: ReviewApplication = {
	id: 'application-1',
	conferenceId: 'conference-1',
	status: 'submitted',
	committeePreferences: [],
	seatPreferences: null,
	motivation: null,
	answers: {},
	submittedAt: '2026-10-03T09:00:00Z',
	decidedAt: null,
	decisionNote: null,
	internalNote: null
};

// The page's instant form hands this down for real; a stand-in is enough
// here because these tests only check what is drawn, not what a submit does.
const onSubmit = vi.fn();

/** The props every test starts from, overriding only what it is about. */
const PROPS = {
	application: APPLICATION,
	timezone: 'Europe/Amsterdam',
	seat: null,
	invoice: null,
	invoiceHref: null,
	changeSeatHref: null,
	actionUrls: {
		accept: '?/accept',
		waitlist: '?/waitlist',
		reject: '?/reject',
		revoke: '?/revoke',
		saveInternalNote: '?/saveInternalNote'
	},
	canDecide: true,
	decisionNote: '',
	revokeTo: 'rejected' as const,
	error: null,
	onSubmit
};

/** An accepted application in France, with an unpaid invoice. */
const ACCEPTED_PROPS = {
	...PROPS,
	application: {
		...APPLICATION,
		status: 'accepted' as const,
		decidedAt: '2026-10-08T09:00:00Z',
		decisionNote: 'Welcome aboard.'
	},
	seat: { id: 'seat-1', name: 'France', committeeLabel: 'UNSC' },
	invoice: {
		id: 'invoice-1',
		number: 'THIMUN-0007',
		status: 'unpaid' as const,
		amountCents: 4500,
		currency: 'EUR'
	},
	invoiceHref: '/manage/thimun-2027/fees?invoice=invoice-1#invoices' as ResolvedPathname,
	changeSeatHref: '/manage/thimun-2027/allocation?seat=seat-1' as ResolvedPathname
};

describe('DecisionPanel', () => {
	it('shows a reader without decide_applications the decision and nothing to press', () => {
		const { container } = render(DecisionPanel, {
			props: { ...ACCEPTED_PROPS, canDecide: false }
		});

		expect(screen.getByText('Welcome aboard.')).toBeTruthy();
		expect(screen.getByText('France')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Revoke acceptance' })).toBeNull();
		expect(container.querySelector('form')).toBeNull();
	});

	it('gives a reader without decide_applications no Waitlist or Not accepted', () => {
		render(DecisionPanel, { props: { ...PROPS, canDecide: false } });

		expect(screen.queryByRole('button', { name: 'Waitlist' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Not accepted' })).toBeNull();
	});

	it('offers Waitlist and Not accepted for a submitted application', () => {
		const { container } = render(DecisionPanel, { props: PROPS });

		expect(screen.getByRole('button', { name: 'Waitlist' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Not accepted' })).toBeTruthy();
		expect(container.querySelector('form[action="?/waitlist"]')).toBeTruthy();
	});

	it('points each note label at its own box, though both boxes send `decisionNote`', () => {
		render(DecisionPanel, { props: PROPS });

		const waitlistNote = screen.getByLabelText('Note to the applicant (optional)');
		const rejectNote = screen.getByLabelText('Why not? The applicant reads this.');

		expect(waitlistNote).not.toBe(rejectNote);
		expect(waitlistNote.getAttribute('name')).toBe('decisionNote');
		expect(rejectNote.getAttribute('name')).toBe('decisionNote');
	});

	it('leaves Waitlist out for an application already on the waiting list', () => {
		render(DecisionPanel, {
			props: { ...PROPS, application: { ...APPLICATION, status: 'waitlisted' } }
		});

		expect(screen.queryByRole('button', { name: 'Waitlist' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Not accepted' })).toBeTruthy();
	});

	it('shows an accepted applicant’s seat, invoice, Change seat and Revoke', () => {
		render(DecisionPanel, { props: ACCEPTED_PROPS });

		expect(screen.getByText('France')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Invoice THIMUN-0007' }).getAttribute('href')).toBe(
			ACCEPTED_PROPS.invoiceHref
		);
		expect(screen.getByRole('link', { name: 'Change seat' }).getAttribute('href')).toBe(
			ACCEPTED_PROPS.changeSeatHref
		);
		expect(screen.getByRole('button', { name: 'Revoke acceptance' })).toBeTruthy();
		expect(screen.getByText('Welcome aboard.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Not accepted' })).toBeNull();
	});

	it('offers nothing to do for a rejected application, and shows what the applicant was told', () => {
		render(DecisionPanel, {
			props: {
				...PROPS,
				application: {
					...APPLICATION,
					status: 'rejected',
					decidedAt: '2026-10-08T09:00:00Z',
					decisionNote: 'We are full this year.'
				}
			}
		});

		expect(screen.getByText('We are full this year.')).toBeTruthy();
		expect(screen.getByText(/^Decided/)).toBeTruthy();
		expect(screen.queryAllByRole('button')).toHaveLength(0);
	});

	it('shows why the last post was refused', () => {
		render(DecisionPanel, {
			props: { ...PROPS, error: 'This application was already decided.' }
		});

		expect(screen.getByText('This application was already decided.')).toBeTruthy();
	});
});
