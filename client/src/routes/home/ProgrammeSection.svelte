<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { HomeLink } from '$lib/home';
	import type { ProgrammeRowData } from '$lib/home-rows';
	import ProgrammeRow from './ProgrammeRow.svelte';

	type Props = {
		/** "Today's programme" on a conference day, "Programme" otherwise; the page decides. */
		title: string;
		/** "Full schedule", leading to the conference's programme today and to the reader's schedule otherwise. */
		link: HomeLink;
		/**
		 * The events, soonest first, worded by `todayProgrammeRows` or
		 * `programmeRows` in `$lib/home-rows.ts`. The page leaves the section out
		 * when there are none.
		 */
		rows: ProgrammeRowData[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, link, rows }: Props = $props();
</script>

<!--
	The programme (`docs/home.md` section 3.5): what is left of today at the
	conference running now, or the next few events across the reader's
	conferences, as a ruled list of `ProgrammeRow`s under the section's black rule.
-->
<ManageSection {title} {link}>
	<ul>
		<!-- The `(row.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each rows as row (row.id)}
			<ProgrammeRow {row} />
		{/each}
	</ul>
</ManageSection>
