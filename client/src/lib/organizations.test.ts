import { describe, expect, it } from 'vitest';
import {
	EMPTY_INVITE_MEMBER,
	hasInviteMemberErrors,
	hasOrganizationDetailsErrors,
	INVITE_MEMBER_ROLE_OPTIONS,
	isOrganizationAdmin,
	isOrganizationInviteExpired,
	memberRoleOptions,
	NEW_ORGANIZATION,
	ORGANIZATION_DESCRIPTION_MAX_LENGTH,
	ORGANIZATION_LOGO_ACCEPTED_TYPES,
	ORGANIZATION_LOGO_MAX_SIZE_MB,
	ORGANIZATION_NAME_MAX_LENGTH,
	readInviteMember,
	readOrganizationDetails,
	sortOrganizationMembers,
	startingOrganization,
	stripeConnectionState,
	validateInviteMember,
	validateOrganizationChoice,
	validateOrganizationDetails,
	validateOrganizationLogo,
	type InviteMemberValues,
	type Organization,
	type OrganizationDetailsValues,
	type OrganizationMember,
	type PendingOrganizationInvite
} from './organizations';

/** That same logo limit in bytes, so a test can describe a file just over it. */
const LOGO_MAX_SIZE_BYTES = ORGANIZATION_LOGO_MAX_SIZE_MB * 1024 * 1024;

/** One member of the organisation, an admin unless a test says otherwise. */
function makeMember(overrides: Partial<OrganizationMember> = {}): OrganizationMember {
	return {
		userId: 'user-nadia',
		fullName: 'Nadia Haddad',
		avatarPath: null,
		role: 'admin',
		isMe: false,
		...overrides
	};
}

/** An invitation nobody has accepted, running out at noon on 29 September 2026. */
function makeInvite(overrides: Partial<PendingOrganizationInvite> = {}): PendingOrganizationInvite {
	return {
		id: 'invite-1',
		token: 'a'.repeat(32),
		email: 'member@example.org',
		role: 'member',
		expiresAt: '2026-09-29T12:00:00Z',
		...overrides
	};
}

/** A details form somebody could really have filled in, so a test can change one field of it. */
function detailsValues(
	changes: Partial<OrganizationDetailsValues> = {}
): OrganizationDetailsValues {
	return {
		name: 'The Hague International Model United Nations',
		description: 'A conference organisation based in The Hague.',
		countryCode: 'NL',
		websiteUrl: 'https://thimun.org',
		...changes
	};
}

/** An invitation form somebody could really have filled in. */
function inviteValues(changes: Partial<InviteMemberValues> = {}): InviteMemberValues {
	return {
		email: 'member@example.org',
		role: 'member',
		...changes
	};
}

/** Build a `FormData` out of plain fields, the way a posted form arrives. */
function formDataOf(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return formData;
}

describe('isOrganizationAdmin', () => {
	it('lets owners and admins change things', () => {
		expect(isOrganizationAdmin('owner')).toBe(true);
		expect(isOrganizationAdmin('admin')).toBe(true);
	});

	it('gives a plain member the read-only page', () => {
		expect(isOrganizationAdmin('member')).toBe(false);
	});
});

describe('stripeConnectionState', () => {
	it('is none when there is no Stripe account yet', () => {
		expect(stripeConnectionState(false, null)).toBe('none');
	});

	it('is pending when the account exists but onboarding is unfinished', () => {
		expect(stripeConnectionState(true, null)).toBe('pending');
	});

	it('is connected once onboarding finished', () => {
		expect(stripeConnectionState(true, '2026-09-01T10:00:00Z')).toBe('connected');
	});

	it('is none when a completion date turns up without an account', () => {
		// Nothing in the app can write that combination. It is answered as `none`
		// because with no account there is nothing to open or continue.
		expect(stripeConnectionState(false, '2026-09-01T10:00:00Z')).toBe('none');
	});
});

describe('memberRoleOptions', () => {
	it('lets an owner hand ownership over', () => {
		expect(memberRoleOptions('owner')).toEqual([
			{ value: 'owner', label: 'Owner' },
			{ value: 'admin', label: 'Admin' },
			{ value: 'member', label: 'Member' }
		]);
	});

	it('does not offer owner to an admin', () => {
		expect(memberRoleOptions('admin')).toEqual([
			{ value: 'admin', label: 'Admin' },
			{ value: 'member', label: 'Member' }
		]);
	});

	it('does not offer owner to a member either', () => {
		const values = memberRoleOptions('member').map((option) => option.value);

		expect(values).toEqual(['admin', 'member']);
	});
});

describe('sortOrganizationMembers', () => {
	it('puts owners above admins above members', () => {
		const members = [
			makeMember({ userId: 'user-member', fullName: 'Ana Silva', role: 'member' }),
			makeMember({ userId: 'user-admin', fullName: 'Ben Fischer', role: 'admin' }),
			makeMember({ userId: 'user-owner', fullName: 'Chen Wei', role: 'owner' })
		];

		const sorted = sortOrganizationMembers(members).map((member) => member.userId);

		expect(sorted).toEqual(['user-owner', 'user-admin', 'user-member']);
	});

	it('sorts the people who share a role by name', () => {
		const members = [
			makeMember({ userId: 'user-zoe', fullName: 'Zoe Adams' }),
			makeMember({ userId: 'user-ana', fullName: 'Ana Silva' }),
			makeMember({ userId: 'user-ben', fullName: 'Ben Fischer' })
		];

		const sorted = sortOrganizationMembers(members).map((member) => member.userId);

		expect(sorted).toEqual(['user-ana', 'user-ben', 'user-zoe']);
	});

	it('leaves the array it was given alone', () => {
		// `load` hands its array straight to the page, so sorting in place would
		// change what the caller holds.
		const members = [
			makeMember({ userId: 'user-member', role: 'member' }),
			makeMember({ userId: 'user-owner', role: 'owner' })
		];

		sortOrganizationMembers(members);

		expect(members[0].userId).toBe('user-member');
	});
});

describe('isOrganizationInviteExpired', () => {
	it('is false while the deadline is still ahead', () => {
		const stillFresh = new Date('2026-09-29T11:59:59Z');

		expect(isOrganizationInviteExpired(makeInvite(), stillFresh)).toBe(false);
	});

	it('is true once the deadline has passed', () => {
		const afterwards = new Date('2026-09-29T12:00:01Z');

		expect(isOrganizationInviteExpired(makeInvite(), afterwards)).toBe(true);
	});

	it('counts the deadline itself as expired', () => {
		// `accept_invite` in the database refuses `expires_at <= now()`, so the
		// page must not offer a link the database would turn away.
		const exactly = new Date('2026-09-29T12:00:00Z');

		expect(isOrganizationInviteExpired(makeInvite(), exactly)).toBe(true);
	});
});

describe('readOrganizationDetails', () => {
	it('reads the four fields without surrounding spaces', () => {
		const formData = formDataOf({
			name: '  THIMUN  ',
			description: '  A conference organisation.  ',
			countryCode: 'NL',
			websiteUrl: '  https://thimun.org  '
		});

		expect(readOrganizationDetails(formData)).toEqual({
			name: 'THIMUN',
			description: 'A conference organisation.',
			countryCode: 'NL',
			websiteUrl: 'https://thimun.org'
		});
	});

	it('puts a country code from an edited form into capitals', () => {
		expect(readOrganizationDetails(formDataOf({ countryCode: 'nl' })).countryCode).toBe('NL');
	});

	it('adds https:// to an address that was typed without it', () => {
		expect(readOrganizationDetails(formDataOf({ websiteUrl: 'thimun.org' })).websiteUrl).toBe(
			'https://thimun.org'
		);
	});

	it('leaves an address that already says http:// alone', () => {
		const formData = formDataOf({ websiteUrl: 'http://thimun.org' });

		expect(readOrganizationDetails(formData).websiteUrl).toBe('http://thimun.org');
	});

	it('reads an untouched form as four empty fields', () => {
		expect(readOrganizationDetails(new FormData())).toEqual({
			name: '',
			description: '',
			countryCode: '',
			websiteUrl: ''
		});
	});
});

describe('validateOrganizationDetails', () => {
	it('finds nothing wrong with a form that is filled in properly', () => {
		expect(validateOrganizationDetails(detailsValues())).toEqual({});
	});

	it('asks for a name when the box is empty', () => {
		expect(validateOrganizationDetails(detailsValues({ name: '' })).name).toBe(
			'Please enter a name.'
		);
	});

	it('asks for a name when the box holds nothing but spaces', () => {
		expect(validateOrganizationDetails(detailsValues({ name: '   ' })).name).toBe(
			'Please enter a name.'
		);
	});

	it('refuses a name longer than 120 characters', () => {
		const values = detailsValues({ name: 'x'.repeat(ORGANIZATION_NAME_MAX_LENGTH + 1) });

		expect(validateOrganizationDetails(values).name).toBe(
			'Please keep the name under 120 characters.'
		);
	});

	it('accepts a name of exactly 120 characters', () => {
		const values = detailsValues({ name: 'x'.repeat(ORGANIZATION_NAME_MAX_LENGTH) });

		expect(validateOrganizationDetails(values).name).toBe(undefined);
	});

	it('refuses a description longer than 1000 characters', () => {
		const tooLong = 'x'.repeat(ORGANIZATION_DESCRIPTION_MAX_LENGTH + 1);

		expect(validateOrganizationDetails(detailsValues({ description: tooLong })).description).toBe(
			'Please keep the description under 1000 characters.'
		);
	});

	it('accepts an empty description, because it is optional', () => {
		expect(validateOrganizationDetails(detailsValues({ description: '' })).description).toBe(
			undefined
		);
	});

	it('accepts no country at all', () => {
		expect(validateOrganizationDetails(detailsValues({ countryCode: '' })).countryCode).toBe(
			undefined
		);
	});

	it('refuses a country code that is not a real one', () => {
		expect(validateOrganizationDetails(detailsValues({ countryCode: 'ZZ' })).countryCode).toBe(
			'Please pick a country.'
		);
	});

	it('accepts no website at all', () => {
		expect(validateOrganizationDetails(detailsValues({ websiteUrl: '' })).websiteUrl).toBe(
			undefined
		);
	});

	it('refuses something that is not a web address', () => {
		expect(
			validateOrganizationDetails(detailsValues({ websiteUrl: 'not an address' })).websiteUrl
		).toBe('Please enter a web address, such as www.example.org.');
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values = detailsValues({ name: '', countryCode: 'ZZ', websiteUrl: 'nonsense' });
		const errors = validateOrganizationDetails(values);

		expect(Object.keys(errors).sort()).toEqual(['countryCode', 'name', 'websiteUrl']);
	});
});

describe('validateOrganizationLogo', () => {
	it('accepts a JPEG under the size limit', () => {
		expect(validateOrganizationLogo({ type: 'image/jpeg', size: 1024 })).toBe(null);
	});

	it('accepts PNG and WebP as well', () => {
		expect(validateOrganizationLogo({ type: 'image/png', size: 1024 })).toBe(null);
		expect(validateOrganizationLogo({ type: 'image/webp', size: 1024 })).toBe(null);
	});

	it('refuses a file that is not one of those three types', () => {
		expect(validateOrganizationLogo({ type: 'image/gif', size: 1024 })).toBe(
			'Please upload a JPEG, PNG or WebP image.'
		);
	});

	it('refuses a file larger than 5 MB', () => {
		const tooBig = { type: 'image/png', size: LOGO_MAX_SIZE_BYTES + 1 };

		expect(validateOrganizationLogo(tooBig)).toBe('The logo must be under 5 MB.');
	});

	it('accepts a file of exactly 5 MB', () => {
		expect(validateOrganizationLogo({ type: 'image/png', size: LOGO_MAX_SIZE_BYTES })).toBe(null);
	});

	it('tells a large PDF it is the wrong kind of file, not too big a one', () => {
		const largePdf = { type: 'application/pdf', size: LOGO_MAX_SIZE_BYTES + 1 };

		expect(validateOrganizationLogo(largePdf)).toBe('Please upload a JPEG, PNG or WebP image.');
	});

	it('answers an empty file box with the type message', () => {
		// An untouched file input still posts a file: one of no size, with no type.
		expect(validateOrganizationLogo({ type: '', size: 0 })).toBe(
			'Please upload a JPEG, PNG or WebP image.'
		);
	});
});

describe('ORGANIZATION_LOGO_ACCEPTED_TYPES', () => {
	it('is written the way the HTML accept attribute wants it', () => {
		expect(ORGANIZATION_LOGO_ACCEPTED_TYPES).toBe('image/jpeg,image/png,image/webp');
	});
});

describe('hasOrganizationDetailsErrors', () => {
	it('is false when nothing needs fixing', () => {
		expect(hasOrganizationDetailsErrors({})).toBe(false);
	});

	it('is true when one field needs fixing', () => {
		expect(hasOrganizationDetailsErrors({ name: 'Please enter a name.' })).toBe(true);
	});

	it('is true when only the logo needs fixing', () => {
		const errors = { logo: 'Please upload a JPEG, PNG or WebP image.' };

		expect(hasOrganizationDetailsErrors(errors)).toBe(true);
	});
});

describe('EMPTY_INVITE_MEMBER', () => {
	it('starts the form on the role that can change the least', () => {
		expect(EMPTY_INVITE_MEMBER).toEqual({ email: '', role: 'member' });
	});
});

describe('INVITE_MEMBER_ROLE_OPTIONS', () => {
	it('offers Admin and Member, worded the way a badge words them', () => {
		expect(INVITE_MEMBER_ROLE_OPTIONS).toEqual([
			{ value: 'admin', label: 'Admin' },
			{ value: 'member', label: 'Member' }
		]);
	});

	it('never offers ownership by email', () => {
		const values = INVITE_MEMBER_ROLE_OPTIONS.map((option) => option.value);

		expect(values).not.toContain('owner');
	});
});

describe('readInviteMember', () => {
	it('reads the two fields without surrounding spaces', () => {
		const formData = formDataOf({ email: '  member@example.org  ', role: 'admin' });

		expect(readInviteMember(formData)).toEqual({ email: 'member@example.org', role: 'admin' });
	});

	it('reads an untouched form as two empty fields', () => {
		expect(readInviteMember(new FormData())).toEqual({ email: '', role: '' });
	});
});

describe('validateInviteMember', () => {
	it('finds nothing wrong with an invitation that is filled in properly', () => {
		expect(validateInviteMember(inviteValues())).toEqual({});
	});

	it('accepts an admin invitation as well', () => {
		expect(validateInviteMember(inviteValues({ role: 'admin' }))).toEqual({});
	});

	it('asks for an email address when the box is empty', () => {
		expect(validateInviteMember(inviteValues({ email: '' })).email).toBe(
			'Please enter your email address.'
		);
	});

	it('refuses something that is not an email address', () => {
		expect(validateInviteMember(inviteValues({ email: 'member.example.org' })).email).toBe(
			'That does not look like an email address.'
		);
	});

	it('asks for a role when none was picked', () => {
		expect(validateInviteMember(inviteValues({ role: '' })).role).toBe('Please pick a role.');
	});

	it('refuses an invitation that tries to hand over ownership', () => {
		expect(validateInviteMember(inviteValues({ role: 'owner' })).role).toBe('Please pick a role.');
	});

	it('collects both problems at once rather than stopping at the first', () => {
		const errors = validateInviteMember(inviteValues({ email: '', role: 'owner' }));

		expect(Object.keys(errors).sort()).toEqual(['email', 'role']);
	});
});

describe('hasInviteMemberErrors', () => {
	it('is false when nothing needs fixing', () => {
		expect(hasInviteMemberErrors({})).toBe(false);
	});

	it('is true when one field needs fixing', () => {
		expect(hasInviteMemberErrors({ role: 'Please pick a role.' })).toBe(true);
	});
});

describe('startingOrganization', () => {
	const riverside: Organization = { id: 'organization-1', name: 'Riverside MUN Society' };
	const harbour: Organization = { id: 'organization-2', name: 'Harbour MUN Society' };

	it('starts on the only organisation when the reader has exactly one', () => {
		expect(startingOrganization('', [riverside])).toBe('organization-1');
	});

	it('chooses nothing in advance when there are several to choose between', () => {
		expect(startingOrganization('', [riverside, harbour])).toBe('');
	});

	it('keeps what was chosen before, even "+ New organization"', () => {
		expect(startingOrganization(NEW_ORGANIZATION, [riverside])).toBe(NEW_ORGANIZATION);
	});
});

describe('validateOrganizationChoice', () => {
	it('asks for the name of a new organisation when it is empty', () => {
		const choice = { selectedOrganization: NEW_ORGANIZATION, newOrganizationName: '' };

		expect(validateOrganizationChoice(choice, [])).toBe(
			'Please enter the name of your organisation.'
		);
	});

	it('refuses a new organisation name longer than 120 characters', () => {
		const choice = {
			selectedOrganization: NEW_ORGANIZATION,
			newOrganizationName: 'x'.repeat(ORGANIZATION_NAME_MAX_LENGTH + 1)
		};

		expect(validateOrganizationChoice(choice, [])).toBe(
			"Please keep the organisation's name under 120 characters."
		);
	});

	it('accepts a new organisation with a name', () => {
		const choice = { selectedOrganization: NEW_ORGANIZATION, newOrganizationName: 'Delft MUN' };

		expect(validateOrganizationChoice(choice, [])).toBe(null);
	});
});
