<script lang="ts">
	import ConferenceCard from '$lib/components/ConferenceCard.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import { EMPTY_CONFERENCE_QUERY, type Conference } from '$lib/conferences';
	import { conferenceListUrl } from '$lib/urls';

	type Props = {
		/**
		 * Up to three conferences open for applications that the reader is not
		 * part of, closing soonest first. Only a reader who organises nothing gets
		 * them; the page leaves the section out otherwise, and when there are none.
		 */
		conferences: Conference[];
		/** The moment the page was drawn, which decides each card's applications pill. */
		now: Date;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { conferences, now }: Props = $props();

	// The third card has room only from `lg` (64rem), where three fit in a row;
	// below that two are shown. Zero-based, so the third card is index 2.
	const THIRD_CARD_INDEX = 2;

	// The directory with only the conferences taking applications, the same list in full.
	const ALL_CONFERENCES_HREF = conferenceListUrl({ ...EMPTY_CONFERENCE_QUERY, openOnly: true });
</script>

<!--
	"Open for applications" on `/home`, always the last section: the directory's
	own cards, three across on a wide screen, two on a tablet, one on a phone.
	`h-full` on each item and card makes a row's cards one height. Nothing sits
	under the grid. The 1rem above it keeps the cards' borders off the title's rule.
-->
<ManageSection
	title="Open for applications"
	link={{ label: 'All conferences', href: ALL_CONFERENCES_HREF }}
>
	<ul class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<!-- The `(conference.id)` key lets Svelte reuse cards instead of rebuilding them. -->
		{#each conferences as conference, index (conference.id)}
			<li class={index >= THIRD_CARD_INDEX ? 'hidden h-full lg:block' : 'h-full'}>
				<ConferenceCard {conference} {now} />
			</li>
		{/each}
	</ul>
</ManageSection>
