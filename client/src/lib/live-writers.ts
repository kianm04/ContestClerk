/**
 * The people writing one text together: who is in the text now, how each is
 * named beside the editor, and the line that says so ("Rachel is editing").
 *
 * Every open editor tells the others who is typing in it through Yjs
 * "awareness", a small shared list with one entry per open editor. Each entry
 * holds a `user`, which the editor's cursor extension sets to the writer
 * below, and the writer's cursor. The functions here read that list; they
 * know nothing about the channel that carries it.
 *
 * An entry is written by the browser that sends it, so it is only a claim.
 * The page therefore shows a writer only by looking the entry's id up in the
 * list of writers the server gave it (`resolveLiveWriter`): the name shown is
 * the server's for that id, and an id the server does not know is shown
 * nowhere.
 *
 * Writers are told apart by their names, never by a colour each: every
 * cursor is drawn the same, with the writer's first name on it.
 */

import { firstName } from '$lib/profiles';

/**
 * Somebody writing in the text: the id and name they are known by and, on a
 * paper written by several seats, the seat they write for ("Mexico").
 */
export type LiveWriter = { id: string; name: string; seatName?: string };

/** "Daniel Osei, Mexico", or just the name when the writer names no seat. */
export function writerTitle(writer: LiveWriter): string {
	return writer.seatName ? `${writer.name}, ${writer.seatName}` : writer.name;
}

/** The writer an awareness entry names, or `null` when it names nobody readable. */
export function readLiveWriter(state: unknown): LiveWriter | null {
	if (typeof state !== 'object' || state === null || !('user' in state)) return null;

	const user = state.user;

	if (typeof user !== 'object' || user === null) return null;
	if (!('id' in user) || !('name' in user)) return null;
	if (typeof user.id !== 'string' || typeof user.name !== 'string') return null;

	const writer: LiveWriter = { id: user.id, name: user.name };

	if ('seatName' in user && typeof user.seatName === 'string') writer.seatName = user.seatName;

	return writer;
}

/**
 * The writer an awareness entry stands for, from the writers the server
 * knows (`knownWriters`): the entry claims an id, and the writer shown is the
 * server's for that id, never the entry's own name or seat. `null` for an
 * entry that names nobody readable, or an id the server does not know.
 */
export function resolveLiveWriter(state: unknown, knownWriters: LiveWriter[]): LiveWriter | null {
	const claimed = readLiveWriter(state);

	if (claimed === null) return null;

	return knownWriters.find((writer) => writer.id === claimed.id) ?? null;
}

/**
 * The ids awareness entries claim that the server's list (`knownWriters`)
 * does not hold, each once. Most often that is an author added after the
 * page loaded, whom the page can ask the server about again.
 */
export function unknownWriterIds(states: Iterable<unknown>, knownWriters: LiveWriter[]): string[] {
	const unknownIds = new Set<string>();

	for (const state of states) {
		const claimed = readLiveWriter(state);

		if (claimed !== null && resolveLiveWriter(state, knownWriters) === null) {
			unknownIds.add(claimed.id);
		}
	}

	return [...unknownIds];
}

/**
 * Everybody else in the text now, from the awareness entries, each once
 * however many windows they have open, in name order. The reader is left
 * out: the editor already shows them their own cursor. Only writers the
 * server knows are listed (`resolveLiveWriter`).
 */
export function writersPresent(
	states: Iterable<unknown>,
	readerId: string,
	knownWriters: LiveWriter[]
): LiveWriter[] {
	const byId = new Map<string, LiveWriter>();

	for (const state of states) {
		const writer = resolveLiveWriter(state, knownWriters);

		if (writer && writer.id !== readerId) byId.set(writer.id, writer);
	}

	const writers = [...byId.values()];

	return writers.sort((first, second) => first.name.localeCompare(second.name));
}

/**
 * "Rachel is editing", "Rachel and Tom are editing" or "Rachel, Tom and
 * Aisha are editing", by first name; `null` when nobody else is in the text.
 */
export function editingText(writers: LiveWriter[]): string | null {
	const names = writers.map((writer) => firstName(writer.name));

	if (names.length === 0) return null;
	if (names.length === 1) return `${names[0]} is editing`;

	const allButLast = names.slice(0, -1).join(', ');

	return `${allButLast} and ${names[names.length - 1]} are editing`;
}
