<script lang="ts">
	import type { AttendanceStatus } from '$lib/committee-room';
	import type { GslEntry } from '$lib/gsl-floor';
	import type { SessionMotion } from '$lib/motions';
	import type { FloorView } from '$lib/room-screen';
	import { waitingSpeakers } from '$lib/speakers-lists';
	import { absentSeatIds, watchedListTitle } from '$lib/watched-floor';
	import LiveList from './LiveList.svelte';
	import LiveMotion from './LiveMotion.svelte';

	type Props = {
		/** The live mode's floor, or null while the room shows a message, the Unmod clock or a vote. */
		view: FloorView | null;
		/** The live list's entries, every status included. */
		speakers: GslEntry[];
		/** The latest roll call of the session, keyed by seat id; empty before one. */
		attendance: Record<string, AttendanceStatus>;
		/** The reader's own seat, or null for staff watching. */
		mySeatId: string | null;
		/** The motion being run, or else the one that goes to the vote first. */
		floorMotion: SessionMotion | null;
	};

	let { view, speakers, attendance, mySeatId, floorMotion }: Props = $props();

	// `$derived` works these out again whenever the page's data is read again:
	// the GSL's and a caucus's list (a single speaker shows none), and the
	// motion first in line, shown beside the GSL while it is still proposed.
	const listTitle = $derived(view ? watchedListTitle(view) : null);
	const motion = $derived(
		view === 'gsl' && floorMotion?.status === 'proposed' ? floorMotion : null
	);
</script>

<!-- Beside the floor from `lg`, under it on a phone: who waits, then the motion first in line. -->
<div class="flex min-w-0 flex-col gap-3">
	{#if listTitle}
		<LiveList
			title={listTitle}
			entries={waitingSpeakers(speakers)}
			{mySeatId}
			absentSeatIds={absentSeatIds(attendance)}
		/>
	{/if}
	{#if motion}
		<LiveMotion {motion} />
	{/if}
</div>
