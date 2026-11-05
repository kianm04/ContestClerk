<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import Section from '$lib/components/Section.svelte';
	import type { ResourceFile } from '$lib/documents';
	import PublicResourceRow from './PublicResourceRow.svelte';

	type Props = {
		/**
		 * The conference's own resources, already carrying a one-minute signed
		 * download link apiece. `$lib/documents.ts` is not under `$lib/server`, so
		 * this component can import its `ResourceFile` type directly rather than
		 * writing out its own copy of the shape.
		 */
		resources: ResourceFile[];
	};

	let { resources }: Props = $props();
</script>

<!--
	Nothing at all when there is nothing to show: `05-pages/public/conference.md`
	hides this section rather than drawing it empty, the same choice
	`TeamList.svelte` makes for an empty team.
-->
{#if resources.length > 0}
	<Section title="Resources" icon={FileText}>
		<ul class="divide-y divide-line">
			<!-- `(resource.id)` lets Svelte reuse each row instead of rebuilding it. -->
			{#each resources as resource (resource.id)}
				<li>
					<PublicResourceRow {resource} />
				</li>
			{/each}
		</ul>
	</Section>
{/if}
