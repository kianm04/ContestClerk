<script lang="ts">
	import type { Snippet } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';

	type Props = {
		/** The `id` of the input inside, which the label points at. */
		id: string;
		label: string;
		/** A line in small grey text: under the label on Create fee, under the field on Edit fee. */
		help: string;
		error?: string;
		/**
		 * `create` is the Create fee board: a 189 pixel label column with its
		 * help under the label. `edit` is the Edit fee board: a 133 pixel column
		 * with the label alone, larger, and the help under the field.
		 */
		layout?: 'create' | 'edit';
		/** The distance above this row, which the boards vary row by row. */
		class?: string;
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	// `children` is whatever the parent writes between the tags: the input.
	let { id, label, help, error, layout = 'create', class: className, children }: Props = $props();
</script>

<!--
	One row of the fee dialog: the label on the left and the field on the
	right from a laptop up, one above the other on a phone. The columns are
	the board's widths as proportions, so the row narrows with the window.
-->
<div
	class={[
		'grid items-start gap-1.5 lg:gap-0',
		layout === 'create' ? 'lg:grid-cols-[189fr_518fr]' : 'lg:grid-cols-[133fr_469fr]',
		className
	]}
>
	{#if layout === 'create'}
		<div class="pt-0.25">
			<Label for={id} class="block fs-14 lh-20 font-semibold text-creation-ink-900">{label}</Label>
			<p id={fieldHelpId(id)} class="fs-12 lh-18 text-creation-ink-225">{help}</p>
		</div>
	{:else}
		<Label
			for={id}
			class="block pt-2.5 fs-16 lh-22 font-semibold text-creation-ink-950 max-lg:pt-0"
		>
			{label}
		</Label>
	{/if}
	<div class="min-w-0">
		{@render children()}
		{#if layout === 'edit'}
			<p id={fieldHelpId(id)} class="mt-1.25 fs-14 lh-20 text-creation-ink-225">{help}</p>
		{/if}
		<FieldError id={fieldErrorId(id)} message={error} />
	</div>
</div>
