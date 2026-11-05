import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { LiveStatus } from './committee-room-live';
import {
	openPaperDocument,
	paperDocumentMarkdown,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from './paper-document';
import {
	SEND_INTERVAL_MS,
	committeePaperChannelTopic,
	joinPaperChannel,
	paperChannelTopic,
	type PaperChannelSetup
} from './paper-live-channel';

// Realtime itself is not here: `tests/db/paper-live-channel.test.ts` shows who
// its policies let in, and `tests/e2e/delegation-papers.spec.ts` two browsers
// writing through it. These tests play Realtime with a stand-in that hands
// every broadcast to the other pages on the same channel, to check what the
// pages say to each other.

const SEAT_ID = '6f1c1f0e-2a4b-4c8d-9e0f-1a2b3c4d5e6f';

type Handler = (message: { payload: unknown }) => void;

/** One page's end of a channel, as the stand-in keeps it. */
type StandInChannel = {
	topic: string;
	isPrivate: boolean;
	isSubscribed: boolean;
	handlers: Map<string, Handler>;
	reportStatus: (status: string) => void;
};

/**
 * A stand-in Realtime shared by every page in one test. `client()` gives
 * each page its own Supabase client; a broadcast on one page reaches every
 * other page subscribed to the same topic, but not the sender. A channel
 * opened without options, as for database changes, is a public one. A read
 * of a committee paper's row answers `stored.liveEpoch`.
 */
function createRealtime() {
	const channels: StandInChannel[] = [];
	const sent: { event: string; payload: unknown }[] = [];
	const stored = { liveEpoch: 0 };

	function deliver(from: StandInChannel, event: string, payload: unknown) {
		sent.push({ event, payload });
		const listeners = channels.filter(
			(other) => other !== from && other.topic === from.topic && other.isSubscribed
		);

		for (const listener of listeners) listener.handlers.get(event)?.({ payload });
	}

	function client() {
		function channel(topic: string, options?: { config: { private: boolean } }) {
			const standIn: StandInChannel = {
				topic,
				isPrivate: options?.config.private ?? false,
				isSubscribed: false,
				handlers: new Map(),
				reportStatus: () => {}
			};
			channels.push(standIn);

			// Every step hands the channel back, which is what lets the module chain them.
			const realtimeChannel = {
				standIn,
				on: (_type: string, filter: { event: string }, handler: Handler) => {
					standIn.handlers.set(filter.event, handler);
					return realtimeChannel;
				},
				subscribe: (onStatus?: (status: string) => void) => {
					standIn.reportStatus = onStatus ?? (() => {});
					return realtimeChannel;
				},
				send: (message: { event: string; payload: unknown }) => {
					deliver(standIn, message.event, message.payload);
					return Promise.resolve('ok');
				}
			};

			return realtimeChannel;
		}

		function removeChannel(realtimeChannel: { standIn: StandInChannel }) {
			realtimeChannel.standIn.isSubscribed = false;
			channels.splice(channels.indexOf(realtimeChannel.standIn), 1);
			return Promise.resolve('ok');
		}

		// The page first waits for Realtime to hold the reader's token, which the
		// stand-in has at once.
		const realtime = { setAuth: () => Promise.resolve() };

		// `from('committee_papers').select('live_epoch').eq(...).maybeSingle()`.
		const readRow = {
			select: () => readRow,
			eq: () => readRow,
			maybeSingle: () => Promise.resolve({ data: { live_epoch: stored.liveEpoch }, error: null })
		};
		const from = () => readRow;

		return { channel, removeChannel, realtime, from } as unknown as SupabaseClient;
	}

	/** Realtime answers a page's subscription with `status`. */
	function answer(index: number, status: string) {
		const standIn = channels[index];
		standIn.isSubscribed = status === 'SUBSCRIBED';
		standIn.reportStatus(status);
	}

	/** The database tells every page listening on `topic` that a row now reads `row`. */
	function changeRow(topic: string, row: Record<string, unknown>) {
		for (const listener of channels.filter((each) => each.topic === topic)) {
			listener.handlers.get('UPDATE')?.({ new: row } as unknown as { payload: unknown });
		}
	}

	/** The index of the channel named `topic`, which moves as channels close. */
	function indexOf(topic: string): number {
		return channels.findIndex((channel) => channel.topic === topic);
	}

	return { client, answer, changeRow, indexOf, channels, sent, stored };
}

type Page = {
	document: Y.Doc;
	awareness: Awareness;
	statuses: LiveStatus[];
	leave: () => void;
};

const openAwareness: Awareness[] = [];

/** A page with the paper open, joined to the stand-in Realtime: a position paper's unless `setup` says otherwise. */
function openPage(
	realtime: ReturnType<typeof createRealtime>,
	markdown: string,
	setup: Partial<PaperChannelSetup> = {}
): Page {
	const document = openPaperDocument(seedPaperDocument(markdown));
	const awareness = new Awareness(document);
	openAwareness.push(awareness);
	const statuses: LiveStatus[] = [];

	const leave = joinPaperChannel({
		supabase: realtime.client(),
		topic: paperChannelTopic(SEAT_ID),
		document,
		awareness,
		onStatus: (status) => statuses.push(status),
		...setup
	});

	return { document, awareness, statuses, leave };
}

/** Type `text` at the end of a page's paper. */
function type(page: Page, text: string) {
	writeMarkdownIntoPaperDocument(page.document, `${paperDocumentMarkdown(page.document)}${text}`);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	for (const awareness of openAwareness.splice(0)) awareness.destroy();
	vi.useRealTimers();
});

describe('paperChannelTopic', () => {
	it("is the seat's id after `paper:`, which the Realtime policies read", () => {
		expect(paperChannelTopic(SEAT_ID)).toBe(`paper:${SEAT_ID}`);
	});
});

describe('committeePaperChannelTopic', () => {
	it("is the paper's id and the epoch of its authors after `committee-paper:`, which the Realtime policies read", () => {
		const paperId = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a';

		expect(committeePaperChannelTopic(paperId, 4)).toBe(`committee-paper:${paperId}:4`);
	});
});

describe('joinPaperChannel', () => {
	it("joins the seat's channel as a private one, and says when it is live or paused", async () => {
		const realtime = createRealtime();
		const page = openPage(realtime, 'Words.');
		await vi.advanceTimersByTimeAsync(0);

		expect(realtime.channels[0].topic).toBe(`paper:${SEAT_ID}`);
		expect(realtime.channels[0].isPrivate).toBe(true);

		realtime.answer(0, 'SUBSCRIBED');
		realtime.answer(0, 'CHANNEL_ERROR');

		expect(page.statuses).toEqual(['connecting', 'live', 'paused']);
	});

	it("carries one page's typing to the other within the send interval", async () => {
		const realtime = createRealtime();
		const tom = openPage(realtime, 'France supports the treaty.');
		const rachel = openPage(realtime, 'France supports the treaty.');
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(0, 'SUBSCRIBED');
		realtime.answer(1, 'SUBSCRIBED');

		type(tom, ' Tom agrees.');
		type(rachel, ' Rachel too.');
		await vi.advanceTimersByTimeAsync(SEND_INTERVAL_MS);

		const tomsPaper = paperDocumentMarkdown(tom.document);
		expect(tomsPaper).toContain('Tom agrees.');
		expect(tomsPaper).toContain('Rachel too.');
		expect(paperDocumentMarkdown(rachel.document)).toBe(tomsPaper);
	});

	it('brings a page that joins late up to date, and hands on what it wrote meanwhile', async () => {
		const realtime = createRealtime();
		const tom = openPage(realtime, 'Start.');
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(0, 'SUBSCRIBED');
		type(tom, ' Written before Rachel came.');
		await vi.advanceTimersByTimeAsync(SEND_INTERVAL_MS);

		const rachel = openPage(realtime, 'Start.');
		type(rachel, ' Written offline.');
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(1, 'SUBSCRIBED');

		expect(paperDocumentMarkdown(rachel.document)).toContain('Written before Rachel came.');
		expect(paperDocumentMarkdown(tom.document)).toContain('Written offline.');
	});

	it('ignores a page whose paper is another draft, as after a submit and a fresh start', async () => {
		const realtime = createRealtime();
		const oldPage = openPage(realtime, 'The paper as it was submitted.');
		const newPage = openPage(realtime, 'A new draft.');
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(0, 'SUBSCRIBED');
		realtime.answer(1, 'SUBSCRIBED');

		type(oldPage, ' Late words.');
		await vi.advanceTimersByTimeAsync(SEND_INTERVAL_MS);

		expect(paperDocumentMarkdown(newPage.document)).toBe('A new draft.');
	});

	it("shows the others' cursors, and takes a page's cursor away when it leaves", async () => {
		const realtime = createRealtime();
		const tom = openPage(realtime, 'Words.');
		const rachel = openPage(realtime, 'Words.');
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(0, 'SUBSCRIBED');
		realtime.answer(1, 'SUBSCRIBED');

		rachel.awareness.setLocalStateField('user', { id: 'rachel', name: 'Rachel Morgan' });
		await vi.advanceTimersByTimeAsync(SEND_INTERVAL_MS);
		expect(tom.awareness.getStates().get(rachel.document.clientID)).toEqual({
			user: { id: 'rachel', name: 'Rachel Morgan' }
		});

		rachel.leave();
		expect(tom.awareness.getStates().has(rachel.document.clientID)).toBe(false);
		expect(realtime.channels).toHaveLength(1);
	});

	it("follows a committee paper's epoch to a new channel when its authors change", async () => {
		const realtime = createRealtime();
		const paperId = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a';
		const page = openPage(realtime, 'Words.', {
			topic: committeePaperChannelTopic(paperId, 2),
			epoch: { paperId, epoch: 2 }
		});
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(0, 'SUBSCRIBED');

		// The page listens, publicly, for the paper's own row changing.
		expect(realtime.channels.map((channel) => [channel.topic, channel.isPrivate])).toEqual([
			[`committee-paper:${paperId}:2`, true],
			[`committee-paper-epoch:${paperId}`, false]
		]);

		// A save of the title changes the row but not the authors: nothing moves.
		realtime.changeRow(`committee-paper-epoch:${paperId}`, { id: paperId, live_epoch: 2 });
		await vi.advanceTimersByTimeAsync(0);
		expect(realtime.channels).toHaveLength(2);

		// An author left: the page leaves the old channel for the one named after the new epoch.
		realtime.changeRow(`committee-paper-epoch:${paperId}`, { id: paperId, live_epoch: 3 });
		await vi.advanceTimersByTimeAsync(0);

		expect(realtime.channels.map((channel) => channel.topic)).toEqual([
			`committee-paper-epoch:${paperId}`,
			`committee-paper:${paperId}:3`
		]);
		expect(realtime.channels[1].isPrivate).toBe(true);
		expect(page.statuses).toEqual(['connecting', 'live', 'connecting']);

		realtime.answer(1, 'SUBSCRIBED');
		expect(page.statuses.at(-1)).toBe('live');

		page.leave();
		expect(realtime.channels).toHaveLength(0);
	});

	it('reads the epoch again whenever it starts watching, so a change it missed still moves it', async () => {
		const realtime = createRealtime();
		const paperId = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a';
		const watchTopic = `committee-paper-epoch:${paperId}`;
		const page = openPage(realtime, 'Words.', {
			topic: committeePaperChannelTopic(paperId, 2),
			epoch: { paperId, epoch: 2 }
		});
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(0, 'SUBSCRIBED');

		// The authors changed after the page loaded, before the watch listened.
		realtime.stored.liveEpoch = 3;
		realtime.answer(realtime.indexOf(watchTopic), 'SUBSCRIBED');
		await vi.advanceTimersByTimeAsync(0);

		expect(realtime.channels.map((channel) => channel.topic)).toEqual([
			watchTopic,
			`committee-paper:${paperId}:3`
		]);

		// The watch drops, the authors change again meanwhile, and it comes back.
		realtime.answer(realtime.indexOf(watchTopic), 'CHANNEL_ERROR');
		realtime.stored.liveEpoch = 4;
		realtime.answer(realtime.indexOf(watchTopic), 'SUBSCRIBED');
		await vi.advanceTimersByTimeAsync(0);

		expect(realtime.channels.map((channel) => channel.topic)).toEqual([
			watchTopic,
			`committee-paper:${paperId}:4`
		]);

		// Coming back with nothing missed moves nothing.
		realtime.answer(realtime.indexOf(watchTopic), 'SUBSCRIBED');
		await vi.advanceTimersByTimeAsync(0);
		expect(realtime.channels).toHaveLength(2);

		page.leave();
	});

	it('sends nothing while the channel is down', async () => {
		const realtime = createRealtime();
		const page = openPage(realtime, 'Words.');
		await vi.advanceTimersByTimeAsync(0);
		realtime.answer(0, 'TIMED_OUT');

		type(page, ' More.');
		await vi.advanceTimersByTimeAsync(SEND_INTERVAL_MS);

		expect(realtime.sent).toEqual([]);
		expect(page.statuses.at(-1)).toBe('paused');
	});
});
