import { describe, expect, it } from 'vitest';
import type { MyPermissions } from './permissions';
import {
	hiddenDetailHeadings,
	privateDetailsAccess,
	privateDetailsAccessIn,
	withheldPrivateDetails
} from './private-details';

/** A reader holding these permissions at this scope. */
function reader(scope: 'conference' | 'committees', permissions: string[]): MyPermissions {
	return {
		held: permissions.map((permission) => ({
			permission: permission as MyPermissions['held'][number]['permission'],
			scope
		})),
		committeeIds: scope === 'committees' ? ['committee-1'] : [],
		rank: 3
	};
}

describe('privateDetailsAccess', () => {
	it('follows the two detail permissions', () => {
		expect(privateDetailsAccess(reader('conference', ['read_contact_details']))).toEqual({
			contact: true,
			welfare: false
		});
		expect(privateDetailsAccess(reader('conference', ['read_participants']))).toEqual({
			contact: false,
			welfare: false
		});
	});

	it('counts a permission held on one committee', () => {
		expect(privateDetailsAccess(reader('committees', ['read_welfare_details'])).welfare).toBe(true);
	});

	it('gives an administrator both', () => {
		expect(privateDetailsAccess(reader('conference', ['administrator']))).toEqual({
			contact: true,
			welfare: true
		});
	});
});

describe('privateDetailsAccessIn', () => {
	it('follows a permission held on the whole conference, whatever the committee', () => {
		expect(
			privateDetailsAccessIn(reader('conference', ['read_contact_details']), 'committee-2')
		).toEqual({ contact: true, welfare: false });
	});

	it('follows a permission held per committee only in the reader’s own committee', () => {
		const chair = reader('committees', ['read_welfare_details']);

		expect(privateDetailsAccessIn(chair, 'committee-1')).toEqual({ contact: false, welfare: true });
		expect(privateDetailsAccessIn(chair, 'committee-2')).toEqual({
			contact: false,
			welfare: false
		});
	});
});

describe('withheldPrivateDetails', () => {
	const details = {
		email: 'anna@example.org',
		phone: '+48 22 000 0000',
		dateOfBirth: '2008-04-11',
		dietaryRequirements: 'Vegetarian',
		emergencyContactName: 'Maria Kowalska',
		emergencyContactPhone: '+48 22 111 1111'
	};

	it('keeps every field for a reader with both halves', () => {
		expect(withheldPrivateDetails(details, { contact: true, welfare: true })).toEqual(details);
	});

	it('nulls the contact half for a reader without it, and the welfare half likewise', () => {
		expect(withheldPrivateDetails(details, { contact: false, welfare: true })).toEqual({
			...details,
			email: null,
			phone: null
		});
		expect(withheldPrivateDetails(details, { contact: true, welfare: false })).toEqual({
			...details,
			dateOfBirth: null,
			dietaryRequirements: null,
			emergencyContactName: null,
			emergencyContactPhone: null
		});
	});

	it('leaves the other fields of a wider row as they were', () => {
		const row = { ...details, fullName: 'Anna Kowalski', seatId: 'seat-france' };

		expect(withheldPrivateDetails(row, { contact: false, welfare: false })).toEqual({
			fullName: 'Anna Kowalski',
			seatId: 'seat-france',
			email: null,
			phone: null,
			dateOfBirth: null,
			dietaryRequirements: null,
			emergencyContactName: null,
			emergencyContactPhone: null
		});
	});
});

describe('hiddenDetailHeadings', () => {
	const headings = { contact: ['Email', 'Phone'], welfare: ['Date of birth'] };

	it('names the headings of the halves the reader may not see', () => {
		expect(hiddenDetailHeadings({ contact: false, welfare: true }, headings)).toEqual([
			'Email',
			'Phone'
		]);
		expect(hiddenDetailHeadings({ contact: true, welfare: false }, headings)).toEqual([
			'Date of birth'
		]);
		expect(hiddenDetailHeadings({ contact: true, welfare: true }, headings)).toEqual([]);
	});
});
