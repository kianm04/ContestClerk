<script lang="ts">
	import { flagUrl } from '$lib/media';
	import {
		ROOM_CLOCK,
		ROOM_CLOCK_PERCENT,
		ROOM_COMMITTEE_NAME,
		ROOM_FLOOR_CODE,
		ROOM_FLOOR_NAME,
		ROOM_NEXT_LINE,
		ROOM_TOPIC
	} from '$lib/organiser-room';
</script>

<!--
	A drawn projector display in the Human Rights Council: wide and nearly
	empty, the flag, the country speaking and its clock as large as the room
	needs, then the next three speakers. It is a part of the committee room
	picture, whose parent hides it from screen readers and carries the
	sentence.

	The committee room lays the chair's console over this display's left side,
	so the words start 8.5rem in (`pl-34`) to stay clear of it. The clock is in
	the sans and `tabular-nums`, so its digits do not dance.
-->
<div
	class="flex aspect-[16/10] flex-col rounded-xl bg-surface px-6 pt-5 pb-6 text-ink-900 shadow-card"
>
	<span class="text-caption text-ink-600">{ROOM_COMMITTEE_NAME} · {ROOM_TOPIC}</span>

	<div class="flex flex-1 flex-col justify-center pl-34">
		<div class="flex flex-col items-start gap-2">
			<img
				src={flagUrl(ROOM_FLOOR_CODE, 'lg')}
				alt=""
				class="h-12 w-16 shrink-0 rounded-[4px] object-cover outline-1 -outline-offset-1 outline-ink-900/10"
			/>
			<span class="font-display text-[3.5rem]/[3.75rem] font-semibold">{ROOM_FLOOR_NAME}</span>
		</div>
		<span class="mt-1.5 text-[5.5rem]/[5.5rem] font-semibold tracking-[-0.01em] tabular-nums">
			{ROOM_CLOCK}
		</span>
		<!-- The bar of the time left: light blue on a paler blue. -->
		<div class="mt-3.5 h-1.5 w-48 max-w-full overflow-hidden rounded-full bg-brand-50">
			<div class="h-full rounded-full bg-brand-500" style:width="{ROOM_CLOCK_PERCENT}%"></div>
		</div>
	</div>

	<span class="pl-34 text-dense text-ink-600">{ROOM_NEXT_LINE}</span>
</div>
