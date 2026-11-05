import { describe, expect, it } from 'vitest';
import {
	allocateButtonLabel,
	canAllocateToDelegation,
	delegationSeatCounts,
	delegationSubtitle,
	memberDetailsAccess,
	memberMetaItems,
	memberSeatSentence,
	newInvoiceOf,
	rejectRefusal,
	removeSeatActionUrl,
	reservedSeatCount,
	reservedSeatLabel,
	seatsAllocatedFlash,
	seatTakenRefusal,
	selectedSeatsSentence,
	withheldMemberDetails,
	ALREADY_DECIDED_REFUSAL,
	SEATS_BEFORE_REJECTING_REFUSAL,
	type DelegationInvoiceLine,
	type OrganiserDelegation
} from './delegation-review';
import {
	MEMBER_DETAIL_MISSING,
	type DelegationMember,
	type DelegationSeatGroup
} from './delegations';
import type { MyPermissions } from './permissions';

/** A delegation under review, the shape the organiser's page starts every test from. */
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

/** The delegation's head, who registered it. */
const AMIRA_HEAD: DelegationMember = {
	userId: 'user-amira',
	fullName: 'Amira Haddad',
	avatarPath: null,
	institutionName: 'Lycée Français de La Haye',
	experienceLevel: 'advanced',
	role: 'head',
	joinedAt: '2026-09-01T09:00:00Z',
	seat: null,
	details: null
};

/** A plain member who has been given a seat and whose private details are visible. */
const LUIS_MEMBER: DelegationMember = {
	userId: 'user-luis',
	fullName: 'Luis Ortega',
	avatarPath: null,
	institutionName: 'Lycée Français de La Haye',
	experienceLevel: 'intermediate',
	role: 'member',
	joinedAt: '2026-09-04T09:00:00Z',
	seat: {
		seatName: 'France',
		countryCode: 'FR',
		committeeName: 'Security Council',
		committeeAbbreviation: 'UNSC'
	},
	details: {
		dateOfBirth: '2008-04-12',
		phone: '+31 6 1234 5678',
		dietaryRequirements: 'Vegetarian'
	}
};

/** The moment every test that reads an age pretends it is. */
const NOW = new Date('2026-09-22T12:00:00Z');

describe('seatTakenRefusal', () => {
	it('names the seat that was just taken', () => {
		expect(seatTakenRefusal('UNSC · France')).toBe(
			'UNSC · France was just taken. Untick it and try again.'
		);
	});
});

describe('newInvoiceOf', () => {
	/** One unpaid invoice with this id. */
	function makeInvoice(id: string): DelegationInvoiceLine {
		return {
			id,
			number: `thimun-${id}`,
			description: 'Delegation seats',
			amountCents: 5000,
			currency: 'EUR',
			status: 'unpaid'
		};
	}

	it('finds the one invoice that was not there before', () => {
		const before = [makeInvoice('0001')];
		const after = [makeInvoice('0001'), makeInvoice('0002')];

		expect(newInvoiceOf(before, after)?.id).toBe('0002');
	});

	it('answers null when no invoice was written', () => {
		const before = [makeInvoice('0001')];

		expect(newInvoiceOf(before, before)).toBeNull();
	});
});

describe('seatsAllocatedFlash', () => {
	it('names the invoice created for the seats', () => {
		expect(seatsAllocatedFlash(10, 'Lycée Français Delegation', 'riverside-mun-2027-0004')).toBe(
			'10 seats allocated to Lycée Français Delegation. Invoice riverside-mun-2027-0004 created.'
		);
	});

	it('says no fee applies when the conference charges nothing', () => {
		expect(seatsAllocatedFlash(2, 'Lycée Français Delegation', undefined)).toBe(
			'2 seats allocated to Lycée Français Delegation.'
		);
		expect(seatsAllocatedFlash(10, 'Lycée Français Delegation', null)).toBe(
			'10 seats allocated to Lycée Français Delegation. No fee applies, so no invoice was created.'
		);
	});

	it('reads as English for a single seat', () => {
		expect(seatsAllocatedFlash(1, 'Lycée Français Delegation', 'riverside-mun-2027-0004')).toBe(
			'1 seat allocated to Lycée Français Delegation. Invoice riverside-mun-2027-0004 created.'
		);
	});
});

describe('allocateButtonLabel', () => {
	it('offers to accept and allocate when nothing is ticked on a first decision', () => {
		expect(allocateButtonLabel(0, 'submitted')).toBe('Accept and allocate seats');
	});

	it('offers to allocate more when nothing is ticked on an already-accepted delegation', () => {
		expect(allocateButtonLabel(0, 'accepted')).toBe('Allocate more seats');
	});

	it('names the count when seats are ticked on a first decision', () => {
		expect(allocateButtonLabel(5, 'submitted')).toBe('Accept and allocate 5 seats');
	});

	it('names the count when seats are ticked on an already-accepted delegation', () => {
		expect(allocateButtonLabel(5, 'accepted')).toBe('Allocate 5 seats more');
	});

	it('reads as English for a single seat on a first decision', () => {
		expect(allocateButtonLabel(1, 'submitted')).toBe('Accept and allocate 1 seat');
	});

	it('reads as English for a single seat on an already-accepted delegation', () => {
		expect(allocateButtonLabel(1, 'accepted')).toBe('Allocate 1 seat more');
	});
});

describe('delegationSubtitle', () => {
	it('names the institution, the requested seats and the head', () => {
		expect(delegationSubtitle(DELEGATION, [AMIRA_HEAD, LUIS_MEMBER])).toBe(
			'Lycée Français de La Haye · 12 seats requested · head Amira Haddad'
		);
	});

	it('reads as English for a single requested seat', () => {
		const delegation: OrganiserDelegation = { ...DELEGATION, requestedSeats: 1 };

		expect(delegationSubtitle(delegation, [AMIRA_HEAD])).toBe(
			'Lycée Français de La Haye · 1 seat requested · head Amira Haddad'
		);
	});

	it('shows a dash when none of the members left is a head', () => {
		// A head who deleted their account leaves the members list without one;
		// `headNamesSentence` is what turns that into a dash rather than a gap.
		expect(delegationSubtitle(DELEGATION, [{ ...LUIS_MEMBER, role: 'member' }])).toBe(
			'Lycée Français de La Haye · 12 seats requested · head —'
		);
	});
});

describe('selectedSeatsSentence', () => {
	it('counts the ticked seats', () => {
		expect(selectedSeatsSentence(4)).toBe('4 selected');
	});

	it('counts zero the same way', () => {
		expect(selectedSeatsSentence(0)).toBe('0 selected');
	});
});

describe('canAllocateToDelegation', () => {
	it('lets seats be given to a delegation still under review', () => {
		expect(canAllocateToDelegation('submitted')).toBe(true);
	});

	it('lets more seats be given to an already-accepted delegation', () => {
		expect(canAllocateToDelegation('accepted')).toBe(true);
	});

	it('refuses a delegation that was not accepted', () => {
		expect(canAllocateToDelegation('rejected')).toBe(false);
	});

	it('refuses a delegation that withdrew its request', () => {
		expect(canAllocateToDelegation('withdrawn')).toBe(false);
	});
});

describe('rejectRefusal', () => {
	it('lets a delegation under review, holding no seats, be marked not accepted', () => {
		expect(rejectRefusal('submitted', 0)).toBeNull();
	});

	it('lets an accepted delegation with no seats left be marked not accepted', () => {
		expect(rejectRefusal('accepted', 0)).toBeNull();
	});

	it('refuses a delegation that has already been decided', () => {
		expect(rejectRefusal('rejected', 0)).toBe(ALREADY_DECIDED_REFUSAL);
		expect(rejectRefusal('withdrawn', 0)).toBe(ALREADY_DECIDED_REFUSAL);
	});

	it('refuses an accepted delegation that still holds seats', () => {
		expect(rejectRefusal('accepted', 3)).toBe(SEATS_BEFORE_REJECTING_REFUSAL);
	});
});

/** A reader who holds both private-detail permissions. */
const EVERY_DETAIL = { contact: true, welfare: true };

describe('memberMetaItems', () => {
	it('shows the age, the phone and the dietary requirements when they are visible', () => {
		expect(memberMetaItems(LUIS_MEMBER, NOW, EVERY_DETAIL)).toEqual([
			{ label: 'Institution', value: 'Lycée Français de La Haye' },
			{ label: 'Experience', value: 'Several' },
			{ label: 'Age', value: '18' },
			{ label: 'Phone', value: '+31 6 1234 5678' },
			{ label: 'Dietary requirements', value: 'Vegetarian' }
		]);
	});

	it('leaves out the three private facts when the reader may not see them', () => {
		// `details` is `null` for a member neither view answered for,
		// and the two public facts are shown alone rather than three rows saying
		// "Not given", which would read as "nothing was given" instead.
		expect(memberMetaItems(AMIRA_HEAD, NOW, EVERY_DETAIL)).toEqual([
			{ label: 'Institution', value: 'Lycée Français de La Haye' },
			{ label: 'Experience', value: 'Many, I have chaired' }
		]);
	});

	it('shows each private row only with the permission behind it', () => {
		const contactOnly = memberMetaItems(LUIS_MEMBER, NOW, { contact: true, welfare: false });
		const welfareOnly = memberMetaItems(LUIS_MEMBER, NOW, { contact: false, welfare: true });

		expect(contactOnly.map((item) => item.label)).toEqual(['Institution', 'Experience', 'Phone']);
		expect(welfareOnly.map((item) => item.label)).toEqual([
			'Institution',
			'Experience',
			'Age',
			'Dietary requirements'
		]);
	});

	it('reads a blank phone as "Not given" rather than as an empty row', () => {
		const member: DelegationMember = {
			...LUIS_MEMBER,
			details: { ...LUIS_MEMBER.details!, phone: '   ' }
		};

		expect(
			memberMetaItems(member, NOW, EVERY_DETAIL).find((item) => item.label === 'Phone')
		).toEqual({
			label: 'Phone',
			value: MEMBER_DETAIL_MISSING
		});
	});

	it("takes one year off the age while this year's birthday is still ahead", () => {
		const member: DelegationMember = {
			...LUIS_MEMBER,
			details: { ...LUIS_MEMBER.details!, dateOfBirth: '2008-11-20' }
		};

		expect(memberMetaItems(member, NOW, EVERY_DETAIL).find((item) => item.label === 'Age')).toEqual(
			{
				label: 'Age',
				value: '17'
			}
		);
	});
});

describe('memberSeatSentence', () => {
	it('shortens the committee to its abbreviation', () => {
		expect(memberSeatSentence(LUIS_MEMBER)).toBe('UNSC · France');
	});

	it('writes the committee out in full when it has no abbreviation', () => {
		const member: DelegationMember = {
			...LUIS_MEMBER,
			seat: { ...LUIS_MEMBER.seat!, committeeAbbreviation: null }
		};

		expect(memberSeatSentence(member)).toBe('Security Council · France');
	});

	it('answers null for a member who holds no seat', () => {
		expect(memberSeatSentence(AMIRA_HEAD)).toBeNull();
	});
});

/** One committee with two of its seats reserved for the delegation, one of them held. */
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
				experienceLevel: 'advanced'
			}
		},
		{
			id: 'seat-brazil',
			name: 'Brazil',
			countryCode: 'BR',
			holder: null
		}
	]
};

describe('delegationSeatCounts', () => {
	it('counts every seat and how many of them have somebody in them', () => {
		expect(delegationSeatCounts([SEAT_GROUP])).toEqual({ allocated: 2, assigned: 1 });
	});

	it('counts nothing for a delegation with no seat groups', () => {
		expect(delegationSeatCounts([])).toEqual({ allocated: 0, assigned: 0 });
	});
});

describe('reservedSeatCount', () => {
	it('counts every seat across every committee', () => {
		expect(reservedSeatCount([SEAT_GROUP])).toBe(2);
	});

	it('counts nothing for an empty list', () => {
		expect(reservedSeatCount([])).toBe(0);
	});
});

describe('removeSeatActionUrl', () => {
	it('carries the seat id and the form action in the address', () => {
		expect(removeSeatActionUrl('seat-france')).toBe('?seatId=seat-france&/removeSeat');
	});

	it('escapes a seat id that needs it', () => {
		expect(removeSeatActionUrl('seat 1 & 2')).toBe('?seatId=seat%201%20%26%202&/removeSeat');
	});
});

describe('reservedSeatLabel', () => {
	it('puts the committee in front of the seat name', () => {
		expect(reservedSeatLabel('UNSC', 'France')).toBe('UNSC · France');
	});
});

describe('memberDetailsAccess and withheldMemberDetails', () => {
	/** A reader holding these permissions at this scope, assigned to committee-unsc when per committee. */
	function reader(scope: 'conference' | 'committees', permissions: string[]): MyPermissions {
		return {
			held: permissions.map((permission) => ({
				permission: permission as MyPermissions['held'][number]['permission'],
				scope
			})),
			committeeIds: scope === 'committees' ? ['committee-unsc'] : [],
			rank: 3
		};
	}

	/** Luis sits in the delegation's UNSC seat; Amira, the head, holds none. */
	const SEAT_GROUPS: DelegationSeatGroup[] = [
		{
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
						experienceLevel: 'intermediate'
					}
				}
			]
		}
	];

	/** Amira as the view would send her for a reader who runs another conference she is in. */
	const AMIRA_WITH_DETAILS: DelegationMember = {
		...AMIRA_HEAD,
		details: { dateOfBirth: '2007-02-01', phone: '+31 6 0000 0000', dietaryRequirements: 'Vegan' }
	};

	it('answers for a member without a seat by the conference-wide permissions alone', () => {
		expect(memberDetailsAccess(reader('committees', ['read_contact_details']), null)).toEqual({
			contact: false,
			welfare: false
		});
		expect(memberDetailsAccess(reader('conference', ['read_contact_details']), null)).toEqual({
			contact: true,
			welfare: false
		});
	});

	it('answers for a seated member by the seat’s committee as well', () => {
		const chair = reader('committees', ['read_welfare_details']);

		expect(memberDetailsAccess(chair, 'committee-unsc')).toEqual({ contact: false, welfare: true });
		expect(memberDetailsAccess(chair, 'committee-disec')).toEqual({
			contact: false,
			welfare: false
		});
	});

	it('withholds every detail this conference does not grant, whatever the view sent', () => {
		// A UNSC chair here who holds both permissions on another conference too:
		// the view sends Amira's details, but nothing here lets this reader see them.
		const chair = reader('committees', ['read_contact_details', 'read_welfare_details']);
		const [amira, luis] = withheldMemberDetails(
			[AMIRA_WITH_DETAILS, LUIS_MEMBER],
			SEAT_GROUPS,
			chair
		);

		expect(amira.details).toBeNull();
		expect(luis.details).toEqual(LUIS_MEMBER.details);
	});

	it('keeps only the half of the details the reader holds', () => {
		const contactOnly = reader('conference', ['read_contact_details']);
		const [amira] = withheldMemberDetails([AMIRA_WITH_DETAILS], SEAT_GROUPS, contactOnly);

		expect(amira.details).toEqual({
			dateOfBirth: null,
			phone: '+31 6 0000 0000',
			dietaryRequirements: null
		});
	});

	it('leaves a member the view sent nothing for without details', () => {
		const administrator = reader('conference', ['administrator']);

		expect(withheldMemberDetails([AMIRA_HEAD], SEAT_GROUPS, administrator)[0].details).toBeNull();
	});
});
