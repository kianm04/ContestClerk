<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { formatClock, formatDuration, timerTone, type TimerTone } from '$lib/committee-room';
	import { countryName } from '$lib/countries';
	import {
		OPENING_ROOM,
		ROOM_COMMITTEE_NAME,
		ROOM_SPEAKING_TIME_SECONDS,
		ROOM_TOPIC,
		clockPercent,
		floorCountryCode,
		tickRoom,
		waitingCountryCodes
	} from '$lib/landing-room';
	import LandingSpeakerRow from './LandingSpeakerRow.svelte';

	// `$state.raw` makes `room` reactive: every tick replaces it and the clock
	// redraws. `raw` because it is replaced whole, never changed in place.
	let room = $state.raw(OPENING_ROOM);

	// `$effect` runs in the browser once the picture is on screen: the interval
	// ticks the room once a second, and the function returned stops it again.
	$effect(() => {
		const interval = setInterval(() => {
			room = tickRoom(room);
		}, 1000);

		return () => clearInterval(interval);
	});

	// `$derived` works each of these out again on every tick.
	const floorCode = $derived(floorCountryCode(room));
	const waiting = $derived(waitingCountryCodes(room));
	const clock = $derived(formatClock(room.secondsLeft));
	const tone = $derived(timerTone(room.secondsLeft));
	const percent = $derived(clockPercent(room));

	/* Black until the last ten seconds, amber then, red once the time is up, as
	   the chair's own clock. Written out in full so Tailwind can find the classes. */
	const CLOCK_TONE_CLASSES: Record<TimerTone, string> = {
		normal: 'text-ink-900',
		warning: 'text-warning-700',
		danger: 'text-danger-700'
	};
</script>

<!--
	A drawn chair console, running: the committee, the country with the floor
	and its clock, a bar of the time left, and the speakers' list. The clock
	counts down for real and the floor passes on when it is up
	(`$lib/landing-room.ts`). It is a shadcn `Card` in the example's manner,
	named for screen readers as a figure, because it is a picture of the
	product: nothing in it can be pressed. The clock is `tabular-nums` so its
	digits do not dance, and in the sans: the serif names the country with the
	floor, never a changing number.
-->
<Card.Root
	role="figure"
	aria-labelledby="landing-room-caption"
	class="gap-0 overflow-hidden rounded-2xl py-0 shadow-card ring-0"
>
	<p id="landing-room-caption" class="sr-only">
		An example of the chair's console: the {ROOM_COMMITTEE_NAME}'s speakers' list, with one country
		holding the floor and its clock counting down.
	</p>

	<div class="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
		<div class="min-w-0">
			<p class="text-small font-medium text-ink-900">{ROOM_COMMITTEE_NAME}</p>
			<p class="truncate text-caption text-ink-600">{ROOM_TOPIC}</p>
		</div>
		<Badge
			variant="secondary"
			class="h-auto shrink-0 gap-2 rounded-full bg-success-100 px-3 py-1 text-xs text-success-700"
		>
			<span aria-hidden="true" class="size-2 rounded-full bg-success-500"></span>
			In session
		</Badge>
	</div>

	<div class="flex items-center gap-4 px-5 pt-5 pb-4">
		<Flag countryCode={floorCode} size="md" />
		<div class="min-w-0 flex-1">
			<p class="text-caption text-ink-600">Has the floor</p>
			<p class="truncate font-display text-h2 text-ink-900">{countryName(floorCode)}</p>
		</div>
		<p class="text-display-mobile font-semibold tabular-nums {CLOCK_TONE_CLASSES[tone]}">{clock}</p>
	</div>

	<!-- The bar under the clock: blue, shrinking with the time left. -->
	<div class="mx-5 h-1.5 overflow-hidden rounded-full bg-brand-50">
		<div
			class="h-full rounded-full bg-brand-700 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
			style:width="{percent}%"
		></div>
	</div>

	<p
		class="flex items-baseline justify-between px-5 pt-5 pb-1 text-caption font-medium text-ink-600"
	>
		Speakers' list
		<span class="tabular-nums">{formatDuration(ROOM_SPEAKING_TIME_SECONDS)} each</span>
	</p>

	<!-- The `(code)` key lets Svelte move a row rather than redraw it when the floor passes. -->
	<ol class="divide-y divide-neutral-100 px-5 pb-3">
		{#each waiting as code, index (code)}
			<LandingSpeakerRow countryCode={code} position={index + 1} />
		{/each}
	</ol>
</Card.Root>
