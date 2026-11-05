import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { invalidateAll } from '$app/navigation';
import { PAUSED_RELOAD_SECONDS, type LiveStatus } from './committee-room-live';
import {
	bytesToBase64,
	openPaperDocument,
	paperDocumentMarkdown,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from './paper-document';
import { joinPaperChannel, type PaperChannelSetup } from './paper-live-channel';
import {
	createLivePaper,
	WRITERS_REFRESH_SECONDS,
	type LivePaper,
	type LivePaperOptions
} from './paper-live.svelte';
import type { PaperDraft } from './paper-writing';

// SvelteKit's `deserialize` only works inside a running app. The stand-in
// fetch below answers in plain JSON, so reading it back is `JSON.parse`.
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));
// Running the page's `load` again is a spy too, which a test can have add a writer.
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => undefined) }));

// The channel is tested on its own in `paper-live-channel.test.ts`. Here it is
// a spy, so a test can say what Realtime answered and see what the page did.
vi.mock('./paper-live-channel', async (importOriginal) => ({
	...(await importOriginal<typeof import('./paper-live-channel')>()),
	joinPaperChannel: vi.fn()
}));

const DRAFT: PaperDraft = {
	body: 'France supports the treaty.',
	revision: 4,
	updatedAt: '2026-09-27T09:00:00.000Z',
	updatedById: 'rachel',
	updatedByName: 'Rachel Morgan'
};

const fetchMock = vi.fn();
const leaveChannel = vi.fn();

const TOM = { id: 'tom', name: 'Tom Price' };
const RACHEL = { id: 'rachel', name: 'Rachel Morgan' };
const AISHA = { id: 'aisha', name: 'Aisha Bello' };

/** The options a page hands over, with the stored document when there is one. */
function options(documentState: string | null = null): LivePaperOptions {
	return {
		setup: {
			topic: 'paper:seat-1',
			documentState,
			openSuggestions: 0,
			writer: TOM,
			writers: [TOM, RACHEL]
		},
		supabase: {} as SupabaseClient,
		action: '?/saveDraft',
		replacedMessage: 'This paper was submitted.',
		draft: DRAFT,
		startMarkdown: '',
		knownWriters: () => [TOM, RACHEL]
	};
}

/**
 * Another browser in `paper`, whose awareness entry claims to be `user`.
 * `moveCursor` sends its entry again with the cursor somewhere new, as typing does.
 */
function joinAs(paper: LivePaper, user: { id: string; name: string }) {
	const document = new Y.Doc();
	const awareness = new Awareness(document);
	let position = 0;

	function send() {
		applyAwarenessUpdate(
			paper.editorDocument.awareness,
			encodeAwarenessUpdate(awareness, [document.clientID]),
			'test'
		);
	}

	awareness.setLocalStateField('user', user);
	send();

	return {
		moveCursor() {
			position += 1;
			awareness.setLocalStateField('cursor', { position });
			send();
		},
		leave: () => awareness.destroy()
	};
}

/** What the page handed the channel when it started. */
function channelSetup(): PaperChannelSetup {
	return vi.mocked(joinPaperChannel).mock.calls[0][0];
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(joinPaperChannel).mockReset().mockReturnValue(leaveChannel);
	vi.mocked(invalidateAll).mockReset();
	leaveChannel.mockReset();
	fetchMock.mockReset();
	fetchMock.mockImplementation(() =>
		Promise.resolve(
			new Response(
				JSON.stringify({ type: 'success', status: 200, data: { draftSaved: { revision: 4 } } })
			)
		)
	);
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('createLivePaper', () => {
	it("starts from the draft's text when nothing is stored, and from the stored document otherwise", () => {
		const stored = openPaperDocument(seedPaperDocument(DRAFT.body));
		writeMarkdownIntoPaperDocument(stored, 'France supports the treaty. Rachel agrees.');

		const fromText = createLivePaper(options());
		const fromStored = createLivePaper(options(bytesToBase64(Y.encodeStateAsUpdate(stored))));

		expect(paperDocumentMarkdown(fromText.editorDocument.document)).toBe(DRAFT.body);
		expect(paperDocumentMarkdown(fromStored.editorDocument.document)).toBe(
			'France supports the treaty. Rachel agrees.'
		);
		expect(fromText.editorDocument.writer).toEqual(TOM);
		expect(fromText.editorDocument.writers).toEqual([TOM, RACHEL]);
	});

	it('joins the channel on start, follows its status, and leaves on stop', () => {
		const paper = createLivePaper(options());
		const stop = paper.start();

		expect(channelSetup().topic).toBe('paper:seat-1');
		expect(channelSetup().epoch).toBeUndefined();
		expect(channelSetup().document).toBe(paper.editorDocument.document);

		channelSetup().onStatus('live' satisfies LiveStatus);
		expect(paper.channelStatus).toBe('live');

		stop();
		expect(leaveChannel).toHaveBeenCalled();
	});

	it("hands a committee paper's epoch to the channel, which follows it", () => {
		const setup = options();
		setup.setup.topic = 'committee-paper:paper-1:3';
		setup.setup.epoch = { paperId: 'paper-1', epoch: 3 };

		const paper = createLivePaper(setup);
		const stop = paper.start();

		expect(channelSetup().topic).toBe('committee-paper:paper-1:3');
		expect(channelSetup().epoch).toEqual({ paperId: 'paper-1', epoch: 3 });
		stop();
	});

	it('lists everybody else in the paper the server knows, and not the reader', () => {
		const paper = createLivePaper(options());
		const stop = paper.start();
		const rachelsDocument = new Y.Doc();
		const rachels = new Awareness(rachelsDocument);
		// Rachel's entry claims her id and some other name; a stranger claims an unknown id.
		rachels.setLocalStateField('user', { id: 'rachel', name: 'Somebody Else' });
		const strangersDocument = new Y.Doc();
		const strangers = new Awareness(strangersDocument);
		strangers.setLocalStateField('user', { id: 'stranger', name: 'Aisha Bello' });

		paper.editorDocument.awareness.setLocalStateField('user', TOM);
		for (const [awareness, document] of [
			[rachels, rachelsDocument],
			[strangers, strangersDocument]
		] as const) {
			applyAwarenessUpdate(
				paper.editorDocument.awareness,
				encodeAwarenessUpdate(awareness, [document.clientID]),
				'test'
			);
		}

		expect(paper.writers).toEqual([RACHEL]);
		rachels.destroy();
		strangers.destroy();
		stop();
	});

	it('names a writer added after the page loaded, asking the server once for each new id', async () => {
		// The page's `load` data, which running it again replaces; `$state` stands in for the page's props.
		let known = $state([TOM, RACHEL]);
		const refreshWriters = vi.mocked(invalidateAll).mockImplementation(async () => {
			known = [TOM, RACHEL, AISHA];
		});
		const paper = createLivePaper({ ...options(), knownWriters: () => known });
		const stop = paper.start();

		// Aisha was made an author after Tom's page loaded, and opens the paper.
		const aisha = joinAs(paper, AISHA);
		expect(paper.writers).toEqual([]);

		await vi.advanceTimersByTimeAsync(0);
		expect(refreshWriters).toHaveBeenCalledTimes(1);
		expect(paper.writers).toEqual([AISHA]);
		// Her cursor is named from the new list too.
		expect(paper.editorDocument.writers).toEqual([TOM, RACHEL, AISHA]);

		// An id nobody knows is asked about once, no sooner than the wait allows, and never again.
		const stranger = joinAs(paper, { id: 'stranger', name: 'Somebody Else' });
		await vi.advanceTimersByTimeAsync(WRITERS_REFRESH_SECONDS * 1000 - 1);
		expect(refreshWriters).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(refreshWriters).toHaveBeenCalledTimes(2);

		stranger.moveCursor();
		aisha.moveCursor();
		await vi.advanceTimersByTimeAsync(WRITERS_REFRESH_SECONDS * 1000);
		expect(refreshWriters).toHaveBeenCalledTimes(2);
		expect(paper.writers).toEqual([AISHA]);

		aisha.leave();
		stranger.leave();
		stop();
	});

	it("asks the server for the others' saves every little while, only while the channel is paused", async () => {
		const paper = createLivePaper(options());
		const stop = paper.start();

		channelSetup().onStatus('live');
		await vi.advanceTimersByTimeAsync(PAUSED_RELOAD_SECONDS * 1000);
		expect(fetchMock).not.toHaveBeenCalled();

		channelSetup().onStatus('paused');
		await vi.advanceTimersByTimeAsync(PAUSED_RELOAD_SECONDS * 1000);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		stop();
		await vi.advanceTimersByTimeAsync(PAUSED_RELOAD_SECONDS * 1000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
