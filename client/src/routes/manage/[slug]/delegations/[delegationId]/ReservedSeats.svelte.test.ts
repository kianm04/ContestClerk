import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import {
	NO_RESERVED_SEATS,
	UNASSIGNED_SEAT_LABEL,
	removeSeatActionUrl
} from '$lib/delegation-review';
import type { DelegationSeatGroup } from '$lib/delegations';
import ReservedSeats from './ReservedSeats.svelte';

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
	its own: the "Remove" button opens a `ConfirmButton` dialog, and jsdom's
	`showModal()`/`close()` simply do not exist there. These stand-ins set the
	`open` property the way a real browser would, matching
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

/** One committee with one seat held by a member, ready to be given a `holder` per test. */
const SEAT_GROUP: DelegationSeatGroup = {
	committee: {
		id: 'committee-unsc',
		name: 'Security Council',
		abbreviation: 'UNSC',
		level: 'advanced'
	},
	seats: [
		{
			id: 'seat-france',
			name: 'France',
			countryCode: 'FR',
			holder: {
				userId: 'user-luis',
				fullName: 'Luis Ortega',
				avatarPath: null,
				experienceLevel: null
			}
		}
	]
};

/** A stand-in for the page's instant form, which the "Remove" button posts through. */
const onSubmit = vi.fn();

describe('ReservedSeats', () => {
	it("shows the holder's name on a seat somebody is in", () => {
		render(ReservedSeats, { props: { seatsByCommittee: [SEAT_GROUP], canRemove: true, onSubmit } });

		expect(screen.getByText('Luis Ortega')).toBeTruthy();
	});

	it('shows "Unassigned" on a seat with nobody in it', () => {
		const group: DelegationSeatGroup = {
			...SEAT_GROUP,
			seats: [{ ...SEAT_GROUP.seats[0], holder: null }]
		};

		render(ReservedSeats, { props: { seatsByCommittee: [group], canRemove: true, onSubmit } });

		expect(screen.getByText(UNASSIGNED_SEAT_LABEL)).toBeTruthy();
	});

	it("posts the Remove button to the seat's own removeSeat address", () => {
		// `ConfirmButton` renders a `<form>` of its own around the "Remove"
		// button, and its `action` attribute is where the seat id travels, the
		// way `ConfirmButton.svelte.test.ts` checks it for a single button.
		const { container } = render(ReservedSeats, {
			props: { seatsByCommittee: [SEAT_GROUP], canRemove: true, onSubmit }
		});

		const form = container.querySelector('form');
		expect(form?.getAttribute('action')).toBe(removeSeatActionUrl('seat-france'));
	});

	it('gives a reader without decide_applications no Remove button', () => {
		const { container } = render(ReservedSeats, {
			props: { seatsByCommittee: [SEAT_GROUP], canRemove: false, onSubmit }
		});

		expect(screen.getByText('Luis Ortega')).toBeTruthy();
		expect(container.querySelector('form')).toBeNull();
	});

	it('says nothing is reserved yet when the delegation holds no seats', () => {
		render(ReservedSeats, { props: { seatsByCommittee: [], canRemove: true, onSubmit } });

		expect(screen.getByText(NO_RESERVED_SEATS)).toBeTruthy();
	});
});
