import { describe, expect, it } from 'vitest';
import type { Conference } from './conferences';
import {
	inviteRoleLabel,
	inviteSentence,
	isManagingNothing,
	staffConferenceHref,
	type ManageIndex,
	type PendingInvite,
	type StaffConference
} from './manage';
import type { ManagedOrganization } from './organizations';

/**
 * A conference with every field filled in, which the helpers below copy.
 *
 * A `Conference` has a lot of fields and these tests only care about its slug,
 * so this one sits here once rather than in every test.
 */
const SAMPLE_CONFERENCE: Conference = {
	id: 'conference-thimun',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: null,
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
	city: 'The Hague',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 8,
	committeeNames: [],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** An organisation the reader belongs to, with Stripe already connected. */
const SAMPLE_ORGANIZATION: ManagedOrganization = {
	id: 'organization-thimun',
	name: 'THIMUN Foundation',
	slug: 'thimun-foundation',
	logoPath: null,
	isStripeConnected: true
};

/** A conference the reader helps with, as a chair unless a test says otherwise. */
function makeStaffConference(roleNames: string[] = ['Chair'], mayManage = false): StaffConference {
	return { conference: SAMPLE_CONFERENCE, roleNames, mayManage };
}

/** An invitation waiting for the reader, to an organisation unless a test says otherwise. */
function makeInvite(overrides: Partial<PendingInvite> = {}): PendingInvite {
	return {
		id: 'invite-1',
		kind: 'organization_member',
		role: 'owner',
		name: 'Sample Europe MUN Network',
		...overrides
	};
}

/** What `/manage` shows somebody who runs nothing at all. */
const EMPTY_INDEX: ManageIndex = {
	organizations: [],
	staffConferences: [],
	pendingInvites: []
};

describe('isManagingNothing', () => {
	it('is true for somebody with nothing at all', () => {
		expect(isManagingNothing(EMPTY_INDEX)).toBe(true);
	});

	it('is false for a member of an organisation', () => {
		const index: ManageIndex = {
			...EMPTY_INDEX,
			organizations: [{ organization: SAMPLE_ORGANIZATION, myRole: 'owner', conferences: [] }]
		};

		expect(isManagingNothing(index)).toBe(false);
	});

	it('is false for somebody who only helps with a conference', () => {
		const index: ManageIndex = { ...EMPTY_INDEX, staffConferences: [makeStaffConference()] };

		expect(isManagingNothing(index)).toBe(false);
	});

	it('is still true while an invitation is waiting', () => {
		// The invitation is drawn above the empty state, not instead of it:
		// somebody who has only been invited to something runs nothing until
		// they accept it.
		const index: ManageIndex = { ...EMPTY_INDEX, pendingInvites: [makeInvite()] };

		expect(isManagingNothing(index)).toBe(true);
	});
});

describe('inviteRoleLabel', () => {
	it('gives the words for an organisation role', () => {
		expect(inviteRoleLabel(makeInvite({ role: 'owner' }))).toBe('Owner');
		expect(inviteRoleLabel(makeInvite({ role: 'admin' }))).toBe('Admin');
	});

	it("gives a conference role's name as the conference wrote it", () => {
		// A conference invitation carries the role's own name, which is already
		// the words to show: "Chair", or "USG delegate affairs".
		expect(inviteRoleLabel(makeInvite({ kind: 'conference_staff', role: 'Chair' }))).toBe('Chair');
		expect(
			inviteRoleLabel(makeInvite({ kind: 'conference_staff', role: 'USG delegate affairs' }))
		).toBe('USG delegate affairs');
	});

	it('falls back to the text in the column for a role it does not know', () => {
		// `accept_invite` in the database refuses any other role, so nobody
		// should ever see this. It is here so that a surprise in the column
		// cannot leave the sentence half written.
		const invite = makeInvite({ role: 'sponsor' });

		expect(inviteRoleLabel(invite)).toBe('sponsor');
	});
});

describe('inviteSentence', () => {
	it('names the organisation and the role', () => {
		const invite = makeInvite({ name: 'Sample Europe MUN Network', role: 'owner' });

		expect(inviteSentence(invite)).toBe('You were invited to Sample Europe MUN Network as Owner.');
	});

	it('names the conference for an invitation to a team', () => {
		const invite = makeInvite({
			kind: 'conference_staff',
			role: 'Volunteer',
			name: 'THIMUN 2027'
		});

		expect(inviteSentence(invite)).toBe('You were invited to THIMUN 2027 as Volunteer.');
	});
});

describe('staffConferenceHref', () => {
	it('sends an organiser to the management area', () => {
		expect(staffConferenceHref(makeStaffConference(['Organiser'], true))).toBe(
			'/manage/thimun-2027'
		);
	});

	it('sends a chair to the public conference page', () => {
		// `has_permission(id, 'administrator')` is only true for an organiser, so the
		// management area would answer a chair with a 404.
		expect(staffConferenceHref(makeStaffConference(['Chair']))).toBe('/conferences/thimun-2027');
	});

	it('sends a volunteer to the public conference page', () => {
		expect(staffConferenceHref(makeStaffConference(['Volunteer']))).toBe(
			'/conferences/thimun-2027'
		);
	});
});
