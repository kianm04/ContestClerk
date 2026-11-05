<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { awardBadge, type CommitteePageAward } from '$lib/awards';

	type Props = {
		/**
		 * The committee's awards this reader may see. The database decides: a
		 * chair or organiser gets every one, anybody else signed in only the
		 * confirmed ones once the conference has published them, and a visitor none.
		 * The page leaves the card out when there is none.
		 */
		awards: CommitteePageAward[];
		/** Whether the conference has published its awards. */
		isPublished: boolean;
	};

	let { awards, isPublished }: Props = $props();

	// What each row draws, worked out again by `$derived` whenever `awards` changes.
	const rows = $derived(
		awards.map((award) => ({
			award,
			seatLine: award.holderName ? `${award.seatName} · ${award.holderName}` : award.seatName,
			badge: awardBadge(award.status, isPublished),
			// Only a chair or organiser sees an award that is not published yet,
			// and for them the badge says how far along it is.
			isBadgeShown: !(isPublished && award.status === 'confirmed')
		}))
	);
</script>

<Card>
	<h2 class="font-display text-h2 text-brand-900">Awards</h2>
	<ul class="mt-2 flex flex-col gap-3">
		<!-- The `(row.award.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.award.id)}
			<li class="flex flex-col items-start gap-1">
				<strong class="font-semibold">{row.award.title}</strong>
				<span class="flex flex-wrap items-center gap-2 text-small text-ink-600">
					{#if row.award.countryCode}
						<Flag countryCode={row.award.countryCode} />
					{/if}
					{row.seatLine}
				</span>
				{#if row.isBadgeShown}
					<Badge tone={row.badge.tone} label={row.badge.label} />
				{/if}
			</li>
		{/each}
	</ul>
</Card>
