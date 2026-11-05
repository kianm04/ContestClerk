<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { DENSE_CONTROL_CLASSES, fieldId } from '$lib/form-fields';

	type Props = {
		/** The name the text is sent under, usually `q`. */
		name: string;
		/** What the server sent back, so the box still shows the current search. */
		value: string;
		/** The grey hint inside the empty box, such as "Name or school". */
		placeholder: string;
		/** The words a screen reader reads for the box, which has no visible label. */
		label: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { name, value, placeholder, label }: Props = $props();

	/*
		What the box holds now: the server's value to begin with, and whatever is
		typed after that. `$lib/components/SearchInput.svelte` explains why it is
		`bind:value` rather than `value`, and why `sentValue` is there.
	*/
	const sentValue = $derived(value);
	let currentValue = $derived(sentValue);
</script>

<!--
	The search box of a management page's filter row (the manage redesign): the
	compact 40px box of the other manage fields, with no label drawn above it.
	It takes the whole row on a phone and a fixed width from `sm` up.
-->
<div class="relative w-full sm:w-65">
	<!-- `sr-only` hides the label from the screen but not from a screen reader. -->
	<label for={fieldId(name)} class="sr-only">{label}</label>

	<span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-placeholder">
		<Search size={16} strokeWidth={1.75} aria-hidden="true" />
	</span>

	<input
		id={fieldId(name)}
		{name}
		bind:value={currentValue}
		{placeholder}
		type="search"
		class="{DENSE_CONTROL_CLASSES} pl-9"
	/>
</div>
