import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSignedInClient } from './supabase-test-client';
import { addSession, addStaff, createCommitteeRoom } from './conference-fixtures';

// `committee_state.agenda_topic` (T127): the topic under debate, one of the
// committee's `topics` or null. The update policy "A chair can run the room"
// decides who may change it, like every other column of the row, and two
// triggers keep it one of the topics:
//
//   * `check_committee_agenda_topic` refuses a new agenda that is not a topic,
//     but only looks when the agenda really changes, so an agenda that went
//     stale never stops a chair from running the timer;
//   * `clear_stale_committee_agenda` sets it back to null when an organiser
//     edits the topics and the agenda is no longer one of them.
//
// specs/02-architecture/data-model.md has the column and
// specs/06-features/chairing.md the rule in words.

// The two topics every fixture committee here debates.
const FIRST_TOPIC = 'Climate finance';
const SECOND_TOPIC = 'Protection of civilians';

/** Give the fixture committee its topics, through the organiser's own client. */
async function giveTopics(
	organiser: SupabaseClient,
	committeeId: string,
	topics: string[]
): Promise<void> {
	const { error } = await organiser.from('committees').update({ topics }).eq('id', committeeId);

	if (error) {
		throw new Error(`Could not give the fixture committee its topics: ${error.message}`);
	}
}

/** The agenda as the organiser, who can always read the state, sees it. */
async function readAgenda(organiser: SupabaseClient, committeeId: string): Promise<string | null> {
	const { data, error } = await organiser
		.from('committee_state')
		.select('agenda_topic')
		.eq('committee_id', committeeId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture agenda: ${error?.message}`);
	}

	return data.agenda_topic;
}

/** Set the agenda through `client`, answering the rows it changed and any error. */
async function setAgenda(client: SupabaseClient, committeeId: string, topic: string | null) {
	return client
		.from('committee_state')
		.update({ agenda_topic: topic })
		.eq('committee_id', committeeId)
		.select('agenda_topic');
}

describe('committee_state.agenda_topic', () => {
	it('starts empty on a new committee', async () => {
		const room = await createCommitteeRoom();

		expect(await readAgenda(room.supabase, room.committeeId)).toBeNull();
	});

	it("lets a chair and an organiser put one of the committee's topics on the floor", async () => {
		const room = await createCommitteeRoom();
		await giveTopics(room.supabase, room.committeeId, [FIRST_TOPIC, SECOND_TOPIC]);

		const { data: chairSet, error: chairError } = await setAgenda(
			room.chair.supabase,
			room.committeeId,
			SECOND_TOPIC
		);

		expect(chairError).toBeNull();
		expect(chairSet).toEqual([{ agenda_topic: SECOND_TOPIC }]);

		// `has_committee_permission(id, 'run_room')` answers yes for the conference's organiser too.
		const { data: organiserSet, error: organiserError } = await setAgenda(
			room.supabase,
			room.committeeId,
			FIRST_TOPIC
		);

		expect(organiserError).toBeNull();
		expect(organiserSet).toEqual([{ agenda_topic: FIRST_TOPIC }]);
	});

	it('refuses a delegate, a volunteer and a chair of another committee', async () => {
		const room = await createCommitteeRoom();
		const otherRoom = await createCommitteeRoom();
		await giveTopics(room.supabase, room.committeeId, [FIRST_TOPIC, SECOND_TOPIC]);

		const volunteer = await createSignedInClient('Fixture Volunteer');
		await addStaff(room.supabase, room.conferenceId, volunteer.userId);

		// A refused update of a row the caller may read but not write comes back
		// empty rather than as an error, because the policy hides the row.
		for (const outsider of [room.delegate, volunteer, otherRoom.chair]) {
			const { data } = await setAgenda(outsider.supabase, room.committeeId, FIRST_TOPIC);

			expect(data).toEqual([]);
		}

		expect(await readAgenda(room.supabase, room.committeeId)).toBeNull();
	});

	it("refuses an agenda that is not one of the committee's topics", async () => {
		const room = await createCommitteeRoom();
		await giveTopics(room.supabase, room.committeeId, [FIRST_TOPIC]);

		// Close is not enough: the topic has to be written exactly as the organiser wrote it.
		for (const topic of ['Sanctions', 'climate finance', '']) {
			const { error } = await setAgenda(room.chair.supabase, room.committeeId, topic);

			expect(error?.message).toContain("The agenda must be one of the committee's topics.");
		}

		expect(await readAgenda(room.supabase, room.committeeId)).toBeNull();
	});

	it('lets a chair clear the agenda again', async () => {
		const room = await createCommitteeRoom();
		await giveTopics(room.supabase, room.committeeId, [FIRST_TOPIC]);
		await setAgenda(room.chair.supabase, room.committeeId, FIRST_TOPIC);

		const { error } = await setAgenda(room.chair.supabase, room.committeeId, null);

		expect(error).toBeNull();
		expect(await readAgenda(room.supabase, room.committeeId)).toBeNull();
	});

	it('clears the agenda when an organiser takes its topic away, and keeps it otherwise', async () => {
		const room = await createCommitteeRoom();
		await giveTopics(room.supabase, room.committeeId, [FIRST_TOPIC, SECOND_TOPIC]);
		await setAgenda(room.chair.supabase, room.committeeId, FIRST_TOPIC);

		// Removing the other topic leaves the one under debate alone.
		await giveTopics(room.supabase, room.committeeId, [FIRST_TOPIC]);
		expect(await readAgenda(room.supabase, room.committeeId)).toBe(FIRST_TOPIC);

		// Renaming the topic under debate means the room no longer debates it.
		await giveTopics(room.supabase, room.committeeId, ['Climate finance and adaptation']);
		expect(await readAgenda(room.supabase, room.committeeId)).toBeNull();
	});

	it('lets a chair keep running the room with an agenda set', async () => {
		const room = await createCommitteeRoom();
		await giveTopics(room.supabase, room.committeeId, [FIRST_TOPIC]);
		await setAgenda(room.chair.supabase, room.committeeId, FIRST_TOPIC);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// An update that does not name the agenda leaves it where it was.
		const { data, error } = await room.chair.supabase
			.from('committee_state')
			.update({ mode: 'formal_debate', current_session_id: sessionId })
			.eq('committee_id', room.committeeId)
			.select('mode, agenda_topic');

		expect(error).toBeNull();
		expect(data).toEqual([{ mode: 'formal_debate', agenda_topic: FIRST_TOPIC }]);
	});
});
