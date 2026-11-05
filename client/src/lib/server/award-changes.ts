/**
 * Writing awards: a chair proposing, rewording and withdrawing, and an
 * organiser confirming, adding, renaming, deleting and publishing.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so the `awards` policies and the triggers
 * beside them decide what is allowed: `guard_award_insert` makes every new
 * award arrive `proposed` in the name of whoever asked, and
 * `protect_awards_columns` keeps its wording to that person while it is
 * proposed and its `status` to an organiser. Reading awards is in `awards.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Award, AwardKind, AwardStatus } from '$lib/awards';

/** The code Postgres answers with when a row breaks a `unique` constraint. */
const UNIQUE_VIOLATION_CODE = '23505';

/** The code Postgres answers with when an id is not a valid uuid at all. */
const INVALID_ID_CODE = '22P02';

/** What an award form writes: the seat, the kind and the title to show. */
export type AwardWording = {
	seatId: string;
	kind: AwardKind;
	title: string;
};

/** Whether a write went through, or the seat already has an award of that kind. */
export type AwardWriteResult = 'saved' | 'duplicate';

/**
 * Propose an award for a seat of a committee. It arrives `proposed`, and the
 * database writes the reader in as the one who proposed it.
 *
 * `awardId` is the id the browser chose for its optimistic row (T141), so the
 * saved award and the one the screen already shows are the same row. Leaving
 * it out, as the organiser's own "Add award" does, lets the database choose one.
 */
export async function proposeAward(
	supabase: SupabaseClient,
	committeeId: string,
	wording: AwardWording,
	awardId: string | null = null
): Promise<{ result: AwardWriteResult; awardId: string | null }> {
	const { data, error } = await supabase
		.from('awards')
		.insert({
			// Leaving `id` out lets the database choose it.
			...(awardId === null ? {} : { id: awardId }),
			committee_id: committeeId,
			seat_id: wording.seatId,
			kind: wording.kind,
			title: wording.title
		})
		.select('id')
		.single();

	if (error?.code === UNIQUE_VIOLATION_CODE) return { result: 'duplicate', awardId: null };

	if (error) {
		throw new Error(`Could not propose the award: ${error.message}`);
	}

	return { result: 'saved', awardId: data.id };
}

/**
 * Add an award as an organiser, already confirmed.
 *
 * Two statements, because `guard_award_insert` lets nobody insert an award
 * that is not `proposed`: the organiser proposes it, which the insert policy
 * allows because an organiser counts as a chair of every committee, and then
 * confirms it, which only an organiser may.
 */
export async function addConfirmedAward(
	supabase: SupabaseClient,
	committeeId: string,
	wording: AwardWording
): Promise<AwardWriteResult> {
	const { result, awardId } = await proposeAward(supabase, committeeId, wording);

	if (result === 'duplicate' || awardId === null) return result;

	const isConfirmed = await setAwardStatus(supabase, awardId, 'confirmed');

	if (!isConfirmed) {
		throw new Error('Could not confirm the award that was just added.');
	}

	return 'saved';
}

/** Reword a proposal: its seat, its kind and its title. */
export async function updateAwardProposal(
	supabase: SupabaseClient,
	awardId: string,
	wording: AwardWording
): Promise<AwardWriteResult> {
	const { error } = await supabase
		.from('awards')
		.update({ seat_id: wording.seatId, kind: wording.kind, title: wording.title })
		.eq('id', awardId);

	if (error?.code === UNIQUE_VIOLATION_CODE) return 'duplicate';

	if (error) {
		throw new Error(`Could not change the award: ${error.message}`);
	}

	return 'saved';
}

/**
 * Confirm or unconfirm an award, which only an organiser may do. Answers
 * whether a row changed, so a refused or vanished award reads as `false`.
 */
export async function setAwardStatus(
	supabase: SupabaseClient,
	awardId: string,
	status: AwardStatus
): Promise<boolean> {
	const { data, error } = await supabase
		.from('awards')
		.update({ status })
		.eq('id', awardId)
		.select('id');

	if (error?.code === INVALID_ID_CODE) return false;

	if (error) {
		throw new Error(`Could not change the award's status: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * Rename a custom award the reader added themself.
 *
 * `protect_awards_columns` lets the person who proposed an award reword it
 * only while it is `proposed`. An award an organiser added is already
 * confirmed, so it goes back to `proposed` first, and the second statement
 * renames and confirms it again in one go.
 */
export async function renameAward(
	supabase: SupabaseClient,
	award: Pick<Award, 'id' | 'status'>,
	title: string
): Promise<void> {
	if (award.status === 'confirmed') {
		await setAwardStatus(supabase, award.id, 'proposed');
	}

	const { error } = await supabase
		.from('awards')
		.update({ title, status: award.status })
		.eq('id', award.id);

	if (error) {
		throw new Error(`Could not rename the award: ${error.message}`);
	}
}

/**
 * Delete one award of a committee. Answers false when nothing was deleted:
 * the award is gone already, belongs to another committee, or the delete
 * policy refused it. A refused delete is not an error in Postgres, so the
 * deleted rows are read back to tell.
 */
export async function deleteAward(
	supabase: SupabaseClient,
	committeeId: string,
	awardId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('awards')
		.delete()
		.eq('id', awardId)
		.eq('committee_id', committeeId)
		.select('id');

	if (error?.code === INVALID_ID_CODE) return false;

	if (error) {
		throw new Error(`Could not delete the award: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * Publish the conference's awards at a moment: now, or one the organiser
 * scheduled. Setting `awards_published_at` is all it does; the database's
 * `freeze_award_user` copies each holder onto their award and
 * `notify_awards_published` tells them, dated at that moment.
 */
export async function publishAwards(
	supabase: SupabaseClient,
	conferenceId: string,
	publishAt: string
): Promise<void> {
	await writeAwardsPublishedAt(supabase, conferenceId, publishAt);
}

/** Hide the awards again. Notifications already sent stay. */
export async function unpublishAwards(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<void> {
	await writeAwardsPublishedAt(supabase, conferenceId, null);
}

/**
 * Write `conferences.awards_published_at`. The conference row's update policy
 * belongs to `edit_conference`, so publishing goes through the database's
 * `set_awards_published_at`, which asks `confirm_awards` instead and refuses
 * anybody without it.
 */
async function writeAwardsPublishedAt(
	supabase: SupabaseClient,
	conferenceId: string,
	publishAt: string | null
): Promise<void> {
	const { error } = await supabase.rpc('set_awards_published_at', {
		conference_id: conferenceId,
		// The generated type says `string`; the function takes null as "hide them".
		published_at: publishAt as string
	});

	if (error) {
		throw new Error(`Could not change when the awards are published: ${error.message}`);
	}
}
