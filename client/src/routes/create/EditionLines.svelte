<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import MapPin from '@lucide/svelte/icons/map-pin';

	type Props = {
		dates: string;
		place: string;
		/** The space above each line, which the two cards draw differently: `mt-2` or `mt-1.5`. */
		lineClass: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { dates, place, lineClass }: Props = $props();
</script>

<!-- An edition's dates and its place under its name, each with its 20 pixel icon. -->
<p class="flex items-center gap-3 fs-16 lh-22 text-creation-ink-450 {lineClass}">
	<Calendar aria-hidden="true" class="size-5 shrink-0 text-creation-ink-650" />
	<span class="truncate">{dates}</span>
</p>
<p class="flex items-center gap-3 fs-16 lh-22 text-creation-ink-450 {lineClass}">
	<MapPin aria-hidden="true" class="size-5 shrink-0 text-creation-ink-650" />
	<span class="truncate">{place}</span>
</p>
