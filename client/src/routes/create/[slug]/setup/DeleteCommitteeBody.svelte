<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Armchair from '@lucide/svelte/icons/armchair';
	import FileText from '@lucide/svelte/icons/file-text';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { DeleteDialogContent } from '$lib/creation-setup-dialog';

	type Props = {
		content: DeleteDialogContent;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { content }: Props = $props();

	/*
		The board sets the committee's name in bold inside the question. The
		words come whole from `$lib`, so the name is cut back out of them; if
		they ever change shape, the sentence is shown plain.
	*/
	const PREFIX = 'Are you sure you want to delete the ';
	const subject = $derived(
		content.sentence.startsWith(PREFIX) && content.sentence.endsWith('?')
			? content.sentence.slice(PREFIX.length, -1)
			: null
	);

	/** The glyph beside each fact, in the board's order: name, seats, room. */
	const ICONS: LucideIcon[] = [UsersRound, Armchair, FileText];
</script>

<!-- `Dialog.Description` is what a screen reader reads after the title. -->
<Dialog.Description class="mt-3.25 max-w-117.5 fs-19 lh-26 text-creation-ink-300">
	{#if subject === null}
		{content.sentence}
	{:else}
		{PREFIX}<strong class="font-semibold text-creation-ink-950">{subject}</strong>?
	{/if}
</Dialog.Description>
<p class="mt-3.5 max-w-122.5 fs-17 lh-24 text-creation-ink-300">
	Delegates will no longer be able to select this committee when applying. This action can be undone
	only by recreating the committee.
</p>
<!-- The three facts in columns, divided by hairlines; one under another on a phone. -->
<dl
	class="mt-6 grid self-stretch rounded-lg border border-creation-panel-border bg-creation-field pt-3.5 pb-1.75 text-left lg:grid-cols-[252fr_115fr_167fr]"
>
	{#each content.facts as fact, index (fact.label)}
		{@const Icon = ICONS[index] ?? FileText}
		<div
			class={[
				'pr-4 pb-1.75 pl-6',
				index > 0 && 'border-creation-panel-border max-lg:border-t max-lg:pt-1.75 lg:border-l'
			]}
		>
			<!-- The name's label sits over its words; the others over their icon, as the board has them. -->
			<dt class={['fs-14 lh-18 font-medium text-creation-ink-450', index === 0 && 'ml-8.5']}>
				{fact.label}
			</dt>
			<dd
				class={[
					'mt-1.5 flex items-start gap-3 text-creation-ink-950',
					index === 2 ? 'fs-16 lh-22' : 'fs-17 lh-22'
				]}
			>
				<Icon class="size-5.5 shrink-0 text-creation-ink-650" aria-hidden="true" />
				{fact.value}
			</dd>
		</div>
	{/each}
</dl>
<hr class="mt-6.5 self-stretch border-creation-rule" />
