<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import { statusLabel } from '$lib/status';

	type Props = {
		seat: RoomSeat;
		/**
		 * What the latest roll call said about this seat. `undefined` draws no
		 * dot at all (the list was given no attendance); `null` means the seat
		 * was not in the roll call.
		 */
		status?: AttendanceStatus | null;
		/** A number drawn at the end of the row, such as the seat's notes. `undefined` draws none. */
		count?: number;
		/** What `count` counts, for a screen reader, such as "notes". */
		countNoun?: string;
	};

	let { seat, status, count, countNoun = '' }: Props = $props();

	/* The dot's colour for each answer, written out in full so that Tailwind can
	   find the class names. */
	const DOT_CLASSES = {
		present_and_voting: 'bg-success-700',
		present: 'bg-success-700',
		absent: 'bg-ink-400'
	};

	// `$derived` works these out again whenever `status` changes. Colour is never
	// the only signal, so the dot always comes with its words.
	const dotClass = $derived(status ? DOT_CLASSES[status] : 'border border-ink-400');
	const statusText = $derived(status ? statusLabel('attendance_status', status) : 'Not recorded');
</script>

<!--
	One seat of `SeatList`: flag, name, and the roll call's answer as a dot. The
	answer sits under the name, because beside it "Present and voting" left the
	name so little room in the Notes page's column that "United Kingdom" broke
	into pieces of three letters (T134).
-->
<span class="flex items-center gap-3">
	{#if seat.countryCode}
		<Flag countryCode={seat.countryCode} />
	{/if}
	<span class="flex min-w-0 flex-1 flex-col">
		<span class="break-words">{seat.name}</span>
		{#if status !== undefined}
			<span class="flex items-center gap-1.5 text-small text-ink-600">
				<span class="size-2 rounded-full {dotClass}" aria-hidden="true"></span>
				{statusText}
			</span>
		{/if}
	</span>
	{#if count !== undefined}
		<span class="text-small text-ink-600 tabular-nums">
			{count} <span class="sr-only">{countNoun}</span>
		</span>
	{/if}
</span>
