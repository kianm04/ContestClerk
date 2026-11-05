import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiveStatus } from '$lib/committee-room-live';

// SvelteKit's browser modules only work inside a running app, so these stand
// in for them: `invalidate` is watched, nothing is being navigated to and no
// press is on its way. The realtime channels are stand-ins too, each keeping
// the function its channel reports its status to.
const invalidate = vi.hoisted(() => vi.fn());
const channels = vi.hoisted(() => [] as { reportStatus: (status: LiveStatus) => void }[]);

vi.mock('$app/navigation', () => ({ invalidate }));
vi.mock('$app/state', () => ({ navigating: { type: null } }));
vi.mock('$lib/instant-form.svelte', () => ({
	isAnyInstantFormSending: () => false,
	whenInstantFormsAnswered: () => Promise.resolve()
}));
vi.mock('$lib/committee-room-live', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/committee-room-live')>()),
	subscribeToCommitteeRoom: (
		_supabase: SupabaseClient,
		_watch: unknown,
		_onChange: () => void,
		onStatus: (status: LiveStatus) => void
	) => {
		channels.push({ reportStatus: onStatus });

		return {};
	},
	closeCommitteeRoom: () => {}
}));

import RoomLiveUpdates from './RoomLiveUpdates.svelte';

/** The room's live updates for one committee, listening to vote `voteId`. */
function props(voteId: string | null, onStatusChange = vi.fn()) {
	return {
		supabase: {} as SupabaseClient,
		committeeId: 'committee-1',
		speakersListId: 'gsl',
		sessionId: 'session-1',
		rollCallId: null,
		voteId,
		status: null,
		onStatusChange
	};
}

afterEach(() => {
	invalidate.mockReset();
	channels.length = 0;
});

describe('RoomLiveUpdates', () => {
	it('does not read the room again when its first channel goes live', () => {
		render(RoomLiveUpdates, { props: props(null) });

		channels[0].reportStatus('live');

		expect(invalidate).not.toHaveBeenCalled();
	});

	it('reads the room once when the channel for a new vote goes live, to catch up on its gap', async () => {
		const { rerender } = render(RoomLiveUpdates, { props: props(null) });
		channels[0].reportStatus('live');

		await rerender({ voteId: 'vote-1' });
		await tick();
		channels[1].reportStatus('live');

		expect(channels).toHaveLength(2);
		expect(invalidate).toHaveBeenCalledOnce();
		expect(invalidate).toHaveBeenCalledWith('committee-room:committee-1');
	});

	it('reads the room once when the connection comes back', () => {
		render(RoomLiveUpdates, { props: props(null) });

		channels[0].reportStatus('live');
		channels[0].reportStatus('paused');
		channels[0].reportStatus('live');

		expect(invalidate).toHaveBeenCalledOnce();
	});

	it('ignores a channel it has already closed', async () => {
		const onStatusChange = vi.fn();
		const { rerender } = render(RoomLiveUpdates, { props: props(null, onStatusChange) });
		channels[0].reportStatus('live');

		await rerender({ voteId: 'vote-1' });
		await tick();
		onStatusChange.mockClear();
		channels[0].reportStatus('paused');
		channels[0].reportStatus('live');

		expect(onStatusChange).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
	});
});
