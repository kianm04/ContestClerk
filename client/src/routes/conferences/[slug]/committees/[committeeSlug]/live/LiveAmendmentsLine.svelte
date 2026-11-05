<script lang="ts">
	import { amendmentToAnswerText } from '$lib/paper-amendments';
	import { paperAmendmentUrl } from '$lib/urls';

	type Props = {
		/** The amendments the reader's seat has still to answer as a sponsor, first first. */
		waiting: {
			sequence: number;
			paper: { id: string; topicNumber: number | null; sequence: number | null };
		}[];
		room: { conference: { slug: string }; committee: { slug: string } };
	};

	let { waiting, room }: Props = $props();
</script>

<!--
	A quiet line for a sponsor while an amendment to their draft waits for
	their answer: "Waiting for you · Amendment 3 to Draft resolution 1.1".
	Each links to the amendment's card on the draft, where they answer.
	Nothing at all while nothing waits.
-->
{#if waiting.length > 0}
	<p class="mt-3 flex min-h-11 flex-wrap items-center gap-x-2 text-small">
		<span class="text-muted-foreground">Waiting for you</span>
		<!-- An amendment's number is only unique on its draft, so the key names both. -->
		{#each waiting as amendment (`${amendment.paper.id}-${amendment.sequence}`)}
			<a
				href={paperAmendmentUrl(
					room.conference.slug,
					room.committee.slug,
					amendment.paper.id,
					amendment.sequence
				)}
				class="font-medium text-link hover:underline">{amendmentToAnswerText(amendment)}</a
			>
		{/each}
	</p>
{/if}
