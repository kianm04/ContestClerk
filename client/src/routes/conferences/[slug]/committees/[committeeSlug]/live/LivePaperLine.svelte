<script lang="ts">
	import { livePaperLine, type RoomPaperVote } from '$lib/paper-votes';
	import { floorPaperText, type FloorPaper } from '$lib/papers-on-floor';
	import type { RoomScreen } from '$lib/room-screen';
	import { committeePaperUrl } from '$lib/urls';

	type Props = {
		/** The screen the room is on, which decides whether the line shows. */
		screen: RoomScreen;
		/** What the line reads from the room: the paper on the projector, the vote's paper, and where its page is. */
		room: {
			displayedPaper: FloorPaper | null;
			votedPaper: RoomPaperVote | null;
			conference: { slug: string };
			committee: { slug: string };
		};
	};

	let { screen, room }: Props = $props();

	// The projector shows the paper in place of the floor and the Unmod clock, and
	// the vote's own paper while the vote has the screen (`$lib/paper-votes.ts`).
	const line = $derived(livePaperLine(screen, room.displayedPaper, room.votedPaper));
</script>

<!--
	One line under the floor naming the paper the room is busy with, so a
	delegate can open its words on their phone: "On screen · Working paper 1.1 ·
	Lethal autonomous weapons", or "Voting on" and then "Voted on" a draft
	resolution. The link goes to the paper's reading page. Nothing at all while
	the room is busy with no paper.
-->
{#if line}
	<p class="mt-3 flex min-h-11 flex-wrap items-center gap-x-2 text-small">
		<span class="text-muted-foreground">{line.word}</span>
		<a
			href={committeePaperUrl(room.conference.slug, room.committee.slug, line.paper.id)}
			class="font-medium text-link hover:underline">{floorPaperText(line.paper)}</a
		>
	</p>
{/if}
