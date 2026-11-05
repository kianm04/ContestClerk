<script lang="ts">
	import type { ApplicationListEntry } from '$lib/applications';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import { myApplicationsUrl } from '$lib/urls';
	import ApplicationRow from './ApplicationRow.svelte';

	type Props = {
		/**
		 * The reader's applications and delegations still waiting for an answer:
		 * draft, submitted, waitlisted or rejected at a conference not yet over,
		 * merged and cut to the section's limit by `loadHomeDashboard`. The page
		 * leaves the section out when there are none.
		 */
		entries: ApplicationListEntry[];
		/** The moment the page was drawn, which decides the line under each name. */
		now: Date;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { entries, now }: Props = $props();
</script>

<!--
	"Applications" on `/home`. "All applications" goes to `/applications`,
	which lists the same two kinds of row without the limit of three.
-->
<ManageSection title="Applications" link={{ label: 'All applications', href: myApplicationsUrl() }}>
	<ul>
		<!-- The `(entry.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each entries as entry (entry.id)}
			<ApplicationRow {entry} {now} />
		{/each}
	</ul>
</ManageSection>
