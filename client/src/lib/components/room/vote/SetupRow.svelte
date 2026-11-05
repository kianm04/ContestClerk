<script lang="ts">
	import type { Snippet } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';

	type Props = {
		/** The words that name the field: "On", "Type", "Majority", "Method". */
		label: string;
		/** The `id` of the one input the words label, drawn as a `<label>`. */
		labelFor?: string;
		/** Otherwise the `id` the words carry, which a group of choices names itself with. */
		labelId?: string;
		/** The `id` of the message under the field, which the field points at. */
		errorId: string;
		/** What is wrong with the field, or nothing. */
		error?: string;
		/** The field itself, written between the component's tags. */
		children: Snippet;
	};

	let { label, labelFor, labelId, errorId, error, children }: Props = $props();
</script>

<!--
	One row of the vote's set-up: the words at the left, 128px wide, and the
	field beside them, with its message under it. On a phone the words go
	above the field.
-->
<div
	class="flex flex-col gap-1.5 md:grid md:grid-cols-[128px_minmax(0,1fr)] md:items-center md:gap-4"
>
	{#if labelFor}
		<label for={labelFor} class="text-ink-600">{label}</label>
	{:else}
		<span id={labelId} class="text-ink-600">{label}</span>
	{/if}
	<div class="min-w-0">
		{@render children()}
		<FieldError id={errorId} message={error} />
	</div>
</div>
