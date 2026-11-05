<script lang="ts">
	import { RadioGroupItem } from '$lib/components/ui/radio-group';
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		value: string;
		/** The dot's size and place when not 20 pixels, such as `size-4.5`. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { value, class: className }: Props = $props();
</script>

<!--
	shadcn's radio button, drawn as the boards draw it: a grey ring, or a blue
	disc with a 7 pixel white dot when chosen. bits-ui marks the chosen one
	`data-state="checked"`, which the `data-[state=checked]:` classes read.
	The label around it names it, and makes the whole card clickable.
-->
<RadioGroupItem
	{value}
	class={creationClasses(
		'size-5 border-2 border-creation-radio-border bg-white data-[state=checked]:border-0 data-[state=checked]:bg-creation-blue [&_svg]:size-1.75 [&_svg]:fill-white [&_svg]:stroke-none',
		className
	)}
/>
