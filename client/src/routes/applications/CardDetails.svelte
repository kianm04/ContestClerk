<script lang="ts">
	import type { ApplicationCardDetails } from '$lib/application-cards';
	import { Separator } from '$lib/components/ui/separator';
	import AssignedSeat from './AssignedSeat.svelte';
	import MaterialList from './MaterialList.svelte';

	type Props = {
		details: ApplicationCardDetails;
	};

	let { details }: Props = $props();
</script>

<!--
	The card's middle column: what kind of application this is and when it was
	sent, then the committee and country once a seat is given, or the parts of
	the application and whether each is done until then.
-->
<div class="flex flex-col gap-3">
	<div class="min-w-0">
		<h3 class="text-h3 text-foreground">{details.title}</h3>
		<p class="text-small text-muted-foreground">{details.line}</p>
	</div>

	<!-- A shadcn `Separator` is the hairline rule between the two halves. -->
	<Separator />

	{#if details.seat !== null}
		<AssignedSeat seat={details.seat} />
	{:else}
		<MaterialList materials={details.materials} />
	{/if}
</div>
