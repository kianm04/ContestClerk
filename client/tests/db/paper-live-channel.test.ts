import type { RealtimeChannel } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addDelegation,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveSeatTo
} from './conference-fixtures';

// T148: the members of a delegation type in one position paper together. Their
// browsers send the paper's changes to each other over a private Realtime
// broadcast channel, `paper:<seat id>`, and Realtime Authorization asks the
// policies on `realtime.messages` who may join it. Those ask
// `may_join_paper_channel`, which asks T147's `may_edit_paper_draft`: the
// seat's delegate and their delegation, and nobody else.
//
// `$lib/paper-live-channel.ts` joins the channel the same way the tests below do.

/** How long a test waits for Realtime to answer before failing. */
const REALTIME_TIMEOUT_MS = 10_000;

/** A seated writer and a fellow member of their delegation, and the seat's channel name. */
type ChannelFixture = {
	writer: SignedInClient;
	member: SignedInClient;
	conferenceId: string;
	topic: string;
};

async function createChannelFixture(): Promise<ChannelFixture> {
	const fixture = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const writer = await createSignedInClient('Tom Price');
	const member = await createSignedInClient('Rachel Morgan');

	// The member starts the delegation, as its head, and the writer joins it.
	const delegationId = await addDelegation(member.supabase, fixture.conferenceId, "St Aidan's");
	const { error } = await createServiceRoleClient()
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: writer.userId, role: 'member' });

	if (error) {
		throw new Error(`Could not add the fixture member: ${error.message}`);
	}

	await giveSeatTo(fixture.supabase, seatId, writer.userId);

	return { writer, member, conferenceId: fixture.conferenceId, topic: `paper:${seatId}` };
}

/**
 * Join `topic`, as a private channel unless `isPrivate` is false, and answer the first status that settles
 * it: `SUBSCRIBED` when Realtime let the reader in, or the refusal. The
 * channel is handed back so a test can speak or listen on it.
 */
function joinChannel(
	reader: SignedInClient,
	topic: string,
	onMessage: (payload: unknown) => void = () => {},
	isPrivate = true
): Promise<{ status: string; channel: RealtimeChannel }> {
	return new Promise((resolve) => {
		const channel = reader.supabase.channel(topic, { config: { private: isPrivate } });
		const giveUp = setTimeout(() => resolve({ status: 'no answer', channel }), REALTIME_TIMEOUT_MS);

		channel
			.on('broadcast', { event: 'test' }, (message) => onMessage(message.payload))
			.subscribe((status) => {
				if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					clearTimeout(giveUp);
					resolve({ status, channel });
				}
			});
	});
}

/** Answer the first message `listener` hears, or `null` when none arrives in time. */
async function sendAndHear(
	speaker: SignedInClient,
	listener: SignedInClient,
	topic: string,
	isListenerPrivate = true
): Promise<{ listenerStatus: string; heard: unknown }> {
	let hear: (payload: unknown) => void = () => {};
	const heard = new Promise<unknown>((resolve) => {
		hear = resolve;
		setTimeout(() => resolve(null), REALTIME_TIMEOUT_MS);
	});

	const listening = await joinChannel(
		listener,
		topic,
		(payload) => hear(payload),
		isListenerPrivate
	);
	const speaking = await joinChannel(speaker, topic);

	if (listening.status === 'SUBSCRIBED') {
		await speaking.channel.send({ type: 'broadcast', event: 'test', payload: { text: 'Hello' } });
	}

	const result = { listenerStatus: listening.status, heard: await heard };
	await listener.supabase.removeChannel(listening.channel);
	await speaker.supabase.removeChannel(speaking.channel);

	return result;
}

describe("a paper's live channel", () => {
	it('lets the delegation join it and hear what a member sends', async () => {
		const fixture = await createChannelFixture();

		const result = await sendAndHear(fixture.writer, fixture.member, fixture.topic);

		expect(result).toEqual({ listenerStatus: 'SUBSCRIBED', heard: { text: 'Hello' } });
	});

	it('refuses somebody outside the delegation, who hears nothing', async () => {
		const fixture = await createChannelFixture();
		const stranger = await createSignedInClient('Aisha Bello');

		const result = await sendAndHear(fixture.writer, stranger, fixture.topic);

		expect(result).toEqual({ listenerStatus: 'CHANNEL_ERROR', heard: null });
	});

	it('keeps what the delegation sends from a stranger listening on a public channel of that name', async () => {
		const fixture = await createChannelFixture();
		const stranger = await createSignedInClient('Aisha Bello');

		const result = await sendAndHear(fixture.writer, stranger, fixture.topic, false);

		expect(result).toEqual({ listenerStatus: 'SUBSCRIBED', heard: null });
	});

	it('refuses a member of another delegation of the same conference', async () => {
		const fixture = await createChannelFixture();
		const rival = await createSignedInClient('Omar Haddad');
		await addDelegation(rival.supabase, fixture.conferenceId, 'Rival School');

		const joined = await joinChannel(rival, fixture.topic);
		await rival.supabase.removeChannel(joined.channel);

		expect(joined.status).toBe('CHANNEL_ERROR');
	});

	it('answers false for a topic that is not a paper, rather than failing', async () => {
		const fixture = await createChannelFixture();
		const topics = [fixture.topic, 'paper:not-a-seat', 'committee-room:x', ''];

		const answers = await Promise.all(
			topics.map(async (topic) => {
				const { data } = await fixture.member.supabase.rpc('may_join_paper_channel', { topic });
				return data;
			})
		);

		expect(answers).toEqual([true, false, false, false]);
	});
});
