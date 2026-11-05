import { describe, expect, it, vi } from 'vitest';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
	closeCommitteeRoom,
	committeeRoomDependency,
	speakersListFilter,
	subscribeToCommitteeRoom,
	type LiveStatus
} from './committee-room-live';

// Nothing here opens a real connection. The stand-in client below hands out a
// channel that writes down every table it was asked to listen to, and keeps
// the callback `subscribe` was given so a test can pretend to be the server.
// That the room really follows a change on a second screen is shown in
// `tests/e2e/chair-room.spec.ts`.

/** One `.on('postgres_changes', ...)` the channel was given. */
type Listener = { table: string; filter: string; onChange: () => void };

/** A stand-in channel, with what it was told written down. */
type StandInChannel = {
	name: string;
	listeners: Listener[];
	/** Whether the channel has asked to join. */
	isSubscribed: boolean;
	/** What `subscribe` was handed, so a test can report a status through it. */
	reportStatus: (status: string) => void;
};

/** The two methods of a real channel that `subscribeToCommitteeRoom` calls. */
type ChannelMethods = {
	on: (
		type: string,
		options: { table: string; filter: string },
		onChange: () => void
	) => ChannelMethods;
	subscribe: (callback: (status: string) => void) => ChannelMethods;
};

/** For a callback the test does not care about. */
function ignore(): void {}

/**
 * A stand-in Supabase client that opens stand-in channels and records their
 * removal. Realtime holds the reader's token once `handOverToken` is called.
 */
function createStandIn(): {
	supabase: SupabaseClient;
	channels: StandInChannel[];
	removeChannel: ReturnType<typeof vi.fn>;
	handOverToken: () => Promise<void>;
} {
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
			on(_type, options, onChange) {
				record.listeners.push({ table: options.table, filter: options.filter, onChange });
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

	// `setAuth` answers once the test hands the token over.
	const realtime = { setAuth: () => tokenArrived };
	const supabase = { channel, removeChannel, realtime } as unknown as SupabaseClient;

	/** Give Realtime the token, and let every channel waiting for it go on. */
	async function handOverToken() {
		resolveToken();
		await tokenArrived;
		// The channel joins in a `then` after the token, one step later.
		await Promise.resolve();
	}

	return { supabase, channels, removeChannel, handOverToken };
}

describe('committeeRoomDependency', () => {
	it('names the room the way `depends` and `invalidate` both expect', () => {
		expect(committeeRoomDependency('committee-1')).toBe('committee-room:committee-1');
	});
});

describe('speakersListFilter', () => {
	it('filters on one list, or on both while the active list is not the GSL', () => {
		expect(speakersListFilter(['list-1', null])).toBe('speakers_list_id=eq.list-1');
		expect(speakersListFilter(['list-1', 'list-1'])).toBe('speakers_list_id=eq.list-1');
		expect(speakersListFilter(['list-mod', 'list-gsl'])).toBe(
			'speakers_list_id=in.(list-mod,list-gsl)'
		);
		expect(speakersListFilter([null, null])).toBeNull();
	});
});

describe('subscribeToCommitteeRoom', () => {
	it('listens to the five committee tables, filtered to this committee', () => {
		const { supabase, channels } = createStandIn();
		const watch = {
			committeeId: 'committee-1',
			speakersListId: null,
			sessionId: null,
			rollCallId: null,
			voteId: null
		};

		subscribeToCommitteeRoom(supabase, watch, ignore, ignore);

		expect(channels[0].listeners.map((listener) => listener.table)).toEqual([
			'committee_state',
			'committee_sessions',
			'speakers_lists',
			'motions',
			'votes'
		]);
		for (const listener of channels[0].listeners) {
			expect(listener.filter).toBe('committee_id=eq.committee-1');
		}
	});

	it('also listens to the active list, the session’s roll calls and the latest one', () => {
		const { supabase, channels } = createStandIn();
		const watch = {
			committeeId: 'committee-1',
			speakersListId: 'list-1',
			sessionId: 'session-1',
			rollCallId: 'roll-1',
			voteId: null
		};

		subscribeToCommitteeRoom(supabase, watch, ignore, ignore);

		const extraListeners = channels[0].listeners.slice(5);
		expect(extraListeners.map(({ table, filter }) => ({ table, filter }))).toEqual([
			{ table: 'speakers_list_entries', filter: 'speakers_list_id=eq.list-1' },
			{ table: 'roll_calls', filter: 'session_id=eq.session-1' },
			{ table: 'roll_call_entries', filter: 'roll_call_id=eq.roll-1' }
		]);
	});

	it("hears the General Speakers' List as well while a caucus has its own list active", () => {
		const { supabase, channels } = createStandIn();
		const watch = {
			committeeId: 'committee-1',
			speakersListId: 'list-mod',
			generalSpeakersListId: 'list-gsl',
			sessionId: null,
			rollCallId: null,
			voteId: null
		};

		subscribeToCommitteeRoom(supabase, watch, ignore, ignore);

		const extraListeners = channels[0].listeners.slice(5);
		expect(extraListeners.map(({ table, filter }) => ({ table, filter }))).toEqual([
			{ table: 'speakers_list_entries', filter: 'speakers_list_id=in.(list-mod,list-gsl)' }
		]);
	});

	it('hears the answers of the vote the room is on, filtered on that vote (S2, D2)', () => {
		const { supabase, channels } = createStandIn();
		const watch = {
			committeeId: 'committee-1',
			speakersListId: null,
			sessionId: null,
			rollCallId: null,
			voteId: 'vote-1'
		};

		subscribeToCommitteeRoom(supabase, watch, ignore, ignore);

		// `vote_entries` has no `committee_id`, so it is not one of the five
		// committee tables but a listener of its own.
		const extraListeners = channels[0].listeners.slice(5);
		expect(extraListeners.map(({ table, filter }) => ({ table, filter }))).toEqual([
			{ table: 'vote_entries', filter: 'vote_id=eq.vote-1' }
		]);
	});

	it('calls onChange for an event on any of its tables', () => {
		const { supabase, channels } = createStandIn();
		const onChange = vi.fn();
		const watch = {
			committeeId: 'committee-1',
			speakersListId: 'list-1',
			sessionId: null,
			rollCallId: null,
			voteId: null
		};

		subscribeToCommitteeRoom(supabase, watch, onChange, ignore);
		for (const listener of channels[0].listeners) listener.onChange();

		expect(onChange).toHaveBeenCalledTimes(6);
	});

	it('reports live once subscribed and paused when the channel drops', async () => {
		const { supabase, channels, handOverToken } = createStandIn();
		const statuses: LiveStatus[] = [];
		const watch = {
			committeeId: 'committee-1',
			speakersListId: null,
			sessionId: null,
			rollCallId: null,
			voteId: null
		};

		subscribeToCommitteeRoom(supabase, watch, ignore, (status) => statuses.push(status));
		await handOverToken();
		channels[0].reportStatus('SUBSCRIBED');
		channels[0].reportStatus('CHANNEL_ERROR');
		channels[0].reportStatus('TIMED_OUT');
		channels[0].reportStatus('CLOSED');

		expect(statuses).toEqual(['live', 'paused', 'paused', 'paused']);
	});

	it('gives every channel it opens a name of its own', () => {
		const { supabase, channels } = createStandIn();
		const watch = {
			committeeId: 'committee-1',
			speakersListId: null,
			sessionId: null,
			rollCallId: null,
			voteId: null
		};

		subscribeToCommitteeRoom(supabase, watch, ignore, ignore);
		subscribeToCommitteeRoom(supabase, watch, ignore, ignore);

		expect(channels[0].name).toMatch(/^committee-room:committee-1:/);
		expect(channels[1].name).not.toBe(channels[0].name);
	});
});

describe('subscribeToCommitteeRoom and the reader’s token', () => {
	const watch = {
		committeeId: 'committee-1',
		speakersListId: null,
		sessionId: null,
		rollCallId: null,
		voteId: null
	};

	// Without the token the join goes out as a visitor's, and Row Level Security
	// hides every change from it. Safari lost that race nearly every time (T151).
	it('joins only once Realtime holds the reader’s token', async () => {
		const { supabase, channels, handOverToken } = createStandIn();

		subscribeToCommitteeRoom(supabase, watch, ignore, ignore);
		expect(channels[0].isSubscribed).toBe(false);

		await handOverToken();
		expect(channels[0].isSubscribed).toBe(true);
	});

	it('never joins a channel the page closed while it waited for the token', async () => {
		const { supabase, channels, handOverToken } = createStandIn();

		const channel = subscribeToCommitteeRoom(supabase, watch, ignore, ignore);
		closeCommitteeRoom(supabase, channel);
		await handOverToken();

		expect(channels[0].isSubscribed).toBe(false);
	});
});

describe('closeCommitteeRoom', () => {
	it('hands the channel back to the client to close', () => {
		const { supabase, removeChannel } = createStandIn();
		const channel = {} as RealtimeChannel;

		closeCommitteeRoom(supabase, channel);

		expect(removeChannel).toHaveBeenCalledWith(channel);
	});
});
