<script lang="ts">
	type Props = {
		/** The form field the choice is sent as. */
		name: string;
		value: string;
		label: string;
		/** One short line under the label. */
		description?: string;
		/** The chosen value of the whole set; `bind:group` keeps it in step. */
		group: string;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		/** A plain row with no card around it, as the applications dialog draws its choices. */
		isPlain?: boolean;
		/** 40px tall on a laptop, the line under the label cut short, for the Setup dashboard. */
		isCompact?: boolean;
	};

	// `$bindable()` lets the parent write `bind:group={...}` and see the choice change.
	let {
		name,
		value,
		label,
		description,
		group = $bindable(),
		onchange,
		isPlain = false,
		isCompact = false
	}: Props = $props();
</script>

<!--
	One option of a set, drawn as a small card with its dot on the left, as the
	mockups draw them. It is a real radio button inside a label, so it works
	without JavaScript and with the arrow keys. `has-checked:` styles the card
	from the state of the input inside it, and `has-focus-visible:` draws the
	focus ring on the card rather than the dot.
-->
<label
	class={[
		'flex min-h-11 cursor-pointer gap-2.5 rounded-lg has-focus-visible:ring-2 has-focus-visible:ring-ring',
		isPlain
			? 'items-start py-1'
			: 'items-center border border-border bg-card px-3 py-1 transition-colors duration-150 hover:border-input has-checked:border-primary has-checked:bg-brand-50',
		isCompact && 'lg:h-10 lg:min-h-0 lg:py-0'
	]}
>
	<input
		type="radio"
		{name}
		{value}
		bind:group
		{onchange}
		class={['size-4 shrink-0 accent-primary focus:outline-none', isPlain && 'mt-0.5']}
	/>
	<span class="flex min-w-0 flex-col">
		<span class="text-sm leading-5 font-medium">{label}</span>
		{#if description}
			<span class={['text-xs leading-4 text-muted-foreground', isCompact && 'truncate']}>
				{description}
			</span>
		{/if}
	</span>
</label>
