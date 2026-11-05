import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';

// The `notifications` table: who may read a notification, and what they may
// change about it. See the `notifications` row of
// specs/02-architecture/permissions.md and specs/02-architecture/notifications.md.
//
// Only database triggers insert rows here, and the triggers arrive with the
// tables whose changes they announce. Until then the tests make their rows with
// the service role client, which stands in for a trigger.

/** Put one notification in the table the way a trigger would. */
async function giveNotification(
	recipient: SignedInClient,
	overrides: Record<string, unknown> = {}
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('notifications')
		.insert({
			user_id: recipient.userId,
			kind: 'invite_received',
			title: 'Sample Europe MUN Network invited you as an organiser',
			link_path: '/invites/sample-token',
			...overrides
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test notification: ${error?.message}`);
	}

	return data.id;
}

describe('notifications, reading', () => {
	it('shows a person their own notifications', async () => {
		const reader = await createSignedInClient();
		await giveNotification(reader);

		const { data, error } = await reader.supabase.from('notifications').select('title, read_at');

		expect(error).toBeNull();
		expect(data?.length).toBe(1);
		expect(data?.[0].read_at).toBeNull();
	});

	it("never shows a person somebody else's notifications", async () => {
		const owner = await createSignedInClient();
		await giveNotification(owner);

		const nosyPerson = await createSignedInClient();
		const { data } = await nosyPerson.supabase.from('notifications').select('title');

		expect(data).toEqual([]);
	});

	it('hides a notification that is dated in the future until that moment', async () => {
		const reader = await createSignedInClient();
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

		// This is how an award announcement waits for the moment the organiser
		// chose, without anything having to run on a timer.
		await giveNotification(reader, {
			kind: 'award_published',
			title: 'You received Best Delegate in the Security Council',
			created_at: tomorrow
		});

		const { data } = await reader.supabase.from('notifications').select('title');

		expect(data).toEqual([]);
	});
});

describe('notifications, writing', () => {
	it('lets a person mark their own notification as read', async () => {
		const reader = await createSignedInClient();
		const notificationId = await giveNotification(reader);

		const { data, error } = await reader.supabase
			.from('notifications')
			.update({ read_at: new Date().toISOString() })
			.eq('id', notificationId)
			.select('read_at');

		expect(error).toBeNull();
		expect(data?.[0].read_at).not.toBeNull();
	});

	it("refuses to let a person mark somebody else's notification as read", async () => {
		const owner = await createSignedInClient();
		const notificationId = await giveNotification(owner);

		const nosyPerson = await createSignedInClient();
		const { data } = await nosyPerson.supabase
			.from('notifications')
			.update({ read_at: new Date().toISOString() })
			.eq('id', notificationId)
			.select('id');

		expect(data).toEqual([]);

		// And it really is still unread for the person it belongs to.
		const { data: stillUnread } = await owner.supabase
			.from('notifications')
			.select('read_at')
			.eq('id', notificationId)
			.single();

		expect(stillUnread?.read_at).toBeNull();
	});

	it('refuses to let anybody rewrite what a notification says', async () => {
		const reader = await createSignedInClient();
		const notificationId = await giveNotification(reader);

		const { error } = await reader.supabase
			.from('notifications')
			.update({ title: 'Something the app never sent' })
			.eq('id', notificationId);

		expect(error?.message).toContain('read_at');
	});

	it('refuses to let anybody send themselves a notification', async () => {
		const person = await createSignedInClient();

		const { error } = await person.supabase.from('notifications').insert({
			user_id: person.userId,
			kind: 'invoice_paid',
			title: 'A payment that never happened'
		});

		expect(error).not.toBeNull();
	});

	it('lets a person delete their own notification', async () => {
		const reader = await createSignedInClient();
		const notificationId = await giveNotification(reader);

		const { data, error } = await reader.supabase
			.from('notifications')
			.delete()
			.eq('id', notificationId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: notificationId }]);
	});

	it("refuses to let a person delete somebody else's notification", async () => {
		const owner = await createSignedInClient();
		const notificationId = await giveNotification(owner);

		const nosyPerson = await createSignedInClient();
		const { data } = await nosyPerson.supabase
			.from('notifications')
			.delete()
			.eq('id', notificationId)
			.select('id');

		expect(data).toEqual([]);
	});
});
