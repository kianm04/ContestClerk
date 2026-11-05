import { describe, expect, it, vi } from 'vitest';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { LiveStatus } from './committee-room-live';
import {
	closePaperThreads,
	paperThreadsDependency,
	subscribeToPaperThreads,
	threadIdFilters,
	type ThreadsWatch
} from './paper-threads-live';

// Nothing here opens a real connection. The stand-in client below hands out a
// channel that writes down every listener it was given, and keeps the
// callback `subscribe` was handed so a test can pretend to be the server.

/** What a listener hears: a delete's payload carries the old row's id. */
type Payload = { old: { id?: string } };

/** One `.on('postgres_changes', ...)` the channel was given. */
type Listener = {
	event: string;
	table: string;
	filter: string | undefined;
	hear: (payload: Payload) => void;
};

type StandInChannel = {
	name: string;
	listeners: Listener[];
	isSubscribed: boolean;
	reportStatus: (status: string) => void;
};

/** The two methods of a real channel that `subscribeToPaperThreads` calls. */
type ChannelMethods = {
	on: (
		type: string,
		options: { event: string; table: string; filter?: string },
		hear: (payload: Payload) => void
	) => ChannelMethods;
	subscribe: (callback: (status: string) => void) => ChannelMethods;
};

function ignore(): void {}

/** A stand-in Supabase client; Realtime holds the reader's token once `handOverToken` is called. */
function createStandIn() {
	const channels: StandInChannel[] = [];
	const removeChannel = vi.fn(async () => 'ok');
	const { promise: tokenArrived, resolve: resolveToken } = Promise.withResolvers<void>();

	function channel(name: string): ChannelMethods {
		const record: StandInChannel = {
			name,
			listeners: [],
			isSubscribed: false,
			reportStatus: () => {}
		};
		channels.push(record);

		const standInChannel: ChannelMethods = {
			on(_type, options, hear) {
				const { event, table, filter } = options;
				record.listeners.push({ event, table, filter, hear });
				return standInChannel;
			},
			subscribe(callback) {
				record.isSubscribed = true;
				record.reportStatus = callback;
				return standInChannel;
			}
		};

		return standInChannel;
	}

	const realtime = { setAuth: () => tokenArrived };
	const supabase = { channel, removeChannel, realtime } as unknown as SupabaseClient;

	async function handOverToken() {
		resolveToken();
		await tokenArrived;
		// The channel joins in a `then` after the token, one step later.
		await Promise.resolve();
	}

	return { supabase, channels, removeChannel, handOverToken };
}

const WATCH: ThreadsWatch = {
	paper: { kind: 'committee', paperId: 'paper-1' },
	threadIds: ['thread-1', 'thread-2'],
	commentIds: ['comment-1']
};

describe('paperThreadsDependency', () => {
	it('names a paper’s threads the way `depends` and `invalidate` both expect', () => {
		expect(paperThreadsDependency({ kind: 'committee', paperId: 'paper-1' })).toBe(
			'paper-threads:paper-1'
		);
		expect(paperThreadsDependency({ kind: 'position', seatId: 'seat-1' })).toBe(
			'paper-threads:seat-1'
		);
	});
});

describe('threadIdFilters', () => {
	it('asks for a hundred threads at most in one filter', () => {
		const threadIds = Array.from({ length: 201 }, (_, index) => `t${index}`);

		const filters = threadIdFilters(threadIds);

		expect(filters).toHaveLength(3);
		expect(filters[0]).toBe(`thread_id=in.(${threadIds.slice(0, 100).join(',')})`);
		expect(filters[2]).toBe('thread_id=in.(t200)');
		expect(threadIdFilters([])).toEqual([]);
	});
});

describe('subscribeToPaperThreads', () => {
	it('hears new and changed threads on the paper, and comments on its threads', () => {
		const { supabase, channels } = createStandIn();

		subscribeToPaperThreads(supabase, WATCH, ignore, ignore);
		const filtered = channels[0].listeners.filter((listener) => listener.event !== 'DELETE');

		expect(filtered.map(({ event, table, filter }) => [event, table, filter])).toEqual([
			['INSERT', 'paper_comment_threads', 'committee_paper_id=eq.paper-1'],
			['INSERT', 'paper_comments', 'thread_id=in.(thread-1,thread-2)'],
			['UPDATE', 'paper_comment_threads', 'committee_paper_id=eq.paper-1'],
			['UPDATE', 'paper_comments', 'thread_id=in.(thread-1,thread-2)']
		]);
	});

	it('finds a position paper’s threads by its seat', () => {
		const { supabase, channels } = createStandIn();
		const watch: ThreadsWatch = {
			paper: { kind: 'position', seatId: 'seat-1' },
			threadIds: [],
			commentIds: []
		};

		subscribeToPaperThreads(supabase, watch, ignore, ignore);

		expect(channels[0].listeners[0].filter).toBe('position_paper_seat_id=eq.seat-1');
		// With no threads yet there are no comments to hear, only new threads and deletes.
		expect(channels[0].listeners.map((listener) => listener.table)).toEqual([
			'paper_comment_threads',
			'paper_comment_threads',
			'paper_comment_threads',
			'paper_comments'
		]);
	});

	it('passes on a delete only when the page shows the thread or comment deleted', () => {
		const { supabase, channels } = createStandIn();
		const onChange = vi.fn();

		subscribeToPaperThreads(supabase, WATCH, onChange, ignore);
		const deletes = channels[0].listeners.filter((listener) => listener.event === 'DELETE');
		for (const listener of deletes) {
			expect(listener.filter).toBeUndefined();
			listener.hear({ old: { id: 'someone-elses' } });
			listener.hear({ old: {} });
		}
		expect(onChange).not.toHaveBeenCalled();

		deletes[0].hear({ old: { id: 'thread-2' } });
		deletes[1].hear({ old: { id: 'comment-1' } });
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('joins once Realtime holds the token, and reports live and paused', async () => {
		const { supabase, channels, handOverToken } = createStandIn();
		const statuses: LiveStatus[] = [];

		subscribeToPaperThreads(supabase, WATCH, ignore, (status) => statuses.push(status));
		expect(channels[0].isSubscribed).toBe(false);
		await handOverToken();
		channels[0].reportStatus('SUBSCRIBED');
		channels[0].reportStatus('CHANNEL_ERROR');

		expect(channels[0].isSubscribed).toBe(true);
		expect(statuses).toEqual(['live', 'paused']);
	});

	it('gives every channel a name of its own', () => {
		const { supabase, channels } = createStandIn();

		subscribeToPaperThreads(supabase, WATCH, ignore, ignore);
		subscribeToPaperThreads(supabase, WATCH, ignore, ignore);

		expect(channels[0].name).toMatch(/^paper-threads:paper-1:/);
		expect(channels[1].name).not.toBe(channels[0].name);
	});
});

describe('closePaperThreads', () => {
	it('hands the channel back, and a channel closed while it waited never joins', async () => {
		const { supabase, channels, removeChannel, handOverToken } = createStandIn();

		const channel = subscribeToPaperThreads(supabase, WATCH, ignore, ignore);
		closePaperThreads(supabase, channel);
		await handOverToken();

		expect(removeChannel).toHaveBeenCalledWith(channel as RealtimeChannel);
		expect(channels[0].isSubscribed).toBe(false);
	});
});
