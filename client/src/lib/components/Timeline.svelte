<script lang="ts">
	/** One moment on the timeline. `time` is already formatted, such as "13:30 – 15:00". */
	export type TimelineItem = {
		time: string;
		title: string;
		subtitle?: string;
		location?: string;
	};

	type Props = {
		items: TimelineItem[];
	};

	let { items }: Props = $props();
</script>

<!--
	The dotted line is the left border of the list; each dot is a small circle
	pulled out over it with `absolute`. `<ol>` because a timeline is in order.
-->
<ol class="relative border-l border-dashed border-line pl-5">
	<!--
		These items come straight from a prop and have no id of their own, so the
		place in the list is the key.
	-->
	{#each items as item, index (index)}
		<li class="relative pb-4 last:pb-0">
			<span class="absolute top-2 -left-[23px] h-2 w-2 rounded-full bg-brand-700"></span>

			<p class="text-label text-ink-600 uppercase">{item.time}</p>
			<p class="text-h3">{item.title}</p>

			{#if item.subtitle}
				<p class="text-small text-ink-600">{item.subtitle}</p>
			{/if}

			{#if item.location}
				<p class="text-small text-ink-600">{item.location}</p>
			{/if}
		</li>
	{/each}
</ol>
