/**
 * Carrying a paper's changes between the browsers writing it.
 *
 * Every page open on a paper joins one private Realtime broadcast channel:
 * `paper:<seat id>` for a position paper, which the seat's delegate and their
 * delegation may join, and `committee-paper:<paper id>:<epoch>` for a paper
 * written in committee, which only its authors may join while they write it.
 * Realtime Authorization asks the policies on `realtime.messages` who gets in,
 * once, when the page joins. The epoch is the paper's `live_epoch`, which
 * moves on whenever its authors change: the pages still on the paper hear the
 * paper's row change, or read the epoch again when they start listening, and
 * move to the channel named after the new epoch, so a writer who lost access
 * is left alone on the old one and refused when they next join. The pages send each other two kinds of message:
 *
 * - `changes`: new Yjs updates to the document, and the writer's cursor
 *   ("awareness"), gathered for a moment and sent as one message.
 * - `sync`: "this is what I hold", as a Yjs state vector. Whoever hears it
 *   answers with the changes the sender lacks, and once with a `sync` of its
 *   own, so a page that was offline both catches up and hands on what it
 *   wrote meanwhile.
 *
 * Nothing is stored here: each page also saves its document through one of
 * its page's form actions (`$lib/paper-live-save.svelte.ts`).
 *
 * This file runs in the browser. It is not under `$lib/server`, because the
 * connection is the reader's own.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	removeAwarenessStates,
	type Awareness
} from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { LiveStatus } from '$lib/committee-room-live';
import { base64ToBytes, bytesToBase64, paperDocumentLineage } from '$lib/paper-document';
import { watchPaperEpoch } from '$lib/paper-epoch-watch';
import { giveRealtimeTheToken } from '$lib/realtime-auth';

/**
 * How long changes are gathered before they are sent, in milliseconds. It
 * keeps a fast typist to a few messages a second, well inside Realtime's
 * limits, and still reaches the others "within about a second".
 */
export const SEND_INTERVAL_MS = 150;

/** Marks a change that came from the channel, so it is not sent straight back. */
export const CHANNEL_ORIGIN = 'paper-channel';

/** The name of a seat's position paper channel, which the policies on `realtime.messages` read. */
export function paperChannelTopic(seatId: string): string {
	return `paper:${seatId}`;
}

/** The name of a committee paper's channel at one epoch of its authors, which the same policies read. */
export function committeePaperChannelTopic(paperId: string, epoch: number): string {
	return `committee-paper:${paperId}:${epoch}`;
}

/** A committee paper and the epoch of its authors its channel is named after. */
export type PaperChannelEpoch = { paperId: string; epoch: number };

/** The epoch a changed `committee_papers` row carries, or `null` for a row without one. */
function readLiveEpoch(row: unknown): number | null {
	if (typeof row !== 'object' || row === null || !('live_epoch' in row)) return null;

	return typeof row.live_epoch === 'number' ? row.live_epoch : null;
}

/** A `changes` message: either part may be missing. Every message names its document's lineage. */
type ChangesMessage = { lineage: number | null; update?: string; awareness?: string };

/** A `sync` message. `isReply` stops two pages answering each other's syncs for ever. */
type SyncMessage = { lineage: number | null; vector: string; isReply: boolean };

/*
	Closing a channel finishes a moment later, and Supabase hands back the
	closing channel to anybody who opens one with the same name meanwhile. A
	paper opened again straight away, as after a quick back and forward,
	waits for the last one to close first.
*/
let lastLeave: Promise<unknown> = Promise.resolve();

/** What `joinPaperChannel` needs. */
export type PaperChannelSetup = {
	supabase: SupabaseClient;
	/** The channel's name, from `paperChannelTopic` or `committeePaperChannelTopic`. */
	topic: string;
	/**
	 * For a committee paper, the paper and the epoch its name was made with:
	 * the page then follows the paper's row and moves channel when the epoch
	 * moves on. A position paper's channel keeps its name.
	 */
	epoch?: PaperChannelEpoch;
	document: Y.Doc;
	awareness: Awareness;
	/** Hears whether the channel is connecting, live or paused. */
	onStatus: (status: LiveStatus) => void;
};

/**
 * Join the paper's channel and keep `document` and `awareness` in step with
 * every other page on it. Answers a function that leaves the channel.
 */
export function joinPaperChannel(setup: PaperChannelSetup): () => void {
	const { supabase, document, awareness } = setup;
	const lineage = paperDocumentLineage(document);
	let topic = setup.topic;
	let epoch = setup.epoch?.epoch ?? null;
	let channel: RealtimeChannel | null = null;
	/** The channel that hears the paper's row change, for a committee paper. */
	let epochChannel: RealtimeChannel | null = null;
	let isLive = false;
	let hasLeft = false;
	let waitingUpdates: Uint8Array[] = [];
	let isCursorWaiting = false;
	let sendTimer: ReturnType<typeof setTimeout> | undefined;

	/** Send a message, if the channel is live. A message lost while it is not is made up by `sync`. */
	function send(event: 'changes' | 'sync', payload: ChangesMessage | SyncMessage) {
		if (channel === null || !isLive) return;

		void channel.send({ type: 'broadcast', event, payload });
	}

	/** This page's own cursor, as an awareness update. */
	function ownCursor(): string {
		return bytesToBase64(encodeAwarenessUpdate(awareness, [document.clientID]));
	}

	function sendWaitingChanges() {
		sendTimer = undefined;
		const message: ChangesMessage = { lineage };

		if (waitingUpdates.length > 0) message.update = bytesToBase64(Y.mergeUpdates(waitingUpdates));
		if (isCursorWaiting) message.awareness = ownCursor();

		waitingUpdates = [];
		isCursorWaiting = false;
		send('changes', message);
	}

	function scheduleSend() {
		sendTimer ??= setTimeout(sendWaitingChanges, SEND_INTERVAL_MS);
	}

	function sendSync(isReply: boolean) {
		send('sync', { lineage, vector: bytesToBase64(Y.encodeStateVector(document)), isReply });
	}

	// Changes typed here, or saved changes the server sent back, go to the others.
	function handleDocumentUpdate(update: Uint8Array, origin: unknown) {
		if (origin === CHANNEL_ORIGIN) return;

		waitingUpdates.push(update);
		scheduleSend();
	}

	// This page's cursor moved, or its entry was renewed so the others keep it.
	function handleAwarenessUpdate(changes: { updated: number[]; added: number[] }, origin: unknown) {
		const isOwn = [...changes.added, ...changes.updated].includes(document.clientID);

		if (origin === CHANNEL_ORIGIN || !isOwn) return;

		isCursorWaiting = true;
		scheduleSend();
	}

	function handleChanges(message: ChangesMessage) {
		if (message.lineage !== lineage) return;

		if (message.update) Y.applyUpdate(document, base64ToBytes(message.update), CHANNEL_ORIGIN);
		if (message.awareness) {
			applyAwarenessUpdate(awareness, base64ToBytes(message.awareness), CHANNEL_ORIGIN);
		}
	}

	function handleSync(message: SyncMessage) {
		if (message.lineage !== lineage) return;

		const missing = Y.encodeStateAsUpdate(document, base64ToBytes(message.vector));
		send('changes', { lineage, update: bytesToBase64(missing), awareness: ownCursor() });

		if (!message.isReply) sendSync(true);
	}

	function handleStatus(status: string) {
		isLive = status === 'SUBSCRIBED';
		setup.onStatus(isLive ? 'live' : 'paused');

		// Joined, or joined again after a drop: find out what the others wrote meanwhile.
		if (isLive) sendSync(false);
	}

	function join() {
		if (hasLeft) return;

		// `private: true` makes Realtime ask the policies on `realtime.messages` first.
		channel = supabase.channel(topic, { config: { private: true } });
		channel
			.on('broadcast', { event: 'changes' }, ({ payload }) => handleChanges(payload))
			.on('broadcast', { event: 'sync' }, ({ payload }) => handleSync(payload))
			.subscribe(handleStatus);
	}

	/** Leave the channel joined so far and join the one `topic` names now. */
	function rejoin() {
		if (hasLeft) return;

		if (channel !== null) {
			isLive = false;
			setup.onStatus('connecting');
			lastLeave = supabase.removeChannel(channel);
			channel = null;
		}

		void lastLeave.then(join);
	}

	// The paper's row changed. If its authors did, the channel has a new name:
	// move there, where the others who may still write are going too.
	function handlePaperChange(row: unknown) {
		const next = readLiveEpoch(row);

		if (setup.epoch === undefined || next === null || next === epoch) return;

		epoch = next;
		topic = committeePaperChannelTopic(setup.epoch.paperId, next);
		rejoin();
	}

	/*
		A change made before the watch below was listening, or while it was cut
		off, is never sent again. So whenever it starts listening, the first
		time or after a drop, the page reads the epoch as it stands now.
	*/
	async function catchUpOnEpoch(paperId: string) {
		const { data } = await supabase
			.from('committee_papers')
			.select('live_epoch')
			.eq('id', paperId)
			.maybeSingle();

		if (data !== null) handlePaperChange(data);
	}

	/*
		Follow the paper's row for a committee paper (`./paper-epoch-watch.ts`).
		The change carries the whole row, its Markdown too, which its readers
		may read anyway; only the epoch is used here.
	*/
	function watchEpoch() {
		if (hasLeft || setup.epoch === undefined) return;

		const { paperId } = setup.epoch;
		epochChannel = watchPaperEpoch(supabase, paperId, handlePaperChange, () => {
			void catchUpOnEpoch(paperId);
		});
	}

	setup.onStatus('connecting');
	document.on('update', handleDocumentUpdate);
	awareness.on('update', handleAwarenessUpdate);
	// The channel is private, so it joins once Realtime holds the reader's token
	// (`./realtime-auth.ts`); without it Realtime would turn the join away.
	void lastLeave
		.then(() => giveRealtimeTheToken(supabase))
		.then(() => {
			join();
			watchEpoch();
		});

	return () => {
		hasLeft = true;
		clearTimeout(sendTimer);
		document.off('update', handleDocumentUpdate);
		awareness.off('update', handleAwarenessUpdate);

		// Tell the others this page has gone, so its cursor goes at once.
		removeAwarenessStates(awareness, [document.clientID], 'leave');
		send('changes', { lineage, awareness: ownCursor() });

		if (epochChannel !== null) void supabase.removeChannel(epochChannel);
		if (channel !== null) lastLeave = supabase.removeChannel(channel);
	};
}
