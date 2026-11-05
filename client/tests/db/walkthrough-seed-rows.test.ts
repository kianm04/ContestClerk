import { afterEach, describe, expect, it } from 'vitest';
import { restoreSeedRows, snapshotSeedRows, type SeedRowScope } from '../e2e/walkthrough-seed';
import { createServiceRoleClient } from './supabase-test-client';

// The helper the click-budget browser tests use to put the walkthrough seed
// back after a walk (`tests/e2e/walkthrough-seed.ts`). It is tested here, on
// the real database, because what it promises is what the database holds
// afterwards.
//
// The scope is the committees of "Northbridge MUN (draft)", which nobody has
// applied to, so changing them for a moment reaches nobody's notifications.

/** The draft walkthrough conference, from `supabase/walkthrough-seed.sql`. */
const DRAFT_CONFERENCE_ID = 'f2000000-0000-4000-8000-000000000001';

/** Its one committee, UNEP. */
const UNEP_ID = 'f3000000-0000-4000-8000-000000000011';

const DRAFT_COMMITTEES: SeedRowScope = {
	table: 'committees',
	column: 'conference_id',
	value: DRAFT_CONFERENCE_ID
};

/** The draft conference's committees as they are now, oldest first, without `updated_at`. */
async function readDraftCommittees(): Promise<Record<string, unknown>[]> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('committees')
		.select('id, slug, name, abbreviation, description, topics, room, position, level')
		.eq('conference_id', DRAFT_CONFERENCE_ID)
		.order('id');

	if (error || !data) {
		throw new Error(`Could not read the draft committees: ${error?.message}`);
	}

	return data;
}

describe('restoreSeedRows', () => {
	// Whatever a failed test left behind is put back too, so the next suite
	// finds the seed whole.
	let snapshotToRestore: Awaited<ReturnType<typeof snapshotSeedRows>> | null = null;

	afterEach(async () => {
		if (snapshotToRestore) {
			await restoreSeedRows(snapshotToRestore);
			snapshotToRestore = null;
		}
	});

	it('puts a changed row back and removes a row the walk added', async () => {
		const before = await readDraftCommittees();
		snapshotToRestore = await snapshotSeedRows(DRAFT_COMMITTEES);

		const admin = createServiceRoleClient();
		const { error: updateError } = await admin
			.from('committees')
			.update({ description: 'Changed by a walk.' })
			.eq('id', UNEP_ID);
		const { error: insertError } = await admin.from('committees').insert({
			conference_id: DRAFT_CONFERENCE_ID,
			slug: 'added-by-a-walk',
			name: 'Added by a walk',
			position: 1
		});
		expect(updateError).toBeNull();
		expect(insertError).toBeNull();
		expect(await readDraftCommittees()).not.toEqual(before);

		await restoreSeedRows(snapshotToRestore);
		snapshotToRestore = null;

		expect(await readDraftCommittees()).toEqual(before);
	});

	it('leaves the rows alone when the walk changed nothing', async () => {
		const before = await readDraftCommittees();
		const snapshot = await snapshotSeedRows(DRAFT_COMMITTEES);

		await restoreSeedRows(snapshot);

		expect(await readDraftCommittees()).toEqual(before);
	});
});
