import { describe, expect, it } from 'vitest';
import {
	assignSeatRefusalSentence,
	canChangeDelegationSeats,
	canCreateDelegation,
	canEditDelegation,
	canJoinDelegation,
	canSubmitDelegation,
	canWithdrawDelegation,
	delegationClosedNotice,
	delegationCountsSentence,
	delegationInvoiceSummary,
	delegationMembersSubtitle,
	delegationProgress,
	delegationSeatsNotice,
	delegationSeatsSentence,
	delegationStatusSentence,
	delegationTabs,
	DELEGATION_TAB_LABELS,
	emptyDelegationForm,
	EMPTY_DELEGATION_LIST_QUERY,
	EMPTY_DELEGATION_STATUS_COUNTS,
	emptySeatSentence,
	EVERY_SEAT_ASSIGNED,
	hasDelegationFormErrors,
	hasNoAssignedMembers,
	headNamesSentence,
	isListedDelegationStatus,
	isTakingDelegations,
	joinRefusalSentence,
	madeHeadFlash,
	memberActionRefusalSentence,
	memberDetailItems,
	memberDisplayName,
	memberFieldName,
	memberRemovedFlash,
	memberRowSubtitle,
	memberSeatedFlash,
	memberSeatLabel,
	MEMBER_DETAIL_MISSING,
	noSeatsAllocatedDescription,
	parseDelegationListQuery,
	readDelegationForm,
	removeMemberConfirmText,
	removeMemberConfirmTitle,
	sortDelegationMembers,
	SEATS_LOCKED_REFUSAL,
	toDelegationFormValues,
	TOO_FEW_SEATS_WARNING,
	tooFewSeatsWarning,
	UNASSIGN_SEAT_CONFIRM_TEXT,
	unassignSeatConfirmTitle,
	unassignSeatRefusalSentence,
	unseatedMemberOptionLabel,
	validateDelegationForm,
	type Delegation,
	type DelegationConference,
	type DelegationFormValues,
	type DelegationMember,
	type DelegationMemberSeat,
	type DelegationPreview,
	type DelegationStatusCounts,
	type DelegationSummary,
	type RouteIntoConference,
	type UnseatedMember
} from './delegations';
import { statusLabel } from './status';

/**
 * One conference every test starts from: published, accepting delegations, with
 * no dates on either side of its window, which counts as open. Tests spread it
 * and change only the field they are about.
 */
const THIMUN: DelegationConference = {
	id: 'conference-thimun',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	timezone: 'Europe/Amsterdam',
	status: 'published',
	applicationOpenMode: 'on_publish',
	acceptsDelegations: true,
	applicationsOpenAt: null,
	applicationsCloseAt: null
};

/** The moment every test that needs a clock pretends it is. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** The day every test that compares dates pretends it is, as `YYYY-MM-DD`. */
const TODAY = '2026-09-17';

/** A delegation of the reader's own, still a draft. */
const LYCEE: Delegation = {
	id: 'delegation-lycee',
	conferenceId: 'conference-thimun',
	name: 'Lycée Français Delegation',
	institutionName: 'Lycée Français de La Haye',
	countryCode: 'FR',
	status: 'draft',
	requestedSeats: 12,
	note: 'We arrive by train on the Friday evening.',
	joinCode: 'H7KP3QWX',
	submittedAt: null,
	decidedAt: null,
	decisionNote: null
};

/** The same delegation as somebody holding its join link sees it. */
const PREVIEW: DelegationPreview = {
	id: 'delegation-lycee',
	name: 'Lycée Français Delegation',
	institutionName: 'Lycée Français de La Haye',
	countryCode: 'FR',
	status: 'draft',
	conferenceName: 'THIMUN 2027',
	conferenceSlug: 'thimun-2027',
	conferenceStatus: 'published',
	conferenceStartDate: '2027-01-24',
	conferenceEndDate: '2027-01-29',
	conferenceCity: 'The Hague',
	conferenceCountryCode: 'NL',
	headNames: ['Amira Haddad'],
	memberCount: 8
};

/** The reader already has an individual application at this conference. */
const MY_APPLICATION: RouteIntoConference = {
	kind: 'application',
	applicationId: 'application-daniel'
};

/** The reader is already in the delegation the join link points at. */
const MY_MEMBERSHIP: RouteIntoConference = {
	kind: 'delegation',
	delegationId: 'delegation-lycee',
	delegationName: 'Lycée Français Delegation'
};

/** The reader is already in a different delegation at the same conference. */
const MY_OTHER_MEMBERSHIP: RouteIntoConference = {
	kind: 'delegation',
	delegationId: 'delegation-delft',
	delegationName: 'Delft University'
};

/** A register form filled in so that nothing is wrong with it. */
const GOOD_FORM: DelegationFormValues = {
	name: 'Lycée Français Delegation',
	institutionName: 'Lycée Français de La Haye',
	countryCode: 'FR',
	requestedSeats: '12',
	note: 'We arrive by train on the Friday evening.',
	hasConsented: true
};

describe('canCreateDelegation', () => {
	it('lets somebody register a delegation at a published conference with an open window', () => {
		expect(canCreateDelegation(THIMUN, null, NOW)).toBe(null);
	});

	it('refuses a conference that is not published', () => {
		const conference: DelegationConference = { ...THIMUN, status: 'draft' };

		expect(canCreateDelegation(conference, null, NOW)).toEqual({
			kind: 'not_published',
			message: 'THIMUN 2027 is not taking delegations.'
		});
	});

	it('refuses a conference that only takes individual applications', () => {
		const conference: DelegationConference = { ...THIMUN, acceptsDelegations: false };

		expect(canCreateDelegation(conference, null, NOW)).toEqual({
			kind: 'delegations_not_accepted',
			message: 'THIMUN 2027 does not accept delegations.'
		});
	});

	it('refuses somebody who already applied on their own', () => {
		expect(canCreateDelegation(THIMUN, MY_APPLICATION, NOW)).toEqual({
			kind: 'already_applied',
			message: 'You already applied to THIMUN 2027 as an individual.'
		});
	});

	it('refuses somebody who is already in a delegation, and names it', () => {
		expect(canCreateDelegation(THIMUN, MY_OTHER_MEMBERSHIP, NOW)).toEqual({
			kind: 'in_delegation',
			message: 'You are already part of the Delft University delegation.'
		});
	});

	it('refuses a conference whose organiser has not opened applications yet', () => {
		const conference: DelegationConference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: null
		};

		expect(canCreateDelegation(conference, null, NOW)).toEqual({
			kind: 'not_yet_open',
			message: 'Applications for THIMUN 2027 are not open yet.'
		});
	});

	it('refuses a window that has not opened yet, and says which day it opens', () => {
		const conference: DelegationConference = {
			...THIMUN,
			applicationsOpenAt: '2026-11-02T12:00:00Z'
		};

		expect(canCreateDelegation(conference, null, NOW)).toEqual({
			kind: 'not_yet_open',
			message: 'Applications for THIMUN 2027 open on 2 Nov 2026.'
		});
	});

	it('refuses a window that has closed, and says which day it closed', () => {
		const conference: DelegationConference = {
			...THIMUN,
			applicationsOpenAt: '2026-01-05T12:00:00Z',
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(canCreateDelegation(conference, null, NOW)).toEqual({
			kind: 'closed',
			message: 'Applications for THIMUN 2027 closed on 1 Jun 2026.'
		});
	});

	it('gives the first reason rather than every reason', () => {
		// The questions are asked in one order and the first "yes" wins, so an
		// unpublished conference that also refuses delegations, to somebody who
		// has already applied and whose window has closed, is turned away for not
		// being published.
		const conference: DelegationConference = {
			...THIMUN,
			status: 'draft',
			acceptsDelegations: false,
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(canCreateDelegation(conference, MY_APPLICATION, NOW)?.kind).toBe('not_published');
	});

	it('prefers "you already applied" to the window being shut', () => {
		const conference: DelegationConference = {
			...THIMUN,
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(canCreateDelegation(conference, MY_APPLICATION, NOW)?.kind).toBe('already_applied');
	});
});

describe('joinRefusalSentence', () => {
	const FACTS = { conferenceName: 'THIMUN 2027', otherDelegationName: 'Delft University' };

	/*
		These are the sentences `05-pages/delegation/join.md` quotes, word for
		word. They are checked here rather than only through `canJoinDelegation`
		because the action words the database's own refusals with the same
		function, and that path never goes through `canJoinDelegation` at all.
	*/
	it('words each row of the refusal table the way the spec quotes it', () => {
		expect(joinRefusalSentence('already_in_this', FACTS)).toBe(
			'You are already in this delegation.'
		);
		expect(joinRefusalSentence('rejected', FACTS)).toBe(
			'This delegation was not accepted, so it cannot take members.'
		);
		expect(joinRefusalSentence('withdrawn', FACTS)).toBe('This delegation withdrew its request.');
		expect(joinRefusalSentence('conference_over', FACTS)).toBe(
			'THIMUN 2027 has already taken place.'
		);
		expect(joinRefusalSentence('in_other_delegation', FACTS)).toBe(
			'You are already in the Delft University delegation for THIMUN 2027.'
		);
		expect(joinRefusalSentence('already_applied', FACTS)).toBe(
			'You already applied to THIMUN 2027 on your own. Withdraw that application first to join a delegation.'
		);
		// The one row only the database decides: the page cannot tell who is on
		// the team, so `join_delegation` raises it and the action words it here.
		expect(joinRefusalSentence('conference_staff', FACTS)).toBe(
			'You are on the team of THIMUN 2027, so you cannot join one of its delegations.'
		);
	});

	// The database raises "you are in another delegation" without saying which
	// one, and the page cannot always look the name up. The sentence then names
	// the conference on its own rather than printing a gap.
	it('leaves the other delegation unnamed when nobody could look it up', () => {
		expect(
			joinRefusalSentence('in_other_delegation', { ...FACTS, otherDelegationName: null })
		).toBe('You are already in another delegation for THIMUN 2027.');
	});
});

describe('canJoinDelegation', () => {
	it('lets somebody with no other place at the conference join', () => {
		expect(canJoinDelegation(PREVIEW, null, TODAY)).toBe(null);
	});

	it('turns away somebody who is already in this delegation', () => {
		expect(canJoinDelegation(PREVIEW, MY_MEMBERSHIP, TODAY)).toEqual({
			kind: 'already_in_this',
			message: 'You are already in this delegation.'
		});
	});

	it('refuses a delegation the organisers did not accept', () => {
		const preview: DelegationPreview = { ...PREVIEW, status: 'rejected' };

		expect(canJoinDelegation(preview, null, TODAY)).toEqual({
			kind: 'rejected',
			message: 'This delegation was not accepted, so it cannot take members.'
		});
	});

	it('refuses a delegation that withdrew its request', () => {
		const preview: DelegationPreview = { ...PREVIEW, status: 'withdrawn' };

		expect(canJoinDelegation(preview, null, TODAY)).toEqual({
			kind: 'withdrawn',
			message: 'This delegation withdrew its request.'
		});
	});

	it('refuses a conference that has already taken place', () => {
		const preview: DelegationPreview = { ...PREVIEW, conferenceEndDate: '2026-09-16' };

		expect(canJoinDelegation(preview, null, TODAY)).toEqual({
			kind: 'conference_over',
			message: 'THIMUN 2027 has already taken place.'
		});
	});

	it('still lets somebody join on the last day of the conference', () => {
		const preview: DelegationPreview = { ...PREVIEW, conferenceEndDate: TODAY };

		expect(canJoinDelegation(preview, null, TODAY)).toBe(null);
	});

	/*
		The other half of `join.md`'s "conference archived or ended" row. An
		organiser can archive a conference before its dates arrive — one that was
		cancelled, say — and the dates alone would call that one joinable.
	*/
	it('refuses a conference the organisers have archived, whatever its dates say', () => {
		const preview: DelegationPreview = { ...PREVIEW, conferenceStatus: 'archived' };

		expect(canJoinDelegation(preview, null, TODAY)).toEqual({
			kind: 'conference_over',
			message: 'THIMUN 2027 has already taken place.'
		});
	});

	it('refuses somebody who is in another delegation for the same conference', () => {
		expect(canJoinDelegation(PREVIEW, MY_OTHER_MEMBERSHIP, TODAY)).toEqual({
			kind: 'in_other_delegation',
			message: 'You are already in the Delft University delegation for THIMUN 2027.'
		});
	});

	it('refuses somebody who applied to the conference on their own', () => {
		expect(canJoinDelegation(PREVIEW, MY_APPLICATION, TODAY)).toEqual({
			kind: 'already_applied',
			message:
				'You already applied to THIMUN 2027 on your own. Withdraw that application first to join a delegation.'
		});
	});

	it('says "already in this one" rather than "in another delegation"', () => {
		// The page redirects on this reason instead of drawing it, so it has to be
		// asked before the reason about other delegations catches the same person.
		expect(canJoinDelegation(PREVIEW, MY_MEMBERSHIP, TODAY)?.kind).toBe('already_in_this');
	});

	it('lets somebody join an accepted delegation, whatever the application window did', () => {
		// There is no window check at all: heads add replacement members after
		// applications have closed, which `join.md` allows while the delegation is
		// accepted.
		const preview: DelegationPreview = { ...PREVIEW, status: 'accepted' };

		expect(canJoinDelegation(preview, null, TODAY)).toBe(null);
	});
});

describe('canSubmitDelegation', () => {
	it('lets the head submit a draft while applications are open', () => {
		expect(canSubmitDelegation(LYCEE, THIMUN, NOW)).toBe(null);
	});

	it('lets a delegation of one head be submitted', () => {
		// The head counts as a member, so there is no member count to fail on.
		expect(canSubmitDelegation(LYCEE, THIMUN, NOW)).toBe(null);
	});

	it('refuses a delegation that has already been sent', () => {
		const delegation: Delegation = { ...LYCEE, status: 'submitted' };

		expect(canSubmitDelegation(delegation, THIMUN, NOW)).toEqual({
			kind: 'not_draft',
			message: 'This delegation has already been sent to the organisers.'
		});
	});

	it('refuses a draft once applications have closed, and says which day', () => {
		const conference: DelegationConference = {
			...THIMUN,
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(canSubmitDelegation(LYCEE, conference, NOW)).toEqual({
			kind: 'closed',
			message: 'Applications for THIMUN 2027 closed on 1 Jun 2026.'
		});
	});

	// guard_delegation_update asks conference_takes_applications, which refuses
	// a manual conference nobody has opened however far away its closing date is.
	it('refuses a draft while the organiser has not opened applications by hand', () => {
		const conference: DelegationConference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: null
		};

		expect(canSubmitDelegation(LYCEE, conference, NOW)).toEqual({
			kind: 'not_yet_open',
			message: 'Applications for THIMUN 2027 are not open yet.'
		});
	});

	it('refuses a draft at a conference that stopped taking delegations or is unpublished', () => {
		expect(canSubmitDelegation(LYCEE, { ...THIMUN, acceptsDelegations: false }, NOW)).toEqual({
			kind: 'delegations_not_accepted',
			message: 'THIMUN 2027 does not accept delegations.'
		});
		expect(canSubmitDelegation(LYCEE, { ...THIMUN, status: 'archived' }, NOW)).toEqual({
			kind: 'not_published',
			message: 'THIMUN 2027 is not taking delegations.'
		});
	});
});

describe('isTakingDelegations', () => {
	it('is open with no dates on either side, and shut before opening and after closing', () => {
		expect(isTakingDelegations(THIMUN, NOW)).toBe(true);
		expect(
			isTakingDelegations({ ...THIMUN, applicationsOpenAt: '2099-01-01T00:00:00Z' }, NOW)
		).toBe(false);
		expect(
			isTakingDelegations({ ...THIMUN, applicationsCloseAt: '2026-06-01T12:00:00Z' }, NOW)
		).toBe(false);
	});

	it('is shut while the organiser has not opened applications by hand', () => {
		expect(
			isTakingDelegations(
				{ ...THIMUN, applicationOpenMode: 'manual', applicationsOpenAt: null },
				NOW
			)
		).toBe(false);
	});
});

describe('canWithdrawDelegation', () => {
	it('lets the head withdraw a draft nobody has seats for yet', () => {
		expect(canWithdrawDelegation(LYCEE, 0)).toBe(null);
	});

	it('lets the head withdraw a delegation under review', () => {
		const delegation: Delegation = { ...LYCEE, status: 'submitted' };

		expect(canWithdrawDelegation(delegation, 0)).toBe(null);
	});

	it('refuses a delegation that has already been decided', () => {
		const delegation: Delegation = { ...LYCEE, status: 'accepted' };

		expect(canWithdrawDelegation(delegation, 0)).toEqual({
			kind: 'not_open',
			message: 'This delegation can no longer be withdrawn.'
		});
	});

	/*
		Allocating seats also marks the delegation `accepted`, so this is the only
		shape a delegation with seats behind it ever has. It is the case that tells
		the two refusals apart: this one names whom to go to, and the head reads it
		instead of the flat "can no longer be withdrawn".
	*/
	it('refuses a delegation that already has seats, and says whom to ask', () => {
		const delegation: Delegation = { ...LYCEE, status: 'accepted' };

		expect(canWithdrawDelegation(delegation, 10)).toEqual({
			kind: 'seats_allocated',
			message: 'Seats were already allocated; ask the organisers to cancel.'
		});
	});
});

describe('canEditDelegation', () => {
	it('lets the head edit a draft and a delegation under review', () => {
		expect(canEditDelegation('draft', true)).toBe(true);
		expect(canEditDelegation('submitted', true)).toBe(true);
	});

	it('stops the head editing once the organisers have decided', () => {
		expect(canEditDelegation('accepted', true)).toBe(false);
		expect(canEditDelegation('rejected', true)).toBe(false);
		expect(canEditDelegation('withdrawn', true)).toBe(false);
	});

	it('stops the head editing once the conference is not taking delegations', () => {
		expect(canEditDelegation('draft', false)).toBe(false);
		expect(canEditDelegation('submitted', false)).toBe(false);
	});
});

describe('delegationProgress', () => {
	it('counts what was asked for, given and seated', () => {
		expect(delegationProgress(LYCEE, { allocated: 10, assigned: 6 })).toEqual({
			requested: 12,
			allocated: 10,
			assigned: 6,
			percentAssigned: 60
		});
	});

	it('measures the bar against the allocated seats rather than the requested ones', () => {
		// Ten of twelve wished-for seats were granted and all ten are seated, so
		// the head has nothing left to do and the bar is full.
		const progress = delegationProgress(LYCEE, { allocated: 10, assigned: 10 });

		expect(progress.percentAssigned).toBe(100);
	});

	it('leaves the bar empty before the organisers have allocated anything', () => {
		const progress = delegationProgress(LYCEE, { allocated: 0, assigned: 0 });

		expect(progress).toEqual({
			requested: 12,
			allocated: 0,
			assigned: 0,
			percentAssigned: 0
		});
	});

	it('rounds the percentage to a whole number', () => {
		const progress = delegationProgress(LYCEE, { allocated: 3, assigned: 1 });

		expect(progress.percentAssigned).toBe(33);
	});
});

describe('validateDelegationForm', () => {
	it('finds nothing wrong with a form that is properly filled in', () => {
		expect(validateDelegationForm(GOOD_FORM, { asksConsent: true })).toEqual({});
	});

	it('asks for a delegation name', () => {
		const values: DelegationFormValues = { ...GOOD_FORM, name: '   ' };

		expect(validateDelegationForm(values, { asksConsent: true }).name).toBe(
			'Give your delegation a name.'
		);
	});

	it('asks for an institution', () => {
		const values: DelegationFormValues = { ...GOOD_FORM, institutionName: '' };

		expect(validateDelegationForm(values, { asksConsent: true }).institutionName).toBe(
			'Enter the name of your school, university or club.'
		);
	});

	it('asks for a country', () => {
		const values: DelegationFormValues = { ...GOOD_FORM, countryCode: '' };

		expect(validateDelegationForm(values, { asksConsent: true }).countryCode).toBe(
			'Pick a country.'
		);
	});

	it('refuses a country code that belongs to no country', () => {
		// `CountrySelect` offers nothing but real codes, so this only arrives from
		// a request somebody built by hand. The database's `char(2)` would take it.
		const values: DelegationFormValues = { ...GOOD_FORM, countryCode: 'ZZ' };

		expect(validateDelegationForm(values, { asksConsent: true }).countryCode).toBe(
			'Pick a country.'
		);
	});

	it('asks for a whole number of seats inside the two bounds', () => {
		const tooFew: DelegationFormValues = { ...GOOD_FORM, requestedSeats: '0' };
		const tooMany: DelegationFormValues = { ...GOOD_FORM, requestedSeats: '201' };
		const notWhole: DelegationFormValues = { ...GOOD_FORM, requestedSeats: '12.5' };
		const notANumber: DelegationFormValues = { ...GOOD_FORM, requestedSeats: 'twelve' };
		const empty: DelegationFormValues = { ...GOOD_FORM, requestedSeats: '' };
		const message = 'Ask for between 1 and 200 seats.';

		expect(validateDelegationForm(tooFew, { asksConsent: true }).requestedSeats).toBe(message);
		expect(validateDelegationForm(tooMany, { asksConsent: true }).requestedSeats).toBe(message);
		expect(validateDelegationForm(notWhole, { asksConsent: true }).requestedSeats).toBe(message);
		expect(validateDelegationForm(notANumber, { asksConsent: true }).requestedSeats).toBe(message);
		expect(validateDelegationForm(empty, { asksConsent: true }).requestedSeats).toBe(message);
	});

	it('accepts the smallest and the largest number of seats', () => {
		const one: DelegationFormValues = { ...GOOD_FORM, requestedSeats: '1' };
		const twoHundred: DelegationFormValues = { ...GOOD_FORM, requestedSeats: '200' };

		expect(validateDelegationForm(one, { asksConsent: true })).toEqual({});
		expect(validateDelegationForm(twoHundred, { asksConsent: true })).toEqual({});
	});

	it('refuses a note longer than the box holds', () => {
		const values: DelegationFormValues = { ...GOOD_FORM, note: 'a'.repeat(1001) };

		expect(validateDelegationForm(values, { asksConsent: true }).note).toBe(
			'Keep the note to 1000 characters or fewer.'
		);
	});

	it('accepts a note exactly as long as the box holds', () => {
		const values: DelegationFormValues = { ...GOOD_FORM, note: 'a'.repeat(1000) };

		expect(validateDelegationForm(values, { asksConsent: true })).toEqual({});
	});

	it('refuses a name or an institution longer than the box holds', () => {
		const longName: DelegationFormValues = { ...GOOD_FORM, name: 'a'.repeat(121) };
		const longInstitution: DelegationFormValues = {
			...GOOD_FORM,
			institutionName: 'a'.repeat(121)
		};

		expect(validateDelegationForm(longName, { asksConsent: true }).name).toBe(
			'Keep the name to 120 characters or fewer.'
		);
		expect(validateDelegationForm(longInstitution, { asksConsent: true }).institutionName).toBe(
			'Keep the institution to 120 characters or fewer.'
		);
	});

	it('accepts a name and an institution exactly as long as the boxes hold', () => {
		const values: DelegationFormValues = {
			...GOOD_FORM,
			name: 'a'.repeat(120),
			institutionName: 'b'.repeat(120)
		};

		expect(validateDelegationForm(values, { asksConsent: true })).toEqual({});
	});

	it('asks for the consent box on the register form', () => {
		const values: DelegationFormValues = { ...GOOD_FORM, hasConsented: false };

		expect(validateDelegationForm(values, { asksConsent: true }).consent).toBe(
			"Please confirm that organisers may see your members' details."
		);
	});

	it('does not ask for consent on the edit form, which never draws the box', () => {
		const values: DelegationFormValues = { ...GOOD_FORM, hasConsented: false };

		expect(validateDelegationForm(values, { asksConsent: false })).toEqual({});
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values: DelegationFormValues = {
			name: '',
			institutionName: '',
			countryCode: '',
			requestedSeats: '0',
			note: 'a'.repeat(1001),
			hasConsented: false
		};

		expect(Object.keys(validateDelegationForm(values, { asksConsent: true })).sort()).toEqual([
			'consent',
			'countryCode',
			'institutionName',
			'name',
			'note',
			'requestedSeats'
		]);
	});
});

describe('hasDelegationFormErrors', () => {
	it('says no when nothing is wrong', () => {
		expect(hasDelegationFormErrors({})).toBe(false);
	});

	it('says yes when one box needs fixing', () => {
		expect(hasDelegationFormErrors({ name: 'Give your delegation a name.' })).toBe(true);
	});

	it('says yes when the whole form has a problem', () => {
		expect(hasDelegationFormErrors({ form: 'Applications for THIMUN 2027 closed.' })).toBe(true);
	});
});

describe('readDelegationForm', () => {
	/** The form a filled-in register page sends. */
	function filledInForm(): FormData {
		const formData = new FormData();

		formData.set('name', '  Lycée Français Delegation  ');
		formData.set('institutionName', '  Lycée Français de La Haye  ');
		formData.set('countryCode', ' FR ');
		formData.set('requestedSeats', ' 12 ');
		formData.set('note', '  We arrive by train on the Friday evening.  ');
		formData.set('consent', 'on');

		return formData;
	}

	it('reads every field of a filled-in form without its surrounding spaces', () => {
		expect(readDelegationForm(filledInForm())).toEqual(GOOD_FORM);
	});

	it('counts the consent box as unticked when it does not arrive', () => {
		const formData = filledInForm();

		formData.delete('consent');

		expect(readDelegationForm(formData).hasConsented).toBe(false);
	});

	it('reads a field the browser did not send at all as empty', () => {
		expect(readDelegationForm(new FormData())).toEqual({
			name: '',
			institutionName: '',
			countryCode: '',
			requestedSeats: '',
			note: '',
			hasConsented: false
		});
	});
});

describe('emptyDelegationForm', () => {
	it('prefills the name, the institution and the country from the profile', () => {
		const values = emptyDelegationForm({
			institutionName: 'Lycée Français de La Haye',
			countryCode: 'FR'
		});

		// The name is the institution's, which the head can still change (T177).
		expect(values).toEqual({
			name: 'Lycée Français de La Haye',
			institutionName: 'Lycée Français de La Haye',
			countryCode: 'FR',
			requestedSeats: '',
			note: '',
			hasConsented: false
		});
	});

	it('leaves the name and the institution empty when the profile has none', () => {
		const values = emptyDelegationForm({ institutionName: '', countryCode: '' });

		expect(values.name).toBe('');
		expect(values.institutionName).toBe('');
		expect(values.countryCode).toBe('');
	});
});

describe('toDelegationFormValues', () => {
	it('puts a registered delegation back into the form', () => {
		expect(toDelegationFormValues(LYCEE)).toEqual({
			name: 'Lycée Français Delegation',
			institutionName: 'Lycée Français de La Haye',
			countryCode: 'FR',
			requestedSeats: '12',
			note: 'We arrive by train on the Friday evening.',
			hasConsented: true
		});
	});

	it('shows an empty box for a country and a note that were never filled in', () => {
		const delegation: Delegation = { ...LYCEE, countryCode: null, note: null };
		const values = toDelegationFormValues(delegation);

		expect(values.countryCode).toBe('');
		expect(values.note).toBe('');
	});
});

describe('delegationStatusSentence', () => {
	/** The progress of a delegation that asked for 12 seats and was given 10. */
	const PROGRESS = delegationProgress(LYCEE, { allocated: 10, assigned: 6 });

	it('tells a draft what to do next', () => {
		expect(delegationStatusSentence(LYCEE, THIMUN, PROGRESS)).toBe(
			'Not sent yet. Add members, then submit.'
		);
	});

	it('says when a submitted delegation was sent and how many seats it asked for', () => {
		const delegation: Delegation = {
			...LYCEE,
			status: 'submitted',
			submittedAt: '2026-10-03T09:00:00Z'
		};

		expect(delegationStatusSentence(delegation, THIMUN, PROGRESS)).toBe(
			'Submitted 3 Oct 2026. The organisers are reviewing your request for 12 seats.'
		);
	});

	it('leaves the day out of a submitted delegation that has none', () => {
		const delegation: Delegation = { ...LYCEE, status: 'submitted', submittedAt: null };

		expect(delegationStatusSentence(delegation, THIMUN, PROGRESS)).toBe(
			'The organisers are reviewing your request for 12 seats.'
		);
	});

	it('says how many seats an accepted delegation was given', () => {
		const delegation: Delegation = { ...LYCEE, status: 'accepted' };

		expect(delegationStatusSentence(delegation, THIMUN, PROGRESS)).toBe(
			'Accepted. 10 seats allocated.'
		);
	});

	it('says only that a rejected delegation was not accepted', () => {
		// The decision note is drawn by the card beside this sentence, not in it.
		const delegation: Delegation = {
			...LYCEE,
			status: 'rejected',
			decidedAt: '2026-10-08T09:00:00Z',
			decisionNote: 'We had no seats left for a group this size.'
		};

		expect(delegationStatusSentence(delegation, THIMUN, PROGRESS)).toBe('Not accepted.');
	});

	it('names the day an organiser ended a withdrawn delegation', () => {
		const delegation: Delegation = {
			...LYCEE,
			status: 'withdrawn',
			decidedAt: '2026-10-08T09:00:00Z'
		};

		expect(delegationStatusSentence(delegation, THIMUN, PROGRESS)).toBe('Withdrawn on 8 Oct 2026.');
	});

	it('names no day when the head withdrew the delegation themselves', () => {
		// A head withdrawing their own delegation writes no decision column, which
		// is the ordinary case, so there is no day to name.
		const delegation: Delegation = { ...LYCEE, status: 'withdrawn', decidedAt: null };

		expect(delegationStatusSentence(delegation, THIMUN, PROGRESS)).toBe('Withdrawn.');
	});
});

/*
 * Everything below is the organiser's own table, `/manage/[slug]/delegations`,
 * which is the second half of `delegations.ts`.
 */

/** Counts with every status at zero but the ones a test names. */
function statusCounts(named: Partial<DelegationStatusCounts> = {}): DelegationStatusCounts {
	return { ...EMPTY_DELEGATION_STATUS_COUNTS, ...named };
}

/** A summary of the whole table, for the sentence under the page title. */
function summary(counts: DelegationStatusCounts, requestedSeatsTotal: number): DelegationSummary {
	return { counts, requestedSeatsTotal };
}

describe('parseDelegationListQuery', () => {
	it('asks for nothing when the address carries nothing', () => {
		expect(parseDelegationListQuery(new URLSearchParams())).toEqual(EMPTY_DELEGATION_LIST_QUERY);
	});

	it('reads a whole query back off the address', () => {
		const params = new URLSearchParams('q=lycee&status=accepted&country=FR&sort=name&page=2');

		expect(parseDelegationListQuery(params)).toEqual({
			q: 'lycee',
			status: 'accepted',
			country: 'FR',
			sort: 'name',
			page: 2
		});
	});

	it('trims the spaces around the search text', () => {
		expect(parseDelegationListQuery(new URLSearchParams('q=  lycee  ')).q).toBe('lycee');
	});

	it('falls back to the queue for a status it does not know', () => {
		// The address is only text somebody could have typed, and a draft is one
		// thing the organiser may never list.
		expect(parseDelegationListQuery(new URLSearchParams('status=draft')).status).toBe('submitted');
		expect(parseDelegationListQuery(new URLSearchParams('status=waitlisted')).status).toBe(
			'submitted'
		);
	});

	it('falls back to the oldest first for an order it does not know', () => {
		expect(parseDelegationListQuery(new URLSearchParams('sort=biggest')).sort).toBe('submitted');
		expect(parseDelegationListQuery(new URLSearchParams('sort=NAME')).sort).toBe('submitted');
	});

	it('accepts a country code written in lower case', () => {
		expect(parseDelegationListQuery(new URLSearchParams('country=fr')).country).toBe('FR');
	});

	it('ignores a country that is not a real code', () => {
		expect(parseDelegationListQuery(new URLSearchParams('country=Narnia')).country).toBe('');
	});

	it('falls back to the first page for anything that is not a page number', () => {
		expect(parseDelegationListQuery(new URLSearchParams('page=0')).page).toBe(1);
		expect(parseDelegationListQuery(new URLSearchParams('page=-1')).page).toBe(1);
		expect(parseDelegationListQuery(new URLSearchParams('page=abc')).page).toBe(1);
		expect(parseDelegationListQuery(new URLSearchParams('page=1.5')).page).toBe(1);
	});
});

describe('isListedDelegationStatus', () => {
	it('accepts each of the four statuses the table shows', () => {
		expect(isListedDelegationStatus('submitted')).toBe(true);
		expect(isListedDelegationStatus('accepted')).toBe(true);
		expect(isListedDelegationStatus('rejected')).toBe(true);
		expect(isListedDelegationStatus('withdrawn')).toBe(true);
	});

	it('refuses a draft, which the organiser may never list', () => {
		expect(isListedDelegationStatus('draft')).toBe(false);
	});

	it('refuses text that is no status at all', () => {
		expect(isListedDelegationStatus('')).toBe(false);
		expect(isListedDelegationStatus('waitlisted')).toBe(false);
	});
});

describe('DELEGATION_TAB_LABELS', () => {
	it('calls each status what every other badge in the app calls it', () => {
		// The tabs and the status badge on the row underneath them must never
		// disagree, which is why both ask `$lib/status`.
		expect(DELEGATION_TAB_LABELS.submitted).toBe(statusLabel('delegation_status', 'submitted'));
		expect(DELEGATION_TAB_LABELS.accepted).toBe(statusLabel('delegation_status', 'accepted'));
		expect(DELEGATION_TAB_LABELS.rejected).toBe(statusLabel('delegation_status', 'rejected'));
		expect(DELEGATION_TAB_LABELS.withdrawn).toBe(statusLabel('delegation_status', 'withdrawn'));
	});
});

describe('delegationInvoiceSummary', () => {
	it('says there is no invoice when the delegation has none', () => {
		expect(delegationInvoiceSummary([])).toEqual({ label: 'No invoice', tone: 'neutral' });
	});

	it('says unpaid for one invoice nobody has paid', () => {
		expect(delegationInvoiceSummary(['unpaid'])).toEqual({ label: 'Unpaid', tone: 'warning' });
	});

	it('says paid for one invoice that was paid', () => {
		expect(delegationInvoiceSummary(['paid'])).toEqual({ label: 'Paid', tone: 'success' });
	});

	it('counts a waived invoice as settled', () => {
		// Nobody owes anything on a waived invoice, so the organiser is not
		// waiting for money.
		expect(delegationInvoiceSummary(['waived'])).toEqual({ label: 'Paid', tone: 'success' });
	});

	it('says partly paid when one is settled and another is not', () => {
		expect(delegationInvoiceSummary(['paid', 'unpaid'])).toEqual({
			label: 'Partly paid',
			tone: 'warning'
		});
	});

	it('ignores a voided invoice on its own', () => {
		// `remove_delegation_seat` voids the group invoice and reissues it for
		// the smaller count, so a delegation that lost a seat always has one.
		expect(delegationInvoiceSummary(['void'])).toEqual({ label: 'No invoice', tone: 'neutral' });
	});

	it('ignores a voided invoice beside a paid one', () => {
		expect(delegationInvoiceSummary(['void', 'paid'])).toEqual({
			label: 'Paid',
			tone: 'success'
		});
	});

	it('counts a refunded invoice as unpaid', () => {
		// A refund means the money went back, so the organiser is owed it again.
		expect(delegationInvoiceSummary(['refunded'])).toEqual({ label: 'Unpaid', tone: 'warning' });
	});

	it('says partly paid for a refunded invoice beside a paid one', () => {
		expect(delegationInvoiceSummary(['refunded', 'paid'])).toEqual({
			label: 'Partly paid',
			tone: 'warning'
		});
	});
});

describe('headNamesSentence', () => {
	it('shows a dash for a delegation with no head at all', () => {
		expect(headNamesSentence([])).toBe('—');
	});

	it('names one head on its own', () => {
		expect(headNamesSentence(['M. Dupont'])).toBe('M. Dupont');
	});

	it('names two heads in the order they were given', () => {
		expect(headNamesSentence(['M. Dupont', 'A. Blanc'])).toBe('M. Dupont, A. Blanc');
	});
});

describe('hasNoAssignedMembers', () => {
	/** An organiser's row with the given status and seat numbers. */
	function row(status: 'submitted' | 'accepted', allocated: number, assigned: number) {
		return {
			status,
			progress: { requested: 4, allocated, assigned, percentAssigned: 0 }
		};
	}

	it('flags an accepted delegation that holds seats and has seated nobody', () => {
		expect(hasNoAssignedMembers(row('accepted', 3, 0))).toBe(true);
	});

	it('leaves alone a delegation that has seated somebody', () => {
		expect(hasNoAssignedMembers(row('accepted', 3, 1))).toBe(false);
	});

	it('leaves alone an accepted delegation that has been given no seats yet', () => {
		expect(hasNoAssignedMembers(row('accepted', 0, 0))).toBe(false);
	});

	it('leaves alone a delegation still waiting for a decision', () => {
		expect(hasNoAssignedMembers(row('submitted', 3, 0))).toBe(false);
	});
});

describe('delegationCountsSentence', () => {
	it('says so when nobody has registered a delegation yet', () => {
		expect(delegationCountsSentence(summary(EMPTY_DELEGATION_STATUS_COUNTS, 0))).toBe(
			'No delegation requests yet'
		);
	});

	it('counts the requests of every status and the seats they asked for', () => {
		const counts = statusCounts({ submitted: 5, accepted: 3, rejected: 1 });

		expect(delegationCountsSentence(summary(counts, 214))).toBe('9 requests · 214 seats requested');
	});

	it('reads as English for a single request for a single seat', () => {
		expect(delegationCountsSentence(summary(statusCounts({ submitted: 1 }), 1))).toBe(
			'1 request · 1 seat requested'
		);
	});

	it('counts a withdrawn delegation as a request that was made', () => {
		// The tab is there whether or not anybody is in it, and a withdrawn
		// request still happened.
		expect(delegationCountsSentence(summary(statusCounts({ withdrawn: 2 }), 30))).toBe(
			'2 requests · 30 seats requested'
		);
	});
});

/** Ten of the twelve seats the delegation asked for, six of them seated. */
const SEATS_PROGRESS = delegationProgress(LYCEE, { allocated: 10, assigned: 6 });

/** The conference's first day, as the seats page writes it in a sentence. */
const START_DAY = '24 Jan 2027';

/**
 * A conference far enough east that its own day turns while UTC is still on the
 * one before, which is what the timezone tests below are about.
 */
const AUCKLAND: Pick<DelegationConference, 'startDate' | 'timezone'> = {
	startDate: '2027-01-24',
	timezone: 'Pacific/Auckland'
};

/** One member of the delegation with no seat yet. */
const SARA: UnseatedMember = {
	userId: 'user-sara',
	fullName: 'Sara Khan',
	experienceLevel: 'beginner',
	avatarPath: null
};

describe('delegationSeatsSentence', () => {
	it('writes the three counts in the order the header shows them', () => {
		expect(delegationSeatsSentence(SEATS_PROGRESS, 3)).toBe(
			'10 allocated · 6 assigned · 3 members unseated'
		);
	});

	it('reads as English for a single member without a seat', () => {
		expect(delegationSeatsSentence(SEATS_PROGRESS, 1)).toBe(
			'10 allocated · 6 assigned · 1 member unseated'
		);
	});

	it('writes every clause even at zero, so the counts can be compared', () => {
		// The dashboard's progress card shows the same three numbers, and a head
		// comparing the two pages should find the same clauses on both.
		const nothingYet = delegationProgress(LYCEE, { allocated: 0, assigned: 0 });

		expect(delegationSeatsSentence(nothingYet, 0)).toBe(
			'0 allocated · 0 assigned · 0 members unseated'
		);
	});
});

describe('canChangeDelegationSeats', () => {
	it('lets the head assign seats the day before the conference starts', () => {
		expect(canChangeDelegationSeats(THIMUN, new Date('2027-01-23T12:00:00Z'))).toBe(true);
	});

	it('stops the head on the conference first day', () => {
		expect(canChangeDelegationSeats(THIMUN, new Date('2027-01-24T08:00:00Z'))).toBe(false);
	});

	it('stops the head once the conference has been running for days', () => {
		expect(canChangeDelegationSeats(THIMUN, new Date('2027-01-27T08:00:00Z'))).toBe(false);
	});

	it('asks what day it is where the conference is, not in UTC', () => {
		// Midday UTC on the 23rd is already one in the morning of the 24th in
		// Auckland, so the conference has started there and the head is too late,
		// even though UTC is still on the day before.
		expect(canChangeDelegationSeats(AUCKLAND, new Date('2027-01-23T12:00:00Z'))).toBe(false);
	});

	it('still lets the head assign while Auckland is on the day before', () => {
		expect(canChangeDelegationSeats(AUCKLAND, new Date('2027-01-22T12:00:00Z'))).toBe(true);
	});
});

describe('delegationSeatsNotice', () => {
	it('names the deadline while there are seats left to fill', () => {
		expect(delegationSeatsNotice(SEATS_PROGRESS, true, START_DAY)).toEqual({
			tone: 'info',
			message: 'Assign every seat before 24 Jan 2027.'
		});
	});

	it('turns success once every allocated seat has somebody in it', () => {
		const everySeat = delegationProgress(LYCEE, { allocated: 10, assigned: 10 });

		expect(delegationSeatsNotice(everySeat, true, START_DAY)).toEqual({
			tone: 'success',
			message: EVERY_SEAT_ASSIGNED
		});
	});

	it('does not congratulate a delegation that has been allocated nothing', () => {
		const nothingYet = delegationProgress(LYCEE, { allocated: 0, assigned: 0 });

		expect(delegationSeatsNotice(nothingYet, true, START_DAY)).toEqual({
			tone: 'info',
			message: 'Assign every seat before 24 Jan 2027.'
		});
	});

	it('warns that the seats are locked once the conference has started', () => {
		expect(delegationSeatsNotice(SEATS_PROGRESS, false, START_DAY)).toEqual({
			tone: 'warning',
			message: SEATS_LOCKED_REFUSAL
		});
	});

	it('says the seats are locked even when they are all assigned', () => {
		// The head can no longer change anything, which is the more useful thing
		// to tell them, so the lock wins over the congratulation.
		const everySeat = delegationProgress(LYCEE, { allocated: 10, assigned: 10 });

		expect(delegationSeatsNotice(everySeat, false, START_DAY).tone).toBe('warning');
	});
});

describe('tooFewSeatsWarning', () => {
	it('says nothing when the members left over exactly fill the empty seats', () => {
		// Ten allocated and six assigned leaves four empty seats for four members.
		expect(tooFewSeatsWarning(SEATS_PROGRESS, 4)).toBeNull();
	});

	it('warns when there is one member more than there are seats for them', () => {
		expect(tooFewSeatsWarning(SEATS_PROGRESS, 5)).toBe(TOO_FEW_SEATS_WARNING);
	});

	it('says nothing when there are seats to spare', () => {
		expect(tooFewSeatsWarning(SEATS_PROGRESS, 3)).toBeNull();
	});

	it('says nothing at all when nobody is waiting for a seat', () => {
		expect(tooFewSeatsWarning(SEATS_PROGRESS, 0)).toBeNull();
	});

	it('says nothing when the organisers have allocated no seats at all', () => {
		// Every member of such a delegation is unseated, so the bare arithmetic would
		// warn every one of them. The page shows them the empty state instead.
		const nothingYet = delegationProgress(LYCEE, { allocated: 0, assigned: 0 });

		expect(tooFewSeatsWarning(nothingYet, 3)).toBeNull();
	});
});

describe('assignSeatRefusalSentence', () => {
	it('asks for a member when the dropdown was left alone', () => {
		expect(assignSeatRefusalSentence('no_member', '')).toBe('Pick a member.');
	});

	it('names somebody who is not in this delegation', () => {
		expect(assignSeatRefusalSentence('not_a_member', 'Sara Khan')).toBe(
			'Sara Khan is not in this delegation.'
		);
	});

	it('names somebody who already holds a seat', () => {
		expect(assignSeatRefusalSentence('already_seated', 'Sara Khan')).toBe(
			'Sara Khan already has a seat.'
		);
	});

	it('refuses a seat that belongs to another delegation', () => {
		expect(assignSeatRefusalSentence('not_your_delegation', 'Sara Khan')).toBe(
			'That seat is not allocated to your delegation.'
		);
	});

	it('refuses a seat somebody else got to first', () => {
		expect(assignSeatRefusalSentence('seat_taken', 'Sara Khan')).toBe(
			'That seat is already taken.'
		);
	});

	it('refuses everything once the conference has started', () => {
		expect(assignSeatRefusalSentence('locked', 'Sara Khan')).toBe(SEATS_LOCKED_REFUSAL);
	});
});

describe('unassignSeatRefusalSentence', () => {
	it('refuses a seat that belongs to another delegation', () => {
		expect(unassignSeatRefusalSentence('not_your_delegation')).toBe(
			'That seat is not allocated to your delegation.'
		);
	});

	it('says so when there is nobody in the seat to take out', () => {
		expect(unassignSeatRefusalSentence('already_empty')).toBe('That seat is already empty.');
	});

	it('refuses everything once the conference has started', () => {
		expect(unassignSeatRefusalSentence('locked')).toBe(SEATS_LOCKED_REFUSAL);
	});
});

describe('memberSeatedFlash', () => {
	it('names the member, the seat and the committee', () => {
		expect(memberSeatedFlash('Luis Ortega', 'France', 'Security Council')).toBe(
			'Luis Ortega now represents France in Security Council.'
		);
	});
});

describe('unassignSeatConfirmTitle', () => {
	it('asks the question with the member in it', () => {
		// The consequence is `UNASSIGN_SEAT_CONFIRM_TEXT`, which `ConfirmButton`
		// draws under this heading. Neither half repeats the other.
		expect(unassignSeatConfirmTitle('Luis Ortega')).toBe('Unassign Luis Ortega?');
		expect(UNASSIGN_SEAT_CONFIRM_TEXT).toBe(
			'Any position paper they uploaded will be removed; they can upload it again once they hold a seat.'
		);
	});
});

describe('emptySeatSentence', () => {
	it('says nobody is in the seat once the conference has started', () => {
		expect(emptySeatSentence(false)).toBe('Nobody is in this seat.');
	});

	it('says everybody is seated while a head could still move somebody', () => {
		expect(emptySeatSentence(true)).toBe('Everybody in the delegation already has a seat.');
	});
});

describe('unseatedMemberOptionLabel', () => {
	it('shows the name and the experience level', () => {
		expect(unseatedMemberOptionLabel(SARA, 'user-amira')).toBe('Sara Khan · Beginner');
	});

	it('marks the reader own name, because a head may assign themselves', () => {
		expect(unseatedMemberOptionLabel(SARA, 'user-sara')).toBe('Sara Khan (you) · Beginner');
	});

	it('uses the same words for a level as every other page does', () => {
		const newcomer: UnseatedMember = { ...SARA, experienceLevel: 'none' };

		expect(unseatedMemberOptionLabel(newcomer, 'user-amira')).toBe(
			`Sara Khan · ${statusLabel('experience_level', 'none')}`
		);
	});
});

describe('noSeatsAllocatedDescription', () => {
	it('tells a delegation under review what happens next', () => {
		expect(noSeatsAllocatedDescription('submitted')).toBe(
			'The organisers allocate seats after accepting your request.'
		);
	});

	it('tells a rejected delegation why it has no seats', () => {
		expect(noSeatsAllocatedDescription('rejected')).toBe('Your request was not accepted.');
	});

	it('gives the waiting sentence to the three statuses the spec does not name', () => {
		// None of them has been allocated anything either, so the sentence is
		// still the true one.
		expect(noSeatsAllocatedDescription('draft')).toBe(
			'The organisers allocate seats after accepting your request.'
		);
		expect(noSeatsAllocatedDescription('accepted')).toBe(
			'The organisers allocate seats after accepting your request.'
		);
		expect(noSeatsAllocatedDescription('withdrawn')).toBe(
			'The organisers allocate seats after accepting your request.'
		);
	});
});

describe('memberFieldName', () => {
	it('carries the seat id, so each dropdown gets an id of its own', () => {
		expect(memberFieldName('seat-france')).toBe('userId-seat-france');
	});

	it('gives two seats two different names', () => {
		expect(memberFieldName('seat-france')).not.toBe(memberFieldName('seat-brazil'));
	});
});

/*
 * Everything below is the head's members page,
 * `/delegations/[delegationId]/members`, which is the third section of
 * `delegations.ts`.
 */

/** The seat Luis Ortega holds, as the members page names it. */
const FRANCE_SEAT: DelegationMemberSeat = {
	seatName: 'France',
	countryCode: 'FR',
	committeeName: 'Security Council',
	committeeAbbreviation: 'UNSC'
};

/** The head of the delegation, who joined it first because she registered it. */
const AMIRA: DelegationMember = {
	userId: 'user-amira',
	fullName: 'Amira Haddad',
	avatarPath: null,
	institutionName: 'Lycée Français de La Haye',
	experienceLevel: 'advanced',
	role: 'head',
	joinedAt: '2026-10-01T09:00:00Z',
	seat: null,
	details: null
};

/** A plain member who joined later and holds a seat. */
const LUIS: DelegationMember = {
	userId: 'user-luis',
	fullName: 'Luis Ortega',
	avatarPath: null,
	institutionName: 'Lycée Français de La Haye',
	experienceLevel: 'intermediate',
	role: 'member',
	joinedAt: '2026-10-04T09:00:00Z',
	seat: FRANCE_SEAT,
	details: {
		dateOfBirth: '2008-04-12',
		phone: '+31 6 1234 5678',
		dietaryRequirements: 'Vegetarian'
	}
};

describe('delegationMembersSubtitle', () => {
	it('counts the members and the seats the delegation asked for', () => {
		expect(delegationMembersSubtitle(9, 12)).toBe('9 joined · 12 seats requested');
	});

	it('reads as English for one member and one seat', () => {
		// "joined" is the same word either way, so only the seats clause changes.
		expect(delegationMembersSubtitle(1, 1)).toBe('1 joined · 1 seat requested');
	});

	it('writes both clauses for a head who is still on their own', () => {
		expect(delegationMembersSubtitle(1, 12)).toBe('1 joined · 12 seats requested');
	});
});

describe('memberRowSubtitle', () => {
	it('says what a head is rather than when they joined', () => {
		expect(memberRowSubtitle(AMIRA, '1 Oct')).toBe('Head · Advanced · Lycée Français de La Haye');
	});

	it('says when a plain member joined', () => {
		expect(memberRowSubtitle(LUIS, '4 Oct')).toBe(
			'joined 4 Oct · Intermediate · Lycée Français de La Haye'
		);
	});

	it('does no date work of its own, so the day arrives already written', () => {
		// The day comes from `formatDayAndMonth` in `$lib/dates.ts`, which is the
		// only thing in the pair that needs a timezone.
		expect(memberRowSubtitle(LUIS, '24 Jan 2027')).toBe(
			'joined 24 Jan 2027 · Intermediate · Lycée Français de La Haye'
		);
	});

	it('writes the words for a member with no experience yet', () => {
		const newcomer: DelegationMember = { ...LUIS, experienceLevel: 'none' };

		expect(memberRowSubtitle(newcomer, '4 Oct')).toBe(
			'joined 4 Oct · No experience yet · Lycée Français de La Haye'
		);
	});

	it('leaves out an institution that was never given, or was only spaces', () => {
		const withoutInstitution: DelegationMember = { ...LUIS, institutionName: null };
		const withBlankInstitution: DelegationMember = { ...LUIS, institutionName: '   ' };

		expect(memberRowSubtitle(withoutInstitution, '4 Oct')).toBe('joined 4 Oct · Intermediate');
		expect(memberRowSubtitle(withBlankInstitution, '4 Oct')).toBe('joined 4 Oct · Intermediate');
	});
});

describe('memberDisplayName', () => {
	it('marks the row belonging to the reader, so a head can find themselves in the list', () => {
		expect(memberDisplayName(AMIRA, 'user-amira')).toBe('Amira Haddad (you)');
	});

	it('leaves everybody else plain', () => {
		expect(memberDisplayName(LUIS, 'user-amira')).toBe('Luis Ortega');
	});

	it('adds no experience level, unlike the dropdown on the seats page', () => {
		expect(memberDisplayName(LUIS, 'user-luis')).toBe('Luis Ortega (you)');
	});
});

describe('memberSeatLabel', () => {
	it('shortens the committee to its abbreviation when it has one', () => {
		expect(memberSeatLabel(FRANCE_SEAT)).toBe('France · UNSC');
	});

	it('writes the committee out in full when it has no abbreviation', () => {
		const seat: DelegationMemberSeat = { ...FRANCE_SEAT, committeeAbbreviation: null };

		expect(memberSeatLabel(seat)).toBe('France · Security Council');
	});

	it('names a seat that is a role rather than a country the same way', () => {
		const seat: DelegationMemberSeat = {
			seatName: 'Secretary-General',
			countryCode: null,
			committeeName: 'General Assembly',
			committeeAbbreviation: 'GA'
		};

		expect(memberSeatLabel(seat)).toBe('Secretary-General · GA');
	});
});

describe('memberActionRefusalSentence', () => {
	it('says so when the person named is not in the delegation', () => {
		expect(memberActionRefusalSentence('not_a_member', 'Luis Ortega')).toBe(
			'That person is not a member.'
		);
	});

	it('refuses the last head stepping down', () => {
		expect(memberActionRefusalSentence('last_head', 'Amira Haddad')).toBe(
			'A delegation needs at least one head.'
		);
	});

	it('names the member whose seat has to be unassigned first', () => {
		expect(memberActionRefusalSentence('holds_a_seat', 'Luis Ortega')).toBe(
			'Luis Ortega holds a seat; unassign it on the Seats page first.'
		);
	});

	it('tells a head what to do instead of removing themselves', () => {
		expect(memberActionRefusalSentence('yourself', 'Amira Haddad')).toBe(
			'You cannot remove yourself; step down or withdraw the delegation.'
		);
	});

	it('ignores the name in the three refusals that do not need it', () => {
		expect(memberActionRefusalSentence('not_a_member', '')).toBe('That person is not a member.');
		expect(memberActionRefusalSentence('last_head', '')).toBe(
			'A delegation needs at least one head.'
		);
		expect(memberActionRefusalSentence('yourself', '')).toBe(
			'You cannot remove yourself; step down or withdraw the delegation.'
		);
	});
});

describe('madeHeadFlash', () => {
	it('names the member who is now a head', () => {
		expect(madeHeadFlash('Luis Ortega')).toBe('Luis Ortega is now a head.');
	});
});

describe('memberRemovedFlash', () => {
	it('names the member who was taken out', () => {
		expect(memberRemovedFlash('Luis Ortega')).toBe('Luis Ortega removed.');
	});
});

describe('removeMemberConfirmTitle', () => {
	it('asks the question with the member in it', () => {
		expect(removeMemberConfirmTitle('Luis Ortega')).toBe('Remove Luis Ortega?');
	});
});

describe('removeMemberConfirmText', () => {
	it('spells the consequence out under that heading', () => {
		expect(removeMemberConfirmText('Luis Ortega')).toBe('Remove Luis Ortega from the delegation?');
	});
});

describe('delegationClosedNotice', () => {
	it('uses the raw status word rather than the badge label', () => {
		// `statusLabel('delegation_status', 'rejected')` is "Not accepted", and
		// "This delegation is Not accepted" is not English, so `members.md` quotes
		// the sentence with the status itself in it.
		expect(delegationClosedNotice('rejected')).toBe(
			'This delegation is rejected; nobody can join.'
		);
	});

	it('words a withdrawn delegation the same way', () => {
		expect(delegationClosedNotice('withdrawn')).toBe(
			'This delegation is withdrawn; nobody can join.'
		);
	});

	it('has nothing to say while people can still join', () => {
		expect(delegationClosedNotice('draft')).toBeNull();
		expect(delegationClosedNotice('submitted')).toBeNull();
		expect(delegationClosedNotice('accepted')).toBeNull();
	});
});

describe('memberDetailItems', () => {
	it('shows nothing at all to a reader who may not read the details', () => {
		// A member looking at another member gets `null` from the query, because
		// `profile_details` belongs to the person, their organisers and their head.
		expect(memberDetailItems(null)).toEqual([]);
	});

	it('shows both facts to a head', () => {
		expect(
			memberDetailItems({
				dateOfBirth: '2008-04-12',
				phone: '+31 6 1234 5678',
				dietaryRequirements: 'Vegetarian'
			})
		).toEqual([
			{ label: 'Phone', value: '+31 6 1234 5678' },
			{ label: 'Dietary requirements', value: 'Vegetarian' }
		]);
	});

	it('says so for a box the member never filled in', () => {
		// Both rows are drawn either way, so a head can tell "nothing was given"
		// from "not shown".
		expect(
			memberDetailItems({ dateOfBirth: null, phone: null, dietaryRequirements: null })
		).toEqual([
			{ label: 'Phone', value: MEMBER_DETAIL_MISSING },
			{ label: 'Dietary requirements', value: MEMBER_DETAIL_MISSING }
		]);
	});

	it('counts a box holding only spaces as never filled in', () => {
		expect(
			memberDetailItems({ dateOfBirth: null, phone: '   ', dietaryRequirements: 'None' })
		).toEqual([
			{ label: 'Phone', value: MEMBER_DETAIL_MISSING },
			{ label: 'Dietary requirements', value: 'None' }
		]);
	});
});

describe('sortDelegationMembers', () => {
	it('puts a head above a plain member who joined before them', () => {
		const lateHead: DelegationMember = { ...AMIRA, joinedAt: '2026-10-09T09:00:00Z' };
		const sorted = sortDelegationMembers([LUIS, lateHead]);

		expect(sorted.map((member) => member.userId)).toEqual(['user-amira', 'user-luis']);
	});

	it('puts the oldest membership first within one role', () => {
		const priya: DelegationMember = {
			...LUIS,
			userId: 'user-priya',
			fullName: 'Priya Nair',
			joinedAt: '2026-10-05T09:00:00Z',
			seat: null
		};
		const sorted = sortDelegationMembers([priya, LUIS]);

		expect(sorted.map((member) => member.userId)).toEqual(['user-luis', 'user-priya']);
	});

	it('orders two heads by when they joined as well', () => {
		const secondHead: DelegationMember = { ...LUIS, role: 'head' };
		const sorted = sortDelegationMembers([secondHead, AMIRA]);

		expect(sorted.map((member) => member.userId)).toEqual(['user-amira', 'user-luis']);
	});

	it('leaves the array it was given untouched', () => {
		// A `load` function hands its array straight to the page, so sorting in
		// place would change what the caller holds.
		const members = [LUIS, AMIRA];

		sortDelegationMembers(members);

		expect(members.map((member) => member.userId)).toEqual(['user-luis', 'user-amira']);
	});
});

describe('delegationTabs', () => {
	/** The four addresses the strip links to, as the page the reader is on. */
	const OVERVIEW_PATH = '/delegations/delegation-lycee';
	const MEMBERS_PATH = '/delegations/delegation-lycee/members';
	const SEATS_PATH = '/delegations/delegation-lycee/seats';
	const PAPERS_PATH = '/delegations/delegation-lycee/papers';

	it('gives a plain member Overview and Papers only', () => {
		// Members and Seats are head-only pages; the papers view is everybody's (T147).
		const tabs = delegationTabs('delegation-lycee', 'member', 9, 12, OVERVIEW_PATH);

		expect(tabs.map((tab) => tab.label)).toEqual(['Overview', 'Papers']);
		expect(tabs.map((tab) => tab.href)).toEqual([OVERVIEW_PATH, PAPERS_PATH]);
		expect(tabs.map((tab) => tab.isActive)).toEqual([true, false]);
	});

	it('gives a head the four pages, with counts on Members and Seats', () => {
		const tabs = delegationTabs('delegation-lycee', 'head', 9, 12, OVERVIEW_PATH);

		expect(tabs.map((tab) => tab.label)).toEqual(['Overview', 'Members', 'Seats', 'Papers']);
		expect(tabs.map((tab) => tab.href)).toEqual([
			OVERVIEW_PATH,
			MEMBERS_PATH,
			SEATS_PATH,
			PAPERS_PATH
		]);
		expect(tabs.map((tab) => tab.count)).toEqual([undefined, 9, 12, undefined]);
	});

	it('marks Overview on the dashboard, and only Overview', () => {
		// `/delegations/<id>` is the start of every other address, so a prefix
		// test would mark them all at once.
		const tabs = delegationTabs('delegation-lycee', 'head', 9, 12, OVERVIEW_PATH);

		expect(tabs.map((tab) => tab.isActive)).toEqual([true, false, false, false]);
	});

	it('marks Members on the members page', () => {
		const tabs = delegationTabs('delegation-lycee', 'head', 9, 12, MEMBERS_PATH);

		expect(tabs.map((tab) => tab.isActive)).toEqual([false, true, false, false]);
	});

	it('marks Seats on the seats page', () => {
		const tabs = delegationTabs('delegation-lycee', 'head', 9, 12, SEATS_PATH);

		expect(tabs.map((tab) => tab.isActive)).toEqual([false, false, true, false]);
	});

	it("marks Papers on the papers view and on one member's paper under it", () => {
		const onList = delegationTabs('delegation-lycee', 'member', 9, 12, PAPERS_PATH);
		const onPaper = delegationTabs('delegation-lycee', 'head', 9, 12, `${PAPERS_PATH}/seat-1`);

		expect(onList.map((tab) => tab.isActive)).toEqual([false, true]);
		expect(onPaper.map((tab) => tab.isActive)).toEqual([false, false, false, true]);
	});

	it('marks nothing on an address underneath Members or Seats', () => {
		// Those comparisons are exact, so a page underneath one of them does not
		// borrow its tab. There is no such page today; the test is what keeps the
		// match exact if one is ever added.
		const tabs = delegationTabs('delegation-lycee', 'head', 9, 12, `${SEATS_PATH}/extra`);

		expect(tabs.map((tab) => tab.isActive)).toEqual([false, false, false, false]);
	});

	it('does not mark Papers on an address that only starts with its letters', () => {
		const tabs = delegationTabs('delegation-lycee', 'head', 9, 12, `${PAPERS_PATH}-old`);

		expect(tabs.map((tab) => tab.isActive)).toEqual([false, false, false, false]);
	});
});
