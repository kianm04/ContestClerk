<script lang="ts">
	import type { Snippet } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';

	type Props = {
		/** The words at the left: "Topic", "Raised by". */
		label: string;
		/**
		 * The `id` of the one control the label names. For a row of radio buttons
		 * it is the row's own `id` instead: the label then names the row as a group.
		 */
		forId: string;
		/** Whether the field is a row of radio buttons, named as one group. */
		isGroup?: boolean;
		/** A quiet word after the controls, such as "optional". */
		hint?: string | null;
		/** What is wrong with the field, or null. */
		error?: string | null;
		/** The controls, written between this component's tags. */
		children: Snippet;
	};

	let { label, forId, isGroup = false, hint = null, error = null, children }: Props = $props();
</script>

<!--
	One field of a start form: its label at the left in a 128px column, the
	controls beside it, a quiet hint after them and, under them, what is wrong.
	On a phone the label goes above. A row of radio buttons has no single
	control for a `<label>` to point at, so it is a `role="group"` named by
	the label's words instead.
-->
<div
	class="grid grid-cols-[128px_minmax(0,1fr)] items-center gap-x-4 max-md:grid-cols-1 max-md:gap-y-1.5"
>
	{#if isGroup}
		<span id="{forId}-label" class="text-ink-600">{label}</span>
	{:else}
		<label for={forId} class="text-ink-600">{label}</label>
	{/if}
	<div
		role={isGroup ? 'group' : undefined}
		aria-labelledby={isGroup ? `${forId}-label` : undefined}
		class="flex min-w-0 flex-wrap items-center gap-2"
	>
		{@render children()}
		{#if hint}
			<span class="text-small text-ink-600">{hint}</span>
		{/if}
	</div>
	{#if error}
		<div class="col-start-2 max-md:col-start-1">
			<FieldError id="{forId}-error" message={error} />
		</div>
	{/if}
</div>
