<script lang="ts">
	import ListOrdered from '@lucide/svelte/icons/list-ordered';

	type Props = {
		/** The committee's topics, in the order the committee lists them. */
		topics: string[];
	};

	let { topics }: Props = $props();
</script>

<!--
	Beside the editor on a wider screen the topics stay open. On a phone they
	fold away under their heading, so the editor comes first; `<details>`
	opens and closes without any JavaScript. Tailwind's `md:` classes decide
	which of the two is shown, so both are in the page.
-->
<details class="rounded-control border border-line bg-surface p-3 md:hidden">
	<summary class="text-body font-medium text-ink-900">Topics to cover ({topics.length})</summary>
	<ol class="mt-2 list-inside list-decimal text-body">
		<!-- Topics have no id of their own, so the place in the list is the key. -->
		{#each topics as topic, index (index)}
			<li>{topic}</li>
		{/each}
	</ol>
</details>

<section class="hidden rounded-control border border-line bg-surface p-3 md:block">
	<h2 class="flex items-center gap-2 text-body font-medium text-ink-900">
		<ListOrdered class="size-4" aria-hidden="true" />
		Topics to cover
	</h2>
	<ol class="mt-2 list-inside list-decimal text-body">
		{#each topics as topic, index (index)}
			<li>{topic}</li>
		{/each}
	</ol>
</section>
