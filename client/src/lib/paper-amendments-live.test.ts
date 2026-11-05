import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiveStatus } from './committee-room-live';
import {
	closePaperAmendments,
	paperAmendmentsDependency,
	subscribeToPaperAmendments
} from './paper-amendments-live';

// Nothing here opens a real connection: the stand-in client hands out a
// channel that writes down its listeners and keeps `subscribe`'s callback, as
// in `paper-threads-live.test.ts`.

type Listener = { event: string; table: string; filter: string | undefined };

function ignore(): void {}

function createStandIn() {
	const channels: { name: string; listeners: Listener[]; report: (status: string) => void }[] = [];
	const removeChannel = vi.fn(async () => 'ok');
	const { promise: tokenArrived, resolve: resolveToken } = Promise.withResolvers<void>();

	function channel(name: string) {
		const record: { name: string; listeners: Listener[]; report: (status: string) => void } = {
			name,
			listeners: [],
			report: () => {}
		};
		channels.push(record);

		const standIn = {
			on(_type: string, options: Listener) {
				record.listeners.push({
					event: options.event,
					table: options.table,
					filter: options.filter
				});
				return standIn;
			},
			subscribe(callback: (status: string) => void) {
				record.report = callback;
				return standIn;
			}
		};

		return standIn;
	}

	const supabase = {
		channel,
		removeChannel,
		realtime: { setAuth: () => tokenArrived }
	} as unknown as SupabaseClient;

	async function handOverToken() {
		resolveToken();
		await tokenArrived;
		await Promise.resolve();
	}

	return { supabase, channels, removeChannel, handOverToken };
}

describe('paperAmendmentsDependency', () => {
	it('names a draft’s amendments for `depends` and `invalidate`', () => {
		expect(paperAmendmentsDependency('paper-1')).toBe('paper-amendments:paper-1');
	});
});

describe('subscribeToPaperAmendments', () => {
	it('hears the draft’s amendments, and nothing of amendment_seats, which is not published', () => {
		const { supabase, channels } = createStandIn();

		subscribeToPaperAmendments(supabase, 'paper-1', ignore, ignore);

		// A sponsor's answer touches the amendment's own row (20261022142000),
		// so this one listener is the whole of it.
		expect(channels[0].name).toMatch(/^paper-amendments:paper-1:/);
		expect(channels[0].listeners).toEqual([
			{ event: '*', table: 'amendments', filter: 'paper_id=eq.paper-1' }
		]);
	});

	it('joins once Realtime holds the token, and reports live and paused', async () => {
		const { supabase, channels, handOverToken } = createStandIn();
		const statuses: LiveStatus[] = [];

		subscribeToPaperAmendments(supabase, 'paper-1', ignore, (status) => statuses.push(status));
		await handOverToken();
		channels[0].report('SUBSCRIBED');
		channels[0].report('CLOSED');

		expect(statuses).toEqual(['live', 'paused']);
	});
});

describe('closePaperAmendments', () => {
	it('hands the channel back, and a channel closed while it waited never joins', async () => {
		const { supabase, channels, removeChannel, handOverToken } = createStandIn();
		const statuses: LiveStatus[] = [];
		const channel = subscribeToPaperAmendments(supabase, 'paper-1', ignore, (status) =>
			statuses.push(status)
		);

		closePaperAmendments(supabase, channel);
		await handOverToken();
		channels[0].report('SUBSCRIBED');

		expect(removeChannel).toHaveBeenCalledWith(channel);
		expect(statuses).toEqual([]);
	});
});
