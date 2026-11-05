import { describe, expect, it } from 'vitest';
import { createSignedInClient } from './supabase-test-client';
import {
	addCommittee,
	addOrganizationMember,
	addStaff,
	createConferenceOwnedByMe
} from './conference-fixtures';

// T175 put "Invite a chair" and "Chair it yourself" into the committee editor's
// Chairs panel (specs/05-pages/organiser/committee-edit.md). Two database
// pieces carry them: `ensure_chair_is_staff`, which "Chair it yourself" relies
// on to put an organiser on the conference's team, and
// `committee_chair_invite_refusal` from migration
// 20260930120000_committee_chair_invite_refusal.sql, which the invite form asks
// before it writes an invitation.
//
// Since docs/roles-and-permissions.md roles add up, so accepting a chair
// invitation demotes nobody. The refusal still answers 'organiser' for an
// administrator, because they can already run every room and the panel's own
// button is the way to put them on the committee.

describe('an organiser who chairs a committee themselves', () => {
	it('gets a staff row through ensure_chair_is_staff when they had none', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		// The owner runs the conference through the organisation, not through a
		// staff row, which is what "Chair it yourself" starts from.
		const { data: before } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', userId);

		expect(before).toEqual([]);

		const { error } = await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: userId });

		expect(error).toBeNull();

		const { data: after } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', userId);

		expect(after).toEqual([{ user_id: userId }]);

		// And they still run the room, through the organisation rather than
		// through any role on that new row.
		const { data: isChair } = await supabase.rpc('has_committee_permission', {
			committee_id: committeeId,
			permission: 'run_room'
		});

		expect(isChair).toBe(true);
	});
});

describe('committee_chair_invite_refusal', () => {
	it('has nothing against an address with no account', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		const { data, error } = await supabase.rpc('committee_chair_invite_refusal', {
			committee_id: committeeId,
			email: `nobody-${crypto.randomUUID()}@example.com`
		});

		expect(error).toBeNull();
		expect(data).toBeNull();
	});

	it('has nothing against a chair of the team who chairs another committee', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const thisCommittee = await addCommittee(supabase, conferenceId);
		const otherCommittee = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();

		await supabase
			.from('committee_chairs')
			.insert({ committee_id: otherCommittee, user_id: chair.userId });

		const { data } = await supabase.rpc('committee_chair_invite_refusal', {
			committee_id: thisCommittee,
			email: chair.email
		});

		expect(data).toBeNull();
	});

	it('has nothing against a volunteer on the team', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const volunteer = await createSignedInClient();

		await addStaff(supabase, conferenceId, volunteer.userId, 'volunteer');

		const { data } = await supabase.rpc('committee_chair_invite_refusal', {
			committee_id: committeeId,
			email: volunteer.email
		});

		expect(data).toBeNull();
	});

	it('says already_chair about somebody who chairs this committee, whatever the case of the address', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();

		// Only somebody on the team can be assigned to a committee
		// (committee_chairs_already_on_team, security review L8).
		await addStaff(supabase, conferenceId, chair.userId);
		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		const { data } = await supabase.rpc('committee_chair_invite_refusal', {
			committee_id: committeeId,
			email: chair.email.toUpperCase()
		});

		expect(data).toBe('already_chair');
	});

	it('says organiser about an admin of the organisation running the conference', async () => {
		const { supabase, conferenceId, organizationId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const colleague = await createSignedInClient();

		await addOrganizationMember(organizationId, colleague.userId, 'admin');

		const { data } = await supabase.rpc('committee_chair_invite_refusal', {
			committee_id: committeeId,
			email: colleague.email
		});

		expect(data).toBe('organiser');
	});

	it('has nothing against a plain member of the organisation, who runs nothing here yet', async () => {
		const { supabase, conferenceId, organizationId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const colleague = await createSignedInClient();

		// Decision 1 of docs/roles-and-permissions.md: a member of the
		// organisation holds nothing on a conference until given a role, so an
		// invitation to chair is exactly what they may need.
		await addOrganizationMember(organizationId, colleague.userId, 'member');

		const { data } = await supabase.rpc('committee_chair_invite_refusal', {
			committee_id: committeeId,
			email: colleague.email
		});

		expect(data).toBeNull();
	});

	it('says organiser about an administrator on the staff, who can already run every room', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const helper = await createSignedInClient();

		await addStaff(supabase, conferenceId, helper.userId, 'organiser');

		const { data } = await supabase.rpc('committee_chair_invite_refusal', {
			committee_id: committeeId,
			email: helper.email
		});

		expect(data).toBe('organiser');
	});

	it('refuses a caller who cannot manage the team', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const stranger = await createSignedInClient();

		const { data, error } = await stranger.supabase.rpc('committee_chair_invite_refusal', {
			committee_id: committeeId,
			email: stranger.email
		});

		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});
});
