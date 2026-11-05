<script lang="ts">
	import { DENSE_CONTROL_CLASSES, fieldId } from '$lib/form-fields';
	import type { FilterOption } from '$lib/filter-options';

	type Props = {
		/** The words a screen reader reads for the dropdown, which has no visible label. */
		label: string;
		/** The name the chosen value is sent under, such as `committee`. */
		name: string;
		/** The value chosen so far, or `''` for the placeholder. */
		value: string;
		options: FilterOption[];
		/**
		 * The words on the empty first option, such as "Any committee", which here
		 * means "do not filter by this". Left out when every choice is a real one,
		 * as with a sort order.
		 */
		placeholder?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { label, name, value, options, placeholder }: Props = $props();
</script>

<!--
	A dropdown of a management page's filter row (the manage redesign). Its
	first option names what it filters by ("Any committee"), so no label is
	drawn above it; `sr-only` keeps one for a screen reader. It is as wide as
	its words from `sm` up, but no wider than 15rem, because a dropdown is as
	wide as its longest option and a list of every country would stretch it
	across the row. On a phone it takes the row's share.

	`pr-10` keeps the chevron the forms plugin draws clear of the words, as
	`SelectField` explains.
-->
<div class="w-full sm:w-auto sm:max-w-60">
	<label for={fieldId(name)} class="sr-only">{label}</label>

	<select id={fieldId(name)} {name} class="{DENSE_CONTROL_CLASSES} pr-10">
		{#if placeholder}
			<option value="" selected={value === ''}>{placeholder}</option>
		{/if}

		<!--
			The `(option.value)` key lets Svelte reuse options instead of rebuilding
			them. `selected` marks the earlier choice in the HTML itself, so it also
			shows without JavaScript.
		-->
		{#each options as option (option.value)}
			<option value={option.value} selected={option.value === value}>{option.label}</option>
		{/each}
	</select>
</div>
