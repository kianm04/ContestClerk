<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { FIELD_CLASSES, LABEL_CLASSES } from './where-fields';

	type Props = { venueAddress: string };

	let { venueAddress = $bindable() }: Props = $props();
</script>

<!-- Asked once a venue has a name; the design has no address, so it comes after the timezone. -->
<div class="min-w-0">
	<Label for="venueAddress" class={LABEL_CLASSES}>Venue address (optional)</Label>
	<Input
		id="venueAddress"
		name="venueAddress"
		placeholder="Street and number"
		class="{FIELD_CLASSES} mt-1"
		bind:value={venueAddress}
	/>
</div>
