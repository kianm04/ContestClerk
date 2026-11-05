<script lang="ts">
	import Info from '@lucide/svelte/icons/info';

	// The two reminders, in the design's order.
	const HINTS = ['Capacity can be set later', 'Rooms optional for now'];
</script>

<!--
	Two quiet reminders the design sets beside the committee buttons, so nobody
	stalls on numbers they do not know yet: 	white pills with a hairline, a blue
	14 pixel info icon and 12 pixel words. Left out on a phone, where the title
	row has no room for them.
-->
{#each HINTS as hint (hint)}
	<span
		class="inline-flex h-7 items-center gap-1.5 rounded-full border border-creation-input-border bg-white px-2.5 fs-12 whitespace-nowrap text-creation-ink-450 max-lg:hidden"
	>
		<Info class="size-3.5 text-creation-blue" aria-hidden="true" />
		{hint}
	</span>
{/each}
