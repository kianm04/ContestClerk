import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { OrganiserDelegation } from '$lib/delegation-review';
import DelegationDecision from './DelegationDecision.svelte';

/*
	Every `ConfirmButton` reads the page's address from `$app/state`, to build
	the confirmation page it falls back to without JavaScript. Outside a running
	app there is no address, so this stand-in gives it one.
*/
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/manage/thimun-2027/delegations/delegation-1') }
}));

/*
	jsdom, the fake browser these tests run in, has no `<dialog>` behaviour of
	its own: the "Not accepted" button opens a `ConfirmButton` dialog, and
	jsdom's `showModal()`/`close()` simply do not exist there. These stand-ins
	set the `open` property the way a real browser would, matching
	`ConfirmButton.svelte.test.ts`.
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

/** A delegation still under review, not yet decided. */
const DELEGATION: OrganiserDelegation = {
	id: 'delegation-lycee',
	conferenceId: 'conference-thimun',
	name: 'Lycée Français Delegation',
	institutionName: 'Lycée Français de La Haye',
	countryCode: 'FR',
	status: 'submitted',
	requestedSeats: 12,
	note: 'We arrive by train on the Friday evening.',
	submittedAt: '2026-09-10T09:00:00Z',
	decidedAt: null,
	decisionNote: null,
	internalNote: null
};

/** A stand-in for the page's instant form, which the "Not accepted" button posts through. */
const onSubmit = vi.fn();

/** The props every test starts from, overriding only what it is about. */
const PROPS = {
	delegation: DELEGATION,
	timezone: 'Europe/Amsterdam',
	canReject: true,
	canEditNote: true,
	internalNote: '',
	internalNoteError: null as string | null,
	onSubmit
};

describe('DelegationDecision', () => {
	it('posts the internal note to saveInternalNote and shows the note last saved', () => {
		const { container } = render(DelegationDecision, {
			props: { ...PROPS, internalNote: 'Wants window seats.' }
		});

		const form = container.querySelector('form[action="?/saveInternalNote"]');
		expect(form).toBeTruthy();

		const textarea = container.querySelector(
			'textarea[name="internalNote"]'
		) as HTMLTextAreaElement;
		expect(textarea.value).toBe('Wants window seats.');
	});

	it('shows a reader who may not decide the saved note, with no form', () => {
		const { container } = render(DelegationDecision, {
			props: { ...PROPS, canReject: false, canEditNote: false, internalNote: 'Late arrival.' }
		});

		expect(screen.getByText('Late arrival.')).toBeTruthy();
		expect(container.querySelector('form')).toBeNull();
	});

	it('leaves the "Not accepted" button out once rejecting is no longer allowed', () => {
		render(DelegationDecision, { props: { ...PROPS, canReject: false } });

		expect(screen.queryByRole('button', { name: 'Not accepted' })).toBeNull();
	});

	it('offers the "Not accepted" button while rejecting is still allowed', () => {
		render(DelegationDecision, { props: { ...PROPS, canReject: true } });

		expect(screen.getByRole('button', { name: 'Not accepted' })).toBeTruthy();
	});

	it('shows the decision note and the day it was decided, once both are set', () => {
		const delegation: OrganiserDelegation = {
			...DELEGATION,
			status: 'rejected',
			decidedAt: '2026-10-08T09:00:00Z',
			decisionNote: 'We had no free seats left this year.'
		};

		render(DelegationDecision, { props: { ...PROPS, delegation } });

		expect(screen.getByText('Decided 8 Oct 2026')).toBeTruthy();
		expect(screen.getByText('We had no free seats left this year.')).toBeTruthy();
	});
});
