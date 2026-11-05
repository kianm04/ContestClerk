<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Switch } from '$lib/components/ui/switch';

	type Props = {
		/** A tick box for who can apply, a switch for a requirement, as the design draws them. */
		kind: 'checkbox' | 'switch';
		/** The name sent, as `on`, while it is on; nothing is sent while it is off. */
		name: string;
		label: string;
		description: string;
		isChecked: boolean;
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { kind, name, label, description, isChecked, class: className }: Props = $props();

	// Writable `$derived`: ticked or not now, starting from what is saved.
	let checked = $derived(isChecked);
</script>

<!--
	One on-or-off setting with its label and a grey sentence. shadcn's
	`Checkbox` and `Switch` send `name=on` in a hidden input while on, as a
	plain tick box would, which the server reads. The design's sizes: a 22
	pixel blue tick box with a 6 pixel corner, or a 46 by 26 switch with a 20
	pixel knob 3 in from the edge. `[&_svg]:` and `*:` reach the tick and the
	knob inside shadcn's components.
-->
<div class={['flex items-start', kind === 'checkbox' ? 'gap-4' : 'gap-4.75', className]}>
	{#if kind === 'checkbox'}
		<Checkbox
			id={name}
			{name}
			bind:checked
			class="size-5.5 rounded-sm border-2 border-creation-radio-border bg-white focus-visible:ring-2 focus-visible:ring-creation-blue-focus/40 data-checked:border-creation-blue data-checked:bg-creation-blue [&_svg]:size-3.5 [&_svg]:stroke-3"
		/>
	{:else}
		<Switch
			id={name}
			{name}
			bind:checked
			class="*:size-5! *:translate-x-0.5! *:shadow-sm data-[size=default]:h-6.5 data-[size=default]:w-11.5 data-checked:bg-creation-blue *:data-checked:translate-x-5.5! data-unchecked:bg-creation-radio-border"
		/>
	{/if}
	<label for={name} class="min-w-0 cursor-pointer">
		<span
			class={[
				'block fs-16 lh-22 text-creation-ink-950',
				kind === 'checkbox' ? 'font-medium' : 'mt-0.25'
			]}
		>
			{label}
		</span>
		<span
			class={[
				'block fs-14 lh-18 text-creation-ink-225',
				kind === 'checkbox' ? '-mt-0.75' : '-mt-0.5'
			]}
		>
			{description}
		</span>
	</label>
</div>
