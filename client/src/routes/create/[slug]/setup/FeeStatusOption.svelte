<script lang="ts">
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { cn } from '$lib/utils';

	type Props = {
		value: string;
		label: string;
		/** One short line under the label. */
		description: string;
		/** Its distance from the card before, such as `lg:ml-1.5`. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { value, label, description, class: className }: Props = $props();
</script>

<!--
	One of the three fee choices: an 18 pixel dot, the label and its line, in a
	54 pixel card with an 8 pixel corner. The dot is
	shadcn's radio item, restyled; it must sit inside the `RadioGroup.Root` in
	FeeStatusChoice. Wrapping it in a `<label>` gives it the card's words as its
	name and makes the whole card clickable. `has-data-[state=checked]:` styles the card
	from the item inside it, and `group-has-data-[state=checked]:` its words; a chosen
	card takes a 2 pixel blue edge and one pixel less padding, so nothing moves.
-->
<label
	class={cn(
		'group flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-creation-card-border bg-white pr-4 pl-3.5 transition-colors duration-150 hover:border-creation-track has-focus-visible:ring-2 has-focus-visible:ring-creation-blue-focus has-data-[state=checked]:border-2 has-data-[state=checked]:border-creation-blue-border has-data-[state=checked]:bg-creation-selected has-data-[state=checked]:pr-3.75 has-data-[state=checked]:pl-3.25 lg:h-13.5 lg:min-h-0',
		className
	)}
>
	<RadioGroup.Item
		{value}
		class="size-4.5 border-2 border-creation-radio-border bg-white focus-visible:ring-0 data-[state=checked]:border-creation-blue data-[state=checked]:bg-creation-blue [&_svg]:size-1.5 [&_svg]:bg-white [&_svg]:stroke-none [&>div]:size-full"
	/>
	<span class="flex min-w-0 flex-col">
		<span
			class="fs-14 lh-18 font-semibold text-creation-ink-950 group-has-data-[state=checked]:text-creation-blue"
		>
			{label}
		</span>
		<span
			class="fs-12 lh-16 text-creation-ink-275 group-has-data-[state=checked]:text-creation-ink-450 lg:whitespace-nowrap"
		>
			{description}
		</span>
	</span>
</label>
