<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import type { DeleteDialogContent } from '$lib/creation-setup-dialog';

	type Props = {
		content: DeleteDialogContent;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { content }: Props = $props();

	// `$lib` lists the facts as name, amount, collection; the board names the last one by what delegates see.
	const name = $derived(content.facts[0]?.value ?? '');
	const amount = $derived(content.facts[1]?.value ?? '');
	const payment = $derived(
		content.facts[2]?.value === 'Through MUNMeet' ? 'Charged to delegates' : 'Collected externally'
	);
	const LABEL_CLASSES = 'fs-14 lh-18 text-creation-ink-450';
</script>

<Dialog.Description class="mt-5 fs-20 lh-31 text-creation-ink-300">
	Accepted delegates will no longer be invoiced this amount automatically. This action cannot be
	undone.
</Dialog.Description>
<!-- Three labelled columns; a label over each value, so a phone stacks them in pairs. -->
<dl
	class="mt-9 grid gap-y-3 rounded-lg border border-creation-panel-border bg-creation-field px-7 py-5 lg:h-26.5 lg:grid-cols-[180fr_130fr_161fr] lg:pt-6.5 lg:pb-0"
>
	<div>
		<dt class={LABEL_CLASSES}>Fee name</dt>
		<dd class="mt-4 fs-17 lh-22 font-semibold text-creation-ink-950 max-lg:mt-1">{name}</dd>
	</div>
	<div>
		<dt class={LABEL_CLASSES}>Amount</dt>
		<dd class="mt-4 fs-17 lh-22 font-medium text-creation-ink-950 tabular-nums max-lg:mt-1">
			{amount}
		</dd>
	</div>
	<div>
		<dt class={LABEL_CLASSES}>Payment method</dt>
		<dd class="mt-4 fs-16 lh-22 whitespace-nowrap text-creation-ink-450 max-lg:mt-1">{payment}</dd>
	</div>
</dl>
