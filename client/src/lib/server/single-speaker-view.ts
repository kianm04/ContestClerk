/**
 * Reading what the Single speaker view draws besides the chair layout's
 * frame (`specs/05-pages/chair/single-speaker.md`, "Data"): the single
 * speaker's own list, with its entries (each a seat or a typed name) and its
 * purpose.
 *
 * Files under `$lib/server` only ever run on the server. Both pages that draw
 * the view, `chair/single` and `chair` while a single speaker has the floor,
 * call this one reader, so the two cannot drift apart.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isModeRunning } from '$lib/mode-start';
import type { SingleSpeakerViewData } from '$lib/single-speaker';
import { readListWithEntries } from '$lib/server/active-list';
import type { CaucusViewFrame } from '$lib/server/caucus-view';

/**
 * The running single speaker's list with every entry, and its purpose. Null
 * while no single speaker has the floor (and the room is not suspended from
 * one), when the view draws its start form instead.
 */
export async function readSingleSpeakerView(
	supabase: SupabaseClient,
	frame: CaucusViewFrame
): Promise<SingleSpeakerViewData | null> {
	const state = frame.committeeState;

	if (!isModeRunning(state, 'single_speaker')) return null;

	const listId = state.activeSpeakersListId;
	const list = listId === null ? null : await readListWithEntries(supabase, listId, frame.seats);

	if (list === null) return { list: null, purpose: null };

	return {
		list: { speakersList: list.speakersList, speakers: list.speakers },
		purpose: list.purpose
	};
}
