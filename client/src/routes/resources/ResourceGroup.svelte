<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import type { ResourceConferenceGroup } from '$lib/resources';
	import ResourceRow from './ResourceRow.svelte';

	type Props = {
		/** One conference and the files `/resources` lists under it. */
		group: ResourceConferenceGroup;
	};

	let { group }: Props = $props();
</script>

<!--
	The conference's logo sits beside its name in the section's header, with
	`Avatar` falling back to the conference's initials the way it does
	everywhere else in the app.
-->
<Section
	title={group.conferenceName}
	logo={{ name: group.conferenceName, imagePath: group.conferenceLogoPath }}
>
	<div class="divide-y divide-line">
		<!-- `(resource.id)` lets Svelte reuse each row instead of rebuilding it. -->
		{#each group.resources as resource (resource.id)}
			<ResourceRow {resource} />
		{/each}
	</div>
</Section>
