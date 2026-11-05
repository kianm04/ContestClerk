<script lang="ts">
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import ManageSection, { type SectionLink } from '$lib/components/manage/ManageSection.svelte';
	import type { CommitteeRow } from '$lib/dashboard-committees';
	import { chairRoomUrl, manageAllocationUrl, manageCommitteesUrl } from '$lib/urls';
	import CommitteeTable from './CommitteeTable.svelte';

	type Props = {
		committees: CommitteeRow[];
		/**
		 * While applications are taken the committees are a short list beside
		 * "Waiting for a decision"; once seats are given they are a table with
		 * their papers, linked to Allocation.
		 */
		phase: 'applications' | 'allocation';
		/** Whether the conference asks for position papers. Only the allocation table reads it. */
		hasPapers?: boolean;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { committees, phase, hasPapers = false, conferenceSlug }: Props = $props();

	// `$derived` works these out again if the phase changes.
	const isTable = $derived(phase === 'allocation');
	const link: SectionLink = $derived(
		isTable
			? { label: 'Allocation', href: manageAllocationUrl(conferenceSlug) }
			: { label: 'Committees', href: manageCommitteesUrl(conferenceSlug) }
	);
</script>

<!--
	Every committee with its seats and chair, and the way into its chair room,
	which is open on every day so a chair can try it before the conference.
-->
<ManageSection title="Committees" {link}>
	{#if isTable}
		<div class="hidden md:block">
			<CommitteeTable {committees} {hasPapers} {conferenceSlug} />
		</div>
	{/if}

	<!-- The short list: always on a phone, and on a computer while applications are taken. -->
	<ul class={isTable ? 'md:hidden' : ''}>
		<!-- The `(committee.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each committees as committee (committee.id)}
			<ActionRow title={committee.listTitle} detail={committee.listDetail}>
				<a
					href={chairRoomUrl(conferenceSlug, committee.slug)}
					class="font-medium text-link hover:underline">Open chair room</a
				>
			</ActionRow>
		{/each}
	</ul>

	<p class="mt-3 text-small text-muted-foreground">
		Try the room before the day: a practice session does not count as Session 1.
	</p>
</ManageSection>
