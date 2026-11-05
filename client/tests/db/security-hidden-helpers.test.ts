// Security review I2. `holds_public_role` and `role_is_public` are the definer
// helpers behind two read rules, and PostgREST offered them to every signed-in
// caller as RPCs: a yes or no about any conference or role, draft conferences
// included. Since migration 20261022150000 they live in the `private` schema,
// which the API does not serve, and the two rules still work.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	addCommittee,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	giveSeatTo,
	presetRoleId
} from './conference-fixtures';
import { createSignedInClient } from './supabase-test-client';

type RpcOutcome = { error: { code: string; message: string } | null };

/**
 * supabase-js types `rpc` by the generated list of API functions, which no
 * longer names these two. The point of the test is that the API indeed does not
 * know them any more, so it has to call by plain name.
 */
function callHiddenHelper(
	client: SupabaseClient,
	name: string,
	args: Record<string, string>
): PromiseLike<RpcOutcome> {
	const rpcByName = client.rpc.bind(client) as (
		functionName: string,
		functionArgs: Record<string, string>
	) => PromiseLike<RpcOutcome>;

	return rpcByName(name, args);
}

describe('the public-role helpers in the private schema (holds_public_role, role_is_public)', () => {
	it('cannot be called through the API, even by a signed-in person', async () => {
		const fixture = await createConferenceOwnedByMe();
		const organiserRole = await presetRoleId(fixture.supabase, fixture.conferenceId, 'Organiser');
		const curious = await createSignedInClient('Curious');

		const holds = await callHiddenHelper(curious.supabase, 'holds_public_role', {
			conference_id: fixture.conferenceId,
			user_id: fixture.userId
		});
		const isPublic = await callHiddenHelper(curious.supabase, 'role_is_public', {
			role_id: organiserRole
		});

		// PGRST202 is PostgREST's "no such function in the schema cache": the
		// helper is not merely refused, it is not on offer.
		expect(holds.error?.code).toBe('PGRST202');
		expect(isPublic.error?.code).toBe('PGRST202');
	});

	it('still lets a participant see the holders of public roles, and nobody else', async () => {
		const fixture = await createConferenceOwnedByMe();
		const organiser = await createSignedInClient('Organiser');
		const volunteer = await createSignedInClient('Volunteer');
		await addStaff(fixture.supabase, fixture.conferenceId, organiser.userId, 'organiser');
		await addStaff(fixture.supabase, fixture.conferenceId, volunteer.userId, 'volunteer');

		// A delegate in a seat is a participant.
		const committee = await addCommittee(fixture.supabase, fixture.conferenceId);
		const seat = await addSeat(fixture.supabase, committee);
		const delegate = await createSignedInClient('Delegate');
		await giveSeatTo(fixture.supabase, seat, delegate.userId);

		const { data: team } = await delegate.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', fixture.conferenceId);
		const { data: memberships } = await delegate.supabase
			.from('conference_role_members')
			.select('user_id')
			.eq('conference_id', fixture.conferenceId);

		// Organiser is a public preset, Volunteer is not.
		expect(team).toContainEqual({ user_id: organiser.userId });
		expect(team).not.toContainEqual({ user_id: volunteer.userId });
		expect(memberships).toContainEqual({ user_id: organiser.userId });
		expect(memberships).not.toContainEqual({ user_id: volunteer.userId });
	});
});
