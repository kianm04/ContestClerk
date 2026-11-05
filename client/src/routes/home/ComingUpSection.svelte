<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { HomeLink } from '$lib/home';
	import type { ConferenceRowData } from '$lib/home-rows';
	import { signedInHomeUrl } from '$lib/urls';
	import ConferenceRow from './ConferenceRow.svelte';
	import ShowAllLink from './ShowAllLink.svelte';

	type Props = {
		/** Every conference but the hero's, as `conferenceRows` in `$lib/home-rows.ts` worded them. */
		rows: ConferenceRowData[];
		/** "Manage" for a reader who helps run a conference; `null` for everyone else. */
		link: HomeLink | null;
		/** How many rows the limit left out; `0` once `?all=conferences` has lifted it. */
		moreCount: number;
		/** Whether any row drawn has a banner, which is whether the thumbnail column exists. */
		hasThumbs: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { rows, link, moreCount, hasThumbs }: Props = $props();

	// "Show all 11" names the whole list: the rows drawn and the ones left out.
	// `$derived` works it out again whenever either changes.
	const totalCount = $derived(rows.length + moreCount);

	// The same page with every conference row: `load` reads `?all=conferences`
	// and lifts the limit.
	const SHOW_ALL_HREF = signedInHomeUrl('conferences');
</script>

<!--
	"Also coming up" on `/home`: the reader's other conferences, running today
	first and then soonest first, each row a door of its own. `?? undefined`
	turns "no title link" from the `null` the page uses into the `undefined`
	`ManageSection` expects.
-->
<ManageSection title="Also coming up" link={link ?? undefined}>
	<ul>
		<!-- The `(row.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.id)}
			<ConferenceRow {row} hasThumb={hasThumbs} />
		{/each}
	</ul>

	{#if moreCount > 0}
		<ShowAllLink count={totalCount} href={SHOW_ALL_HREF} />
	{/if}
</ManageSection>
