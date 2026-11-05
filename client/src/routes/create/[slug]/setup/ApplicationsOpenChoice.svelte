<script lang="ts">
	import { RadioGroupItem } from '$lib/components/ui/radio-group';

	type Props = {
		/** The value this choice sends as `openMode`. */
		value: string;
		label: string;
		description: string;
		/** The sentence's width in the design's pixels, as a class, so it breaks where the design's does. */
		descriptionClass?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { value, label, description, descriptionClass }: Props = $props();

	const id = $derived(`openMode-${value}`);
</script>

<!--
	One of the two opening choices: shadcn's radio, drawn as the design's 22
	pixel circle (filled blue with a white dot when chosen, a grey ring when
	not), then its label and a grey sentence. The label's `for` makes the
	words choose it too. `[&_svg]:` reaches the dot inside shadcn's radio.
-->
<div class="flex items-start gap-4">
	<RadioGroupItem
		{id}
		{value}
		class="mt-0 size-5.5 border-2 border-creation-radio-border bg-white focus-visible:ring-2 focus-visible:ring-creation-blue-focus/40 data-checked:border-creation-blue data-checked:bg-creation-blue [&_svg]:size-2.25 [&>div]:size-full"
	/>
	<label for={id} class="min-w-0 cursor-pointer">
		<span class="block fs-16 lh-22 font-medium text-creation-ink-950">{label}</span>
		<span class={['-mt-0.25 block fs-14 lh-18 text-creation-ink-225', descriptionClass]}>
			{description}
		</span>
	</label>
</div>
