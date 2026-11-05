import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { paperEpochWatchTopic, watchPaperEpoch } from './paper-epoch-watch';

const paperId = '11111111-1111-4111-8111-111111111111';

/** A stand-in for the Supabase client that remembers what the watch asked Realtime for. */
function standInClient() {
	const opened: { topic: string; options: unknown; filter: unknown }[] = [];
	let handler: (payload: { new: unknown }) => void = () => {};
	let reportStatus: (status: string) => void = () => {};

	const channel = (topic: string, options?: unknown) => {
		const entry = { topic, options, filter: null as unknown };
		opened.push(entry);

		// Every step hands the channel back, which is what lets the module chain them.
		const realtimeChannel = {
			on: (_type: string, filter: unknown, onChange: typeof handler) => {
				entry.filter = filter;
				handler = onChange;
				return realtimeChannel;
			},
			subscribe: (onStatus: typeof reportStatus) => {
				reportStatus = onStatus;
				return realtimeChannel;
			}
		};

		return realtimeChannel;
	};

	return {
		supabase: { channel } as unknown as SupabaseClient,
		opened,
		changeRow: (row: unknown) => handler({ new: row }),
		answer: (status: string) => reportStatus(status)
	};
}

describe('paperEpochWatchTopic', () => {
	it("is the paper's id after `committee-paper-epoch:`", () => {
		expect(paperEpochWatchTopic(paperId)).toBe(`committee-paper-epoch:${paperId}`);
	});
});

describe('watchPaperEpoch', () => {
	it("listens to updates of the paper's own row, on a channel that carries nothing else", () => {
		const realtime = standInClient();

		watchPaperEpoch(
			realtime.supabase,
			paperId,
			() => {},
			() => {}
		);

		expect(realtime.opened).toEqual([
			{
				topic: `committee-paper-epoch:${paperId}`,
				options: undefined,
				filter: {
					event: 'UPDATE',
					schema: 'public',
					table: 'committee_papers',
					filter: `id=eq.${paperId}`
				}
			}
		]);
	});

	it('hands on each changed row', () => {
		const realtime = standInClient();
		const rows: unknown[] = [];

		watchPaperEpoch(
			realtime.supabase,
			paperId,
			(row) => rows.push(row),
			() => {}
		);
		realtime.changeRow({ id: paperId, live_epoch: 3 });

		expect(rows).toEqual([{ id: paperId, live_epoch: 3 }]);
	});

	it('says so each time it starts listening, and not while it is still connecting', () => {
		const realtime = standInClient();
		let listening = 0;

		watchPaperEpoch(
			realtime.supabase,
			paperId,
			() => {},
			() => (listening += 1)
		);
		realtime.answer('CHANNEL_ERROR');
		realtime.answer('SUBSCRIBED');
		realtime.answer('SUBSCRIBED');

		expect(listening).toBe(2);
	});
});
