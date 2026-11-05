<script lang="ts">
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
	import { SAMPLE_ANNOUNCEMENT } from '$lib/organiser-fees';
</script>

<!--
	The organiser's form in the announcement picture: a title, the audience
	with how many people it reaches, a tick box to pin it and the dark blue
	button that posts it. Fields and the button are drawn as `<span>`s, because
	the picture cannot be typed in or pressed.

	Full width on a phone, where the three cards stack; from `md` up it sits at
	the top left of the stage and the other two cards overlap it.
-->
<div
	class="relative w-full rounded-2xl bg-surface shadow-card md:absolute md:top-0 md:left-0 md:w-[21rem]"
>
	<div class="border-b border-neutral-100 px-5 py-3.5 font-medium">New announcement</div>
	<div class="flex flex-col px-5 pt-4 pb-5">
		<span class="text-[0.8125rem]/[1rem] font-medium">Title</span>
		<span class="mt-1.5 rounded-[0.375rem] border border-input px-3 py-[0.4375rem]">
			{SAMPLE_ANNOUNCEMENT.title}
		</span>
		<span class="mt-4 text-[0.8125rem]/[1rem] font-medium">Audience</span>
		<span
			class="mt-1.5 flex items-center justify-between gap-2 rounded-[0.375rem] border border-input px-3 py-[0.4375rem]"
		>
			<span>{SAMPLE_ANNOUNCEMENT.audience}</span>
			<ChevronDown size={16} class="flex-none text-ink-600" />
		</span>
		<span class="mt-1.5 text-caption text-ink-600 tabular-nums">{SAMPLE_ANNOUNCEMENT.reach}</span>
		<span class="mt-4 flex items-center gap-2">
			<span class="size-4 flex-none rounded-[3px] border border-input bg-surface"></span>
			Pin to the top
		</span>
		<span
			class="mt-[1.125rem] self-start rounded-[0.375rem] bg-brand-900 px-4 py-2 font-medium text-surface"
		>
			Post announcement
		</span>
	</div>
</div>
