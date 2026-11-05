import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import {
	addOrganizationMember,
	addStaff,
	createConferenceOwnedByMe,
	presetRoleId
} from './conference-fixtures';

// The three pieces migration 20260919160000_team_invites_and_notify.sql adds for
// the team page at /manage/[slug]/team: the `title` column on `invites` and the
// `accept_invite` that carries it onto the staff row, the
// `conference_team_has_email` question the invite form asks before it sends an
// invitation, and the `notify_invite` trigger. See
// specs/02-architecture/permissions.md for who may do what with these tables and
// specs/02-architecture/notifications.md for what a notification has to say.
//
// tests/db/invites.test.ts already covers the `invites` policies, `get_invite`,
// `list_my_invites` and everything `accept_invite` did before this migration.
// Nothing here repeats that; these are the new parts only.
//
// Since docs/roles-and-permissions.md an invitation names its role by id
// (`role_id`, one of the conference's `conference_roles`) and accepting it adds
// that role beside any the person already holds. The tests ask for the preset
// roles by name through `presetRoleId`.

/** A token is 32 url-safe characters. Any unique text does for a test. */
function makeToken(): string {
	return crypto.randomUUID().replaceAll('-', '');
}

/**
 * A title longer than the 40 characters `invites_title_length` allows. It is a
 * real job title rather than a run of letters, because that is the way somebody
 * actually runs into the limit.
 */
const TOO_LONG_TITLE = 'Deputy Secretary General for Conference Affairs';

/**
 * specs/02-architecture/notifications.md: a notification title is a full
 * sentence in plain English, under 100 characters.
 */
const MAXIMUM_NOTIFICATION_TITLE_LENGTH = 100;

describe('invites.title', () => {
	it('lets an organiser put a title on an invitation', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('invites')
			.insert({
				kind: 'conference_staff',
				conference_id: conferenceId,
				email: 'future.sg@example.com',
				role_id: await presetRoleId(supabase, conferenceId, 'Organiser'),
				title: 'Secretary General',
				token: makeToken(),
				invited_by: userId
			})
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Secretary General' }]);
	});

	it('refuses a title longer than forty characters', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		expect(TOO_LONG_TITLE.length).toBeGreaterThan(40);

		const { error } = await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'too.grand@example.com',
			role_id: await presetRoleId(supabase, conferenceId, 'Organiser'),
			title: TOO_LONG_TITLE,
			token: makeToken(),
			invited_by: userId
		});

		expect(error?.message).toContain('invites_title_length');
	});

	it('allows no title at all, which is the ordinary case', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('invites')
			.insert({
				kind: 'conference_staff',
				conference_id: conferenceId,
				email: 'plain.volunteer@example.com',
				role_id: await presetRoleId(supabase, conferenceId, 'Volunteer'),
				title: null,
				token: makeToken(),
				invited_by: userId
			})
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: null }]);
	});
});

describe('accept_invite, carrying the title onto the staff row', () => {
	it('writes the title from the invitation onto the new staff row', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		const organiserRoleId = await presetRoleId(supabase, conferenceId, 'Organiser');

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: invited.email,
			role_id: organiserRoleId,
			title: 'Secretary General',
			token,
			invited_by: userId
		});

		const { error } = await invited.supabase.rpc('accept_invite', { token });

		expect(error).toBeNull();

		const { data } = await invited.supabase
			.from('conference_staff')
			.select('title')
			.eq('conference_id', conferenceId)
			.eq('user_id', invited.userId);

		expect(data).toEqual([{ title: 'Secretary General' }]);

		// The role travels as a membership rather than as a column on the row.
		const { data: roles } = await invited.supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', invited.userId);

		expect(roles).toEqual([{ role_id: organiserRoleId }]);
	});

	it('leaves a title the person already had alone when the invitation names none', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const helper = await createSignedInClient();
		const token = makeToken();

		// The organiser typed this title on the team page. Accepting a second
		// invitation should not quietly wipe it, which is the `coalesce` branch
		// inside the function's "on conflict do update". The row itself is
		// written with the service role, because nobody may insert a staff row
		// directly any more: this one stands for an earlier accepted invitation.
		await createServiceRoleClient().from('conference_staff').insert({
			conference_id: conferenceId,
			user_id: helper.userId,
			title: 'Head of Logistics'
		});

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: helper.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Organiser'),
			token,
			invited_by: userId
		});

		const { error } = await helper.supabase.rpc('accept_invite', { token });

		expect(error).toBeNull();

		const { data } = await helper.supabase
			.from('conference_staff')
			.select('title')
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId);

		expect(data).toEqual([{ title: 'Head of Logistics' }]);
	});

	it('replaces a title the person already had when the invitation names one', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const helper = await createSignedInClient();
		const token = makeToken();

		await createServiceRoleClient().from('conference_staff').insert({
			conference_id: conferenceId,
			user_id: helper.userId,
			title: 'Head of Logistics'
		});

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: helper.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Organiser'),
			title: 'Deputy Secretary General',
			token,
			invited_by: userId
		});

		const { error } = await helper.supabase.rpc('accept_invite', { token });

		expect(error).toBeNull();

		const { data } = await helper.supabase
			.from('conference_staff')
			.select('title')
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId);

		expect(data).toEqual([{ title: 'Deputy Secretary General' }]);
	});

	it('adds the role to the ones the person already holds, rather than writing over them', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const organiser = await createSignedInClient();
		const token = makeToken();

		await addStaff(supabase, conferenceId, organiser.userId, 'organiser');

		// An organiser invited to chair used to lose the organiser role to the
		// invitation's. Roles add up now, so they keep it and gain Chair.
		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: organiser.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		const { error } = await organiser.supabase.rpc('accept_invite', { token });

		expect(error).toBeNull();

		const { data: roles } = await organiser.supabase
			.from('conference_role_members')
			.select('conference_roles(name)')
			.eq('conference_id', conferenceId)
			.eq('user_id', organiser.userId);

		const names = (roles ?? [])
			.map((row) => (row.conference_roles as unknown as { name: string } | null)?.name)
			.sort();

		expect(names).toEqual(['Chair', 'Organiser']);
	});
});

describe('conference_team_has_email', () => {
	it('says yes about somebody who is already on the conference staff', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const chair = await createSignedInClient();

		await addStaff(supabase, conferenceId, chair.userId, 'chair');

		const { data, error } = await supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: chair.email
		});

		expect(error).toBeNull();
		expect(data).toBe(true);
	});

	it('says yes about an admin of the organisation, who has no staff row at all', async () => {
		const { supabase, conferenceId, organizationId } = await createConferenceOwnedByMe();
		const colleague = await createSignedInClient();

		await addOrganizationMember(organizationId, colleague.userId, 'admin');

		// An owner or admin of the organisation is an administrator of its
		// conferences by rule 4 of docs/roles-and-permissions.md, so the team page
		// lists them although nothing was ever written about them in
		// conference_staff, and an invitation would do nothing for them.
		const { data: staffRows } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', colleague.userId);

		expect(staffRows).toEqual([]);

		const { data } = await supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: colleague.email
		});

		expect(data).toBe(true);
	});

	it('says no about a plain member of the organisation, who needs a role to be on the team', async () => {
		const { supabase, conferenceId, organizationId } = await createConferenceOwnedByMe();
		const colleague = await createSignedInClient();

		await addOrganizationMember(organizationId, colleague.userId, 'member');

		// Decision 1: being a member of the organisation no longer makes somebody
		// an organiser of each of its conferences, so inviting them is the right
		// thing to do and the form must not refuse it.
		const { data } = await supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: colleague.email
		});

		expect(data).toBe(false);
	});

	it('says no about an address that has no account', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: 'nobody.has.this.address@example.com'
		});

		expect(error).toBeNull();
		expect(data).toBe(false);
	});

	it('says no about an account that has nothing to do with the conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { data } = await supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: stranger.email
		});

		expect(data).toBe(false);
	});

	it('ignores the case of the address, because the organiser types it by hand', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const chair = await createSignedInClient();

		await addStaff(supabase, conferenceId, chair.userId, 'chair');

		const { data } = await supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: chair.email.toUpperCase()
		});

		expect(data).toBe(true);
	});

	it('refuses a stranger, rather than telling them where somebody has an account', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		// The function reads auth.users, so a "false" would still be an answer
		// about somebody's account. It raises instead.
		const { error } = await stranger.supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: 'anybody@example.com'
		});

		expect(error?.message).toContain('cannot manage that conference');
	});

	it('refuses a chair of the conference, who is on the team but does not run it', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const chair = await createSignedInClient();

		await addStaff(supabase, conferenceId, chair.userId, 'chair');

		const { error } = await chair.supabase.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: 'anybody@example.com'
		});

		expect(error?.message).toContain('cannot manage that conference');
	});

	it('is not there at all for somebody who is not signed in', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();

		// Execute is revoked from `anon`, so a visitor cannot even reach the
		// first line of the function.
		const visitor = createVisitorClient();
		const { error } = await visitor.rpc('conference_team_has_email', {
			conference_id: conferenceId,
			email: 'anybody@example.com'
		});

		expect(error).not.toBeNull();
	});
});

describe('notify_invite, invites_notify_invite', () => {
	it('tells somebody with an account that they were invited to a conference', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: invited.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		// Read as the invited person, because the notifications select policy only
		// gives somebody their own rows. That the row turns up here is what proves
		// the trigger sent it to the right account. "Test Person" is the name
		// createSignedInClient registers the fixture organiser under, and
		// "Fixture Conference" is the conference createConferenceOwnedByMe makes.
		// The role's name is not in the sentence: since 20261022121000 the bell
		// repeats no text an organiser typed (security review L1).
		const { data, error } = await invited.supabase
			.from('notifications')
			.select('kind, title, link_path, conference_id');

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				kind: 'invite_received',
				title: 'Test Person invited you to join the team of Fixture Conference',
				link_path: `/invites/${token}`,
				conference_id: conferenceId
			}
		]);
	});

	it('writes nothing when the address has no account', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'no.account.here@example.com',
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		// Nobody owns these rows, so there is no signed-in client that could look
		// for them. The service role client is the only way to count nothing.
		const admin = createServiceRoleClient();
		const { data } = await admin
			.from('notifications')
			.select('id')
			.eq('link_path', `/invites/${token}`);

		expect(data).toEqual([]);
	});

	it('tells somebody about an organisation invitation, and names no conference', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: invited.email,
			role: 'admin',
			token,
			invited_by: userId
		});

		// An invitation to an organisation belongs to no conference, so
		// conference_id stays null and the notifications page does not file it
		// under one. "Fixture org" is the organisation the fixture makes.
		const { data } = await invited.supabase
			.from('notifications')
			.select('title, link_path, conference_id');

		expect(data).toEqual([
			{
				title: 'Test Person invited you to Fixture org as an admin',
				link_path: `/invites/${token}`,
				conference_id: null
			}
		]);
	});

	it('keeps the sentence under a hundred characters for an ordinary conference name', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();

		// "Fixture Conference" is shorter than the names real conferences have, so
		// the test gives it one of a realistic length before inviting anybody.
		await supabase
			.from('conferences')
			.update({ name: 'Amsterdam International Model United Nations 2027' })
			.eq('id', conferenceId);

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: invited.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Organiser'),
			token: makeToken(),
			invited_by: userId
		});

		const { data } = await invited.supabase.from('notifications').select('title');

		expect(data?.[0].title).toBe(
			'Test Person invited you to join the team of Amsterdam International Model United Nations 2027'
		);
		expect(data?.[0].title.length).toBeLessThan(MAXIMUM_NOTIFICATION_TITLE_LENGTH);
	});
});
