<script lang="ts">
	import { Label } from '$lib/components/ui/label';

	type Props = {
		/** The id of the radio this text names, so a press on the words picks it. */
		forId: string;
		label: string;
		/** A line of help under the label, or `null` for none. */
		help: string | null;
	};

	let { forId, label, help }: Props = $props();
</script>

<!-- The words beside one scope choice, shared by the plain and the shadcn radios. -->
<div>
	<Label for={forId} class="text-body font-normal">{label}</Label>
	{#if help}
		<p class="text-small text-muted-foreground">{help}</p>
	{/if}
</div>
