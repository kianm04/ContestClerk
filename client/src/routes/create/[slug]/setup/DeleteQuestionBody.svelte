<script lang="ts">
	import Asterisk from '@lucide/svelte/icons/asterisk';
	import FileText from '@lucide/svelte/icons/file-text';
	import List from '@lucide/svelte/icons/list';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { DeleteDialogContent } from '$lib/creation-setup-dialog';

	type Props = {
		content: DeleteDialogContent;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { content }: Props = $props();

	// `$lib` lists the facts as question, type, answer; the board draws them as a quote and two tags.
	const label = $derived(content.facts[0]?.value ?? '');
	const typeLabel = $derived(content.facts[1]?.value ?? '');
	const isRequired = $derived(content.facts[2]?.value === 'Required');

	const PILL_CLASSES = 'flex h-7.5 items-center gap-2.5 rounded-full px-3.5 fs-15 font-medium';
</script>

<!-- Indented past the warning circle at the left, as the board draws it. -->
<Dialog.Description class="mt-1 ml-20.75 fs-17 lh-24 text-creation-ink-300 max-lg:ml-0">
	Are you sure you want to delete this custom question?
</Dialog.Description>
<p class="mt-3.5 ml-20.75 fs-16 lh-22 text-creation-ink-300 max-lg:ml-0">
	This will permanently remove it from the application form for future applicants. Other application
	settings will not be affected.
</p>
<div class="mt-6.5 rounded-lg border border-creation-panel-border bg-creation-field px-5 py-4.5">
	<p class="flex items-center gap-3.75 fs-18 lh-24 font-semibold text-creation-ink-950">
		<FileText class="size-6 shrink-0 text-creation-ink-650" aria-hidden="true" />
		“{label}”
	</p>
	<p class="mt-3 flex flex-wrap gap-3 pl-9.75">
		<span class="{PILL_CLASSES} bg-creation-pill text-creation-ink-800">
			<List class="size-4 text-creation-blue" aria-hidden="true" />
			Type: {typeLabel}
		</span>
		{#if isRequired}
			<span class="{PILL_CLASSES} bg-creation-red-tint text-creation-red">
				<Asterisk class="size-4" strokeWidth={2.5} aria-hidden="true" />
				Required
			</span>
		{:else}
			<span class="{PILL_CLASSES} bg-white text-creation-ink-500">Optional</span>
		{/if}
	</p>
</div>
<hr class="mt-5.5 border-creation-rule" />
