<script lang="ts">
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { AttentionItem } from '$lib/dashboard-attention';
	import NeedsYouAction from './NeedsYouAction.svelte';

	type Props = {
		/** "Needs you", or "Wrapping up" after the conference, from `attentionTitle`. */
		title: string;
		/** What `dashboardAttention` found waiting, warnings first. */
		items: AttentionItem[];
		/**
		 * Whether the first line's button is the page's one filled button. It is
		 * not on a conference day, when the live panel above holds that button.
		 */
		isFirstPrimary: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, items, isFirstPrimary }: Props = $props();
</script>

<!--
	What is waiting for the organiser, most urgent first
	(`05-pages/organiser/dashboard.md`, "Needs you"). Each line says what is
	waiting and ends with the way to it.
-->
<ManageSection {title}>
	{#if items.length === 0}
		<p class="px-1 py-4 text-dense text-muted-foreground">Nothing is waiting for you right now.</p>
	{:else}
		<ul>
			<!--
				Each line's `key` is fixed and distinct, so Svelte can reuse the lines.
				`?? undefined` turns "no second line" from the `null` the list uses
				into the `undefined` `ActionRow` expects.
			-->
			{#each items as item, index (item.key)}
				<ActionRow title={item.title} detail={item.detail ?? undefined}>
					<NeedsYouAction {item} isPrimary={isFirstPrimary && index === 0} />
				</ActionRow>
			{/each}
		</ul>
	{/if}
</ManageSection>
