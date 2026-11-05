<script lang="ts">
	import type { ApplicationListSeat } from '$lib/applications';
	import Flag from '$lib/components/Flag.svelte';

	type Props = {
		seat: ApplicationListSeat;
	};

	let { seat }: Props = $props();

	// A seat that is not a country, such as "Press", is not called one.
	const seatHeading = $derived(seat.countryCode !== null ? 'Assigned country' : 'Assigned seat');
</script>

<!-- The committee and the country the reader will represent there: a label over each value. -->
<div class="flex flex-col gap-3">
	<div class="min-w-0">
		<p class="text-small text-muted-foreground">Assigned committee</p>
		<p class="font-medium text-foreground">{seat.committeeHeading}</p>
	</div>

	<div class="min-w-0">
		<p class="text-small text-muted-foreground">{seatHeading}</p>
		<p class="flex items-center gap-2 font-medium text-foreground">
			{seat.seatName}

			<!-- The flag's alt text would only repeat the name before it. -->
			{#if seat.countryCode !== null}
				<span aria-hidden="true" class="flex">
					<Flag countryCode={seat.countryCode} />
				</span>
			{/if}
		</p>
	</div>
</div>
