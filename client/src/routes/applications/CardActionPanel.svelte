<script lang="ts">
	import type { CardAction } from '$lib/application-card-actions';
	import ActionLink from './ActionLink.svelte';

	type Props = {
		/** Worked out on the server by `cardAction` in `$lib/application-card-actions.ts`. */
		action: CardAction;
	};

	let { action }: Props = $props();

	// Red is for state: only a refusal or an error is told in it (docs/DESIGN.md).
	const titleClass = $derived(action.tone === 'danger' ? 'text-destructive' : 'text-foreground');
</script>

<!--
	The card's last column: what to do next in a line or two, and the buttons
	that go there. No tinted box and no icon: the words and the one dark blue
	button already say it.
-->
<div class="flex flex-col gap-3">
	<div class="min-w-0">
		<p class="font-medium {titleClass}">{action.title}</p>

		{#if action.description !== null}
			<p class="text-small text-muted-foreground">{action.description}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		{#if action.primary !== null}
			<ActionLink link={action.primary} />
		{/if}

		<ActionLink link={action.secondary} />
	</div>
</div>
