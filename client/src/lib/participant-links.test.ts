import { describe, expect, it } from 'vitest';
import { participantLinks } from './participant-links';
import type { MyPermissions } from './permissions';
import type { Participant } from './participants';

const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** A chair: they see their committee's delegates and open none of the pages a row leads to. */
const CHAIR: MyPermissions = {
	held: [
		{ permission: 'read_participants', scope: 'committees' },
		{ permission: 'run_room', scope: 'committees' }
	],
	committeeIds: ['committee-unsc'],
	rank: 1
};

/** An individual delegate with an invoice of their own. */
const ANNA: Participant = {
	seatId: 'seat-france',
	seatName: 'France',
	seatKind: 'country',
	seatCountryCode: 'FR',
	committee: { id: 'committee-unsc', name: 'Security Council', abbreviation: 'UNSC' },
	userId: 'user-anna',
	fullName: 'Anna Kowalski',
	pronouns: null,
	avatarPath: null,
	institutionName: 'Lyceum 7',
	countryCode: 'FR',
	experienceLevel: 'intermediate',
	delegation: null,
	applicationId: 'application-anna',
	invoice: {
		id: 'invoice-1',
		number: 'T-0001',
		status: 'unpaid',
		paidAt: null,
		isGroupInvoice: false
	},
	paperStatus: 'missing'
};

describe('participantLinks', () => {
	it('gives an individual their application, the move panel and their invoice', () => {
		const links = participantLinks('thimun-2027', ANNA, ADMINISTRATOR);

		expect(links).toEqual([
			{
				label: 'View application',
				href: '/manage/thimun-2027/applications/application-anna'
			},
			{
				label: 'Change seat',
				href: '/manage/thimun-2027/allocation?seat=seat-france&action=move'
			},
			{ label: 'View invoice', href: '/manage/thimun-2027/fees?invoice=invoice-1#invoices' }
		]);
	});

	it('gives a delegation member their delegation instead, and no invoice link without one', () => {
		const member: Participant = {
			...ANNA,
			applicationId: null,
			delegation: { id: 'delegation-lycee', name: 'Lycée Français' },
			invoice: null
		};

		const labels = participantLinks('thimun-2027', member, ADMINISTRATOR).map((link) => link.label);

		expect(labels).toEqual(['View delegation', 'Change seat']);
		expect(participantLinks('thimun-2027', member, ADMINISTRATOR)[0].href).toBe(
			'/manage/thimun-2027/delegations/delegation-lycee'
		);
	});

	it('leaves out the links to pages the reader may not open', () => {
		expect(participantLinks('thimun-2027', ANNA, CHAIR)).toEqual([]);
	});
});
