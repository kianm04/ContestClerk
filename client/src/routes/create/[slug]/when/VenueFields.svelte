<script lang="ts">
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { FIELD_CLASSES, LABEL_CLASSES } from './where-fields';
	import IconField from './IconField.svelte';

	type Props = { venueName: string };

	let { venueName = $bindable() }: Props = $props();
</script>

<!--
	An empty venue is a real answer: "to be announced", which the placeholder
	says in the design's dark ink, as the venue it stands for.
-->
<div class="min-w-0">
	<Label for="venueName" class={LABEL_CLASSES}>Venue (optional)</Label>
	<div class="mt-1">
		<IconField icon={MapPin}>
			<Input
				id="venueName"
				name="venueName"
				placeholder="To be announced"
				class="{FIELD_CLASSES} pl-12 placeholder:text-creation-ink-950"
				bind:value={venueName}
			/>
		</IconField>
	</div>
</div>
