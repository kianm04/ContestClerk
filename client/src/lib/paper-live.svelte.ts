/**
 * One paper open for writing together live, a position paper or a paper
 * written in committee: its Yjs document, who else is in it, the channel to
 * the others and the saving.
 *
 * `createLivePaper()` builds the document when the page's script starts, so
 * the editor can be drawn on it straight away, and `start()` connects it once
 * the page is on screen. While the channel is down the page asks the server
 * for the others' saved changes every `PAUSED_RELOAD_SECONDS`, the fallback
 * every live page in MUNMeet has.
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Awareness } from 'y-protocols/awareness';
// `invalidateAll` runs the page's `load` again, as a reload would, without leaving the page.
import { invalidateAll } from '$app/navigation';
import { PAUSED_RELOAD_SECONDS, type LiveStatus } from '$lib/committee-room-live';
import { unknownWriterIds, writersPresent, type LiveWriter } from '$lib/live-writers';
import type { LiveDocument } from '$lib/markdown-editor-live';
import { base64ToBytes, openPaperDocument, seedPaperDocument } from '$lib/paper-document';
import { joinPaperChannel, type PaperChannelEpoch } from '$lib/paper-live-channel';
import { createLivePaperSave } from '$lib/paper-live-save.svelte';
import type { PaperDraft } from '$lib/paper-writing';

/** What a page's `load` hands over for writing a paper live, beside the draft itself. */
export type LivePaperSetup = {
	/** The paper's channel, from `paperChannelTopic` or `committeePaperChannelTopic`. */
	topic: string;
	/**
	 * For a committee paper, the paper and the epoch of its authors the name
	 * was made with; the channel follows the epoch (`$lib/paper-live-channel.ts`).
	 */
	epoch?: PaperChannelEpoch;
	/** The stored document as base64, or `null` when the draft has only ever been Markdown. */
	documentState: string | null;
	/**
	 * How many suggestions in it are still to be decided. The page without
	 * JavaScript cannot save over them, so it says how many instead.
	 */
	openSuggestions: number;
	/** The reader, as the others see them beside the editor and over their cursor. */
	writer: LiveWriter;
	/**
	 * Everybody who may write the paper, as the server knows them. The others
	 * in the paper are named from this list and never from what their own
	 * browsers send (`$lib/live-writers.ts`).
	 */
	writers: LiveWriter[];
};

/** The shortest wait between two askings of the server who may write the paper. */
export const WRITERS_REFRESH_SECONDS = 10;

/** A live setup with the browser's Supabase client from the root layout, which the page adds. */
export type LivePaperConnection = { setup: LivePaperSetup; supabase: SupabaseClient };

export type LivePaperOptions = LivePaperConnection & {
	/** The page's form action that saves the paper, such as `?/saveDraft`. */
	action: string;
	/** What the writer is told once the paper can no longer be saved here. */
	replacedMessage: string;
	/** The stored draft when the page loaded, or `null` when there is none yet. */
	draft: PaperDraft | null;
	/** What the editor starts with when nothing is stored: "Edit and resubmit" opens the paper. */
	startMarkdown: string;
	/**
	 * Everybody who may write the paper, from the page's latest `load`. It is
	 * a function, read again each time, because the list grows when an
	 * author is added after the page loaded.
	 */
	knownWriters: () => LiveWriter[];
};

/**
 * The document the page starts from: the stored one, or else one seeded from
 * the draft's Markdown exactly as the server seeds it (`seedPaperDocument`).
 */
function openStartDocument(options: LivePaperOptions) {
	const stored = options.setup.documentState;

	if (stored !== null) return openPaperDocument(base64ToBytes(stored));

	return openPaperDocument(seedPaperDocument(options.draft?.body ?? options.startMarkdown));
}

/** One paper written live. Call it once in a component's `<script>`, in the browser only. */
export function createLivePaper(options: LivePaperOptions) {
	const document = openStartDocument(options);
	// "Awareness" is Yjs's list of who is in the document and where their cursor is.
	const awareness = new Awareness(document);
	const save = createLivePaperSave({
		action: options.action,
		replacedMessage: options.replacedMessage,
		document,
		draft: options.draft,
		readerId: options.setup.writer.id
	});

	// `$state` makes whatever reads these redraw when they change.
	let channelStatus: LiveStatus = $state('connecting');
	// Every awareness entry now, as each browser claims it. `$state.raw`
	// because the list is only ever replaced, never changed in place.
	let presentStates: unknown[] = $state.raw([]);
	// `$derived` works the list out again whenever what it reads changes:
	// somebody comes or goes, or the page's `load` runs again with an author
	// added since the page opened.
	const writers = $derived(
		writersPresent(presentStates, options.setup.writer.id, options.knownWriters())
	);

	const editorDocument: LiveDocument = {
		document,
		awareness,
		writer: options.setup.writer,
		// A getter, so a cursor drawn after an author was added is named too.
		get writers() {
			return options.knownWriters();
		}
	};

	/*
		An entry whose id the list does not hold is most often an author added
		after the page loaded, so the page runs its `load` again. Each id is
		asked about once, and the server at most every WRITERS_REFRESH_SECONDS:
		an id somebody made up, which the server never knows, cannot keep the
		page reloading.
	*/
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state the page is drawn from
	const askedAboutIds = new Set<string>();
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let lastRefreshAt: number | null = null;

	function refreshWritersSoon() {
		// A refresh already waiting asks about this id too.
		if (refreshTimer !== null) return;

		const wait =
			lastRefreshAt === null
				? 0
				: Math.max(0, lastRefreshAt + WRITERS_REFRESH_SECONDS * 1000 - Date.now());

		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			lastRefreshAt = Date.now();
			void invalidateAll();
		}, wait);
	}

	function handleAwarenessChange() {
		presentStates = [...awareness.getStates().values()];

		const newIds = unknownWriterIds(presentStates, options.knownWriters()).filter(
			(id) => !askedAboutIds.has(id)
		);

		if (newIds.length === 0) return;

		for (const id of newIds) askedAboutIds.add(id);
		refreshWritersSoon();
	}

	function handleStatus(status: LiveStatus) {
		channelStatus = status;

		// Back online: store what was typed while the connection was down.
		if (status === 'live') void save.saveNow();
	}

	/** Connect to the others. Answers a function that disconnects and stops saving. */
	function start(): () => void {
		awareness.on('change', handleAwarenessChange);
		const leave = joinPaperChannel({
			supabase: options.supabase,
			topic: options.setup.topic,
			epoch: options.setup.epoch,
			document,
			awareness,
			onStatus: handleStatus
		});

		const pausedTimer = setInterval(() => {
			if (channelStatus === 'paused') void save.saveNow(true);
		}, PAUSED_RELOAD_SECONDS * 1000);

		return () => {
			clearInterval(pausedTimer);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			leave();
			save.stop();
			awareness.off('change', handleAwarenessChange);
			awareness.destroy();
		};
	}

	return {
		/** What the editor is given to write in the shared document. */
		editorDocument,
		save,
		get channelStatus() {
			return channelStatus;
		},
		/** Everybody else in the paper now, in name order. */
		get writers() {
			return writers;
		},
		start
	};
}

export type LivePaper = ReturnType<typeof createLivePaper>;
