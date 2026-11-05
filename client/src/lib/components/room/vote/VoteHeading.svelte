<script lang="ts">
	import { voteMeta } from '$lib/vote-view';
	import type { SessionVote } from '$lib/votes';

	type Props = {
		/** The vote the view is on. */
		vote: Pick<SessionVote, 'subject' | 'kind' | 'majority' | 'method'>;
		/** "● Vote open" or "Vote closed" at the right, or nothing (a roll call vote's list). */
		mark: 'open' | 'closed' | null;
		/** The `id` its words can be found by, which the region around it is named with. */
		headingId: string;
	};

	let { vote, mark, headingId }: Props = $props();
</script>

<!--
	The heading of an open or closed vote: the subject, then quieter
	"· substantive · simple majority", and at the right whether the vote is
	still open. The console's `<h1>` is the committee's name in the top bar,
	so a view's own titles are `<h2>`.
-->
<header class="flex items-baseline justify-between gap-4">
	<h2 id={headingId} class="min-w-0 text-h3 break-words">
		{vote.subject}
		<span class="font-normal text-ink-600">· {voteMeta(vote)}</span>
	</h2>
	{#if mark === 'open'}
		<span class="inline-flex items-center gap-2 text-small whitespace-nowrap text-ink-600">
			<span aria-hidden="true" class="size-2 rounded-full bg-brand-500"></span>
			Vote open
		</span>
	{:else if mark === 'closed'}
		<span class="text-small whitespace-nowrap text-ink-600">Vote closed</span>
	{/if}
</header>
