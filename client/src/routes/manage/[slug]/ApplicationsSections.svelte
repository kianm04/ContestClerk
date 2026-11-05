<script lang="ts">
	import type { ApplicationsSections } from '$lib/dashboard-sections';
	import DashboardColumn from './DashboardColumn.svelte';
	import DashboardColumns from './DashboardColumns.svelte';
	import DashboardCommittees from './DashboardCommittees.svelte';
	import WaitingForDecision from './WaitingForDecision.svelte';

	type Props = {
		/** What `dashboardSections` wrote for this phase. */
		sections: ApplicationsSections;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { sections, conferenceSlug }: Props = $props();
</script>

<!--
	While applications are taken: the newest ones to answer, beside the
	committees they fill. A section is `null` for a reader who may not open its
	page, and is then left out.
-->
<DashboardColumns>
	{#if sections.waiting}
		<DashboardColumn isWide>
			<WaitingForDecision rows={sections.waiting} {conferenceSlug} />
		</DashboardColumn>
	{/if}

	{#if sections.committees}
		<DashboardColumn>
			<DashboardCommittees committees={sections.committees} phase="applications" {conferenceSlug} />
		</DashboardColumn>
	{/if}
</DashboardColumns>
