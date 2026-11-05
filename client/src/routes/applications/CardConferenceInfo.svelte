<script lang="ts">
	import type { ApplicationCard } from '$lib/application-cards';
	import DateRange from '$lib/components/DateRange.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import StatusBadge from './StatusBadge.svelte';

	type Props = {
		card: ApplicationCard;
	};

	let { card }: Props = $props();
</script>

<!-- The conference beside the card's picture: which one, where, when, and the status. -->
<div class="flex min-w-0 flex-col gap-1">
	<h2 class="font-display text-h2 text-foreground">{card.conference.name}</h2>

	<div class="flex flex-col text-small text-muted-foreground">
		{#if card.conference.place !== null}
			<!--
				The place and its flag share one line, so that when a long place wraps
				onto a second line the flag follows its last word. The flag's own alt
				text is the country's name, which the line has just said, so a screen
				reader skips the flag (`aria-hidden`).
			-->
			<p>
				{card.conference.place}

				{#if card.conference.countryCode !== null}
					<span aria-hidden="true" class="ml-1.5 inline-flex align-middle">
						<Flag countryCode={card.conference.countryCode} />
					</span>
				{/if}
			</p>
		{/if}

		<p class="tabular-nums">
			<DateRange startDate={card.conference.startDate} endDate={card.conference.endDate} />
		</p>
	</div>

	<div class="mt-2">
		<StatusBadge label={card.status.label} tone={card.status.tone} />
	</div>
</div>
