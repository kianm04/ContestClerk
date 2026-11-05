<script lang="ts">
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import type { PageProps } from './$types';
	import ConferenceFilters from './ConferenceFilters.svelte';
	import ConferenceResults from './ConferenceResults.svelte';
	import ConferencesHero from './ConferencesHero.svelte';

	// `data` is whatever `load` in `+page.server.ts` returned. It is replaced
	// with fresh results every time the URL changes.
	let { data }: PageProps = $props();
</script>

<!-- `PageMeta` writes the `<title>` and the sharing tags, and adds "· MUNMeet". -->
<PageMeta
	title="Conferences"
	description="Find a Model UN conference by country, date or level, and see which ones are taking applications."
	imageUrl={data.shareImageUrl}
/>

<!--
	The layout lets this page run the full width of the window, so the hero's
	picture can reach its right edge. `relative` makes this wrapper the box the
	picture is placed against, and `overflow-hidden` clips the strip of it that
	is lifted above the page (`ConferencesHero.svelte` says why). The inner box,
	which is not positioned, keeps the search box and the results to the width
	of the top bar, as the mockup does.
-->
<div class="relative overflow-hidden">
	<div class="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 pt-8 md:px-6">
		<ConferencesHero />

		<!-- What sits between the tags is the `children` of `ConferenceFilters`. -->
		<ConferenceFilters query={data.query} countries={data.countries}>
			<ConferenceResults rows={data.rows} total={data.total} query={data.query} now={data.now} />
		</ConferenceFilters>
	</div>
</div>
