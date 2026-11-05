<script lang="ts">
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import { NOT_PROVIDED, type ReviewAnswer } from '$lib/application-review';

	type Props = {
		/** The committees the applicant asked for, named, in their own order. */
		preferredCommittees: string[];
		seatPreferences: string | null;
		motivation: string | null;
		/** One per custom question. Empty when the conference asked none. */
		answers: ReviewAnswer[];
	};

	let { preferredCommittees, seatPreferences, motivation, answers }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<div>
		<h3 class="text-label text-ink-600">Committee preferences</h3>
		{#if preferredCommittees.length === 0}
			<p class="text-body">{NOT_PROVIDED}</p>
		{:else}
			<!-- The names are plain strings with no id of their own, so each is keyed by position. -->
			<ol class="list-inside list-decimal text-body">
				{#each preferredCommittees as committeeName, index (index)}
					<li>{committeeName}</li>
				{/each}
			</ol>
		{/if}
	</div>

	<div>
		<h3 class="text-label text-ink-600">Seat preferences</h3>
		<p class="text-body">{seatPreferences ?? NOT_PROVIDED}</p>
	</div>

	{#if motivation}
		<div>
			<h3 class="text-label text-ink-600">Motivation</h3>
			<ParagraphText text={motivation} />
		</div>
	{/if}

	<!-- A conference that asked no questions of its own has no answers to show. -->
	{#each answers as answer (answer.questionId)}
		<div>
			<h3 class="text-label text-ink-600">{answer.label}</h3>
			{#if answer.isLong}
				<ParagraphText text={answer.value} />
			{:else}
				<p class="text-body">{answer.value}</p>
			{/if}
		</div>
	{/each}
</div>
