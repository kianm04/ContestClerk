<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { ConferenceListSection } from '$lib/manage-list';
	import ConferenceRow from './ConferenceRow.svelte';

	type Props = {
		/** One organisation's conferences, from `conferenceListSections` in `$lib/manage-list.ts`. */
		section: ConferenceListSection;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { section }: Props = $props();
</script>

<!-- "Coming up", or the organisation's name, with the link to the other view beside it. -->
<ManageSection title={section.title} link={section.link}>
	{#if section.rows.length === 0}
		<p class="border-b border-border px-1 py-5 text-dense text-muted-foreground">
			{section.emptyText}
		</p>
	{:else}
		<!-- An ordered list, because the rows are in date order. -->
		<ol>
			<!-- The `(row.id)` key lets Svelte reuse rows instead of rebuilding them. -->
			{#each section.rows as row (row.id)}
				<ConferenceRow {row} />
			{/each}
		</ol>
	{/if}

	<!--
		Said once under the list rather than on each row: somebody in the
		organisation meets these conferences named but not linked, and this is
		what to do about it instead of meeting a 404.
	-->
	{#if section.hasOffTeamRows}
		<p class="mt-3 max-w-[42rem] text-small text-muted-foreground">
			A conference opens for you once its team gives you a role. Ask its organiser to invite you.
		</p>
	{/if}
</ManageSection>
