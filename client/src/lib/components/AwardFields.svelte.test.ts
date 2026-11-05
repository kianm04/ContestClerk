/**
 * Tests for `AwardFields`, the three fields (seat, award, title) shared by the
 * chair's "Propose an award" form and the organiser's "Add award" form.
 *
 * Not tested here: the pages that draw this component and post its values
 * (`checkAwardForm` in `$lib/award-form.ts` has its own tests for the checking).
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import AwardFields from './AwardFields.svelte';
import type { AwardSeat } from '$lib/awards';

/** One filled seat, the way the committee's "Add award" form offers it. */
const SEATS: AwardSeat[] = [
	{ id: 'seat-fr', name: 'France', countryCode: 'FR', isFilled: true, delegateName: 'Amira Haddad' }
];

/** An empty, unedited form, the props `AwardFields` starts from in every test. */
const EMPTY_VALUES = { seatId: '', kind: 'best_delegate', title: '' };

describe('AwardFields', () => {
	it('offers only the seats it was given, labelled with the delegate in them', () => {
		render(AwardFields, {
			props: { seats: SEATS, values: EMPTY_VALUES, errors: {}, idSuffix: 'committee-1' }
		});

		expect(screen.getByRole('option', { name: 'France · Amira Haddad' })).toBeTruthy();
		expect(screen.getAllByRole('option', { name: /·/ })).toHaveLength(1);
	});

	it('offers the six award kinds', () => {
		render(AwardFields, {
			props: { seats: SEATS, values: EMPTY_VALUES, errors: {}, idSuffix: 'committee-1' }
		});

		expect(screen.getByRole('option', { name: 'Best Delegate' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Outstanding Delegate' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Honourable Mention' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Best Position Paper' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Verbal Commendation' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Custom' })).toBeTruthy();
	});

	it('builds every field id from idSuffix, so two copies on one page never clash', () => {
		render(AwardFields, {
			props: { seats: SEATS, values: EMPTY_VALUES, errors: {}, idSuffix: 'committee-1' }
		});

		expect(screen.getByLabelText('Seat').getAttribute('id')).toBe('field-seatId-committee-1');
		expect(screen.getByLabelText('Award').getAttribute('id')).toBe('field-kind-committee-1');
	});

	it('shows the message under each field the last refusal was about', () => {
		render(AwardFields, {
			props: {
				seats: SEATS,
				values: EMPTY_VALUES,
				errors: { seatId: 'Pick a seat.', kind: 'Pick an award.' },
				idSuffix: 'committee-1'
			}
		});

		expect(screen.getByText('Pick a seat.')).toBeTruthy();
		expect(screen.getByText('Pick an award.')).toBeTruthy();
	});

	it('hides the title field once JavaScript has taken over, unless Custom is picked', () => {
		/*
			On a real page, `AwardFields` first arrives as finished HTML with the
			title field shown, which is what a reader without JavaScript keeps: the
			server ignores the title for every kind but Custom, so there is nothing
			to hide from them. `onMount` only ever runs once Svelte brings that HTML
			to life in a browser, and only then does the field hide itself for every
			kind but Custom.

			`@testing-library/svelte`'s `render` mounts the component client-side
			from the start and flushes `onMount` before returning, so this test
			never sees the field shown: by the time `render` returns, the component
			is already past the point a real page reaches only once JavaScript runs.
		*/
		render(AwardFields, {
			props: { seats: SEATS, values: EMPTY_VALUES, errors: {}, idSuffix: 'committee-1' }
		});

		expect(screen.queryByLabelText('Title')).toBeNull();
	});

	it('shows the title field again once the reader picks Custom', async () => {
		render(AwardFields, {
			props: { seats: SEATS, values: EMPTY_VALUES, errors: {}, idSuffix: 'committee-1' }
		});

		await fireEvent.change(screen.getByLabelText('Award'), { target: { value: 'custom' } });

		expect(await screen.findByLabelText('Title')).toBeTruthy();
	});
});
