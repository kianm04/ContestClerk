/**
 * Tests for `$lib/award-form`: reading and checking the chair's "Propose an
 * award" form, the organiser's "Edit title" form and the "Publish awards"
 * panel, and putting a refusal under the right field.
 *
 * Nothing here talks to the database or to a page. Writing an award once it
 * is checked is `$lib/server/awards.ts` and `$lib/server/award-changes.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
	CHAIR_AWARD_REFUSALS,
	ORGANISER_AWARD_REFUSALS,
	awardFormErrors,
	chairDuplicateRefusal,
	checkAwardForm,
	checkAwardTitle,
	emptySeatPublishRefusal,
	readAwardForm,
	readPublishForm,
	readPublishMoment,
	type AwardFormValues,
	type PublishFormValues
} from './award-form';
import { instantFromLocalDateTime } from './dates';
import type { AwardSeat } from './awards';

/** A filled seat and an empty one, the way the committee's "Add award" form offers them. */
const SEATS: AwardSeat[] = [
	{
		id: 'seat-fr',
		name: 'France',
		countryCode: 'FR',
		isFilled: true,
		delegateName: 'Amira Haddad'
	},
	{ id: 'seat-de', name: 'Germany', countryCode: 'DE', isFilled: false, delegateName: null }
];

/** An award form naming a real seat and kind, so each test changes one thing about it. */
const VALID_FORM: AwardFormValues = { seatId: 'seat-fr', kind: 'best_delegate', title: '' };

describe('readAwardForm', () => {
	it('reads the three fields a posted form sent', () => {
		const formData = new FormData();
		formData.set('seatId', 'seat-fr');
		formData.set('kind', 'custom');
		formData.set('title', 'Best Speech');

		expect(readAwardForm(formData)).toEqual({
			seatId: 'seat-fr',
			kind: 'custom',
			title: 'Best Speech'
		});
	});

	it('reads a field nobody sent as an empty string', () => {
		expect(readAwardForm(new FormData())).toEqual({ seatId: '', kind: '', title: '' });
	});
});

describe('checkAwardForm', () => {
	it('checks a valid form and answers the checked award', () => {
		expect(checkAwardForm(VALID_FORM, SEATS)).toEqual({
			award: {
				seatId: 'seat-fr',
				seatName: 'France',
				kind: 'best_delegate',
				title: 'Best Delegate'
			}
		});
	});

	it('refuses a seat that is not one of the committee, before anything else', () => {
		expect(checkAwardForm({ ...VALID_FORM, seatId: 'seat-elsewhere' }, SEATS)).toEqual({
			problem: 'seat'
		});
	});

	it('refuses a kind that is none of the six, once the seat is real', () => {
		expect(checkAwardForm({ ...VALID_FORM, kind: 'not-a-kind' }, SEATS)).toEqual({
			problem: 'kind'
		});
	});

	it('refuses a custom award with a blank title', () => {
		expect(checkAwardForm({ ...VALID_FORM, kind: 'custom', title: '' }, SEATS)).toEqual({
			problem: 'title'
		});
	});

	it('refuses a custom award with a title of nothing but spaces', () => {
		expect(checkAwardForm({ ...VALID_FORM, kind: 'custom', title: '   ' }, SEATS)).toEqual({
			problem: 'title'
		});
	});

	it('refuses a custom title over 80 characters', () => {
		expect(checkAwardForm({ ...VALID_FORM, kind: 'custom', title: 'x'.repeat(81) }, SEATS)).toEqual(
			{ problem: 'titleLength' }
		);
	});

	it('refuses an empty seat, once the seat, kind and title are all fine', () => {
		expect(checkAwardForm({ seatId: 'seat-de', kind: 'best_delegate', title: '' }, SEATS)).toEqual({
			problem: 'emptySeat'
		});
	});

	it('takes the kind label as the title for every kind but custom, ignoring what was typed', () => {
		const result = checkAwardForm(
			{ ...VALID_FORM, kind: 'outstanding_delegate', title: 'Something typed by mistake' },
			SEATS
		);

		expect(result).toEqual({
			award: {
				seatId: 'seat-fr',
				seatName: 'France',
				kind: 'outstanding_delegate',
				title: 'Outstanding Delegate'
			}
		});
	});

	it('trims a custom title', () => {
		const result = checkAwardForm(
			{ ...VALID_FORM, kind: 'custom', title: '  Best Speech  ' },
			SEATS
		);

		expect(result).toEqual({
			award: { seatId: 'seat-fr', seatName: 'France', kind: 'custom', title: 'Best Speech' }
		});
	});

	it('carries the seat name of the seat that was picked', () => {
		const result = checkAwardForm(VALID_FORM, SEATS);

		expect(result).toEqual({ award: expect.objectContaining({ seatName: 'France' }) });
	});
});

describe('checkAwardTitle', () => {
	it('trims and accepts an ordinary title', () => {
		expect(checkAwardTitle('  Best Speech  ')).toEqual({ title: 'Best Speech' });
	});

	it('refuses a blank title', () => {
		expect(checkAwardTitle('   ')).toEqual({ problem: 'title' });
	});

	it('refuses a title over 80 characters', () => {
		expect(checkAwardTitle('x'.repeat(81))).toEqual({ problem: 'titleLength' });
	});
});

describe('chairDuplicateRefusal', () => {
	it('names the seat that already has the award', () => {
		expect(chairDuplicateRefusal('France')).toBe('France already has this award.');
	});
});

describe('emptySeatPublishRefusal', () => {
	it('names the award pointing at an empty seat', () => {
		expect(emptySeatPublishRefusal('Best Delegate in Security Council')).toBe(
			'Best Delegate in Security Council points at an empty seat. Fix or delete it first.'
		);
	});
});

describe('readPublishForm', () => {
	it('reads the two fields a posted form sent', () => {
		const formData = new FormData();
		formData.set('when', 'scheduled');
		formData.set('publishAt', '2027-02-15T17:00');

		expect(readPublishForm(formData)).toEqual({ when: 'scheduled', publishAt: '2027-02-15T17:00' });
	});

	it('reads a field nobody sent as an empty string', () => {
		expect(readPublishForm(new FormData())).toEqual({ when: '', publishAt: '' });
	});
});

describe('readPublishMoment', () => {
	const now = new Date('2027-02-15T12:00:00Z');

	it('publishes at "now" itself for "Publish now"', () => {
		const values: PublishFormValues = { when: 'now', publishAt: '' };

		expect(readPublishMoment(values, now, 'Europe/Amsterdam')).toEqual({
			publishAt: now.toISOString()
		});
	});

	it('reads a scheduled moment as the conference local time', () => {
		// Amsterdam is UTC+1 in February, so 17:00 local is 16:00 UTC.
		const values: PublishFormValues = { when: 'scheduled', publishAt: '2027-02-15T17:00' };

		const result = readPublishMoment(values, now, 'Europe/Amsterdam');

		// The exact shape `instantFromLocalDateTime` itself answers for the same
		// input, so this test fails if that function's rounding ever changes
		// without this one noticing.
		expect(result).toEqual({
			publishAt: instantFromLocalDateTime('2027-02-15T17:00', 'Europe/Amsterdam')
		});
		expect(result).toEqual({ publishAt: '2027-02-15T16:00:00.000Z' });
	});

	it('refuses a scheduled moment in the past', () => {
		const values: PublishFormValues = { when: 'scheduled', publishAt: '2027-02-15T10:00' };

		expect(readPublishMoment(values, now, 'Europe/Amsterdam')).toEqual({
			problem: 'Choose a moment in the future.'
		});
	});

	it('refuses a scheduled moment equal to "now"', () => {
		// "now" in Amsterdam (UTC+1) is 13:00 local when it is 12:00 UTC.
		const values: PublishFormValues = { when: 'scheduled', publishAt: '2027-02-15T13:00' };

		expect(readPublishMoment(values, now, 'Europe/Amsterdam')).toEqual({
			problem: 'Choose a moment in the future.'
		});
	});

	it('refuses a blank moment', () => {
		const values: PublishFormValues = { when: 'scheduled', publishAt: '' };

		expect(readPublishMoment(values, now, 'Europe/Amsterdam')).toEqual({
			problem: 'Choose a moment in the future.'
		});
	});
});

describe('awardFormErrors', () => {
	it('puts a missing kind under the kind field', () => {
		expect(awardFormErrors('kind', 'Pick an award.')).toEqual({ kind: 'Pick an award.' });
	});

	it('puts a title problem under the title field', () => {
		expect(awardFormErrors('title', 'Give the award a title.')).toEqual({
			title: 'Give the award a title.'
		});
		expect(awardFormErrors('titleLength', 'Keep the title to 80 characters.')).toEqual({
			title: 'Keep the title to 80 characters.'
		});
	});

	it('puts a missing, empty or doubled seat under the seat field', () => {
		expect(awardFormErrors('seat', 'Pick a seat.')).toEqual({ seatId: 'Pick a seat.' });
		expect(awardFormErrors('emptySeat', 'That seat has no delegate.')).toEqual({
			seatId: 'That seat has no delegate.'
		});
		expect(awardFormErrors('duplicate', 'This delegate already has that award.')).toEqual({
			seatId: 'This delegate already has that award.'
		});
	});
});

describe('CHAIR_AWARD_REFUSALS', () => {
	it('is worded exactly as the chair pages spell out', () => {
		expect(CHAIR_AWARD_REFUSALS).toEqual({
			seat: 'Pick a seat.',
			kind: 'Pick an award.',
			title: 'Give the custom award a title.',
			titleLength: 'Keep the title to 80 characters.',
			emptySeat: 'That seat has no delegate.',
			published: 'Awards were published; ask an organiser to change them.',
			notYours:
				'Only the chair who proposed an award can change it, and only while it is proposed.',
			confirm: 'Please confirm before withdrawing the proposal.'
		});
	});
});

describe('ORGANISER_AWARD_REFUSALS', () => {
	it('is worded exactly as the organiser pages spell out', () => {
		expect(ORGANISER_AWARD_REFUSALS).toEqual({
			seat: 'Pick a seat.',
			kind: 'Pick an award.',
			title: 'Give the award a title.',
			titleLength: 'Keep the title to 80 characters.',
			emptySeat: 'That seat has no delegate.',
			duplicate: 'This delegate already has that award.',
			published: 'Unpublish the awards before changing them.',
			noConfirmed: 'Confirm at least one award before publishing.',
			moment: 'Choose a moment in the future.',
			notCustom: 'Only a custom award you added can be renamed.',
			missing: 'That award is not part of this conference.',
			confirm: 'Please confirm first.'
		});
	});
});
