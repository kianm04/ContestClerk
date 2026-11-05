<script lang="ts">
	import type { AllocationSections } from '$lib/dashboard-sections';
	import BeforeFirstDay from './BeforeFirstDay.svelte';
	import DashboardColumn from './DashboardColumn.svelte';
	import DashboardColumns from './DashboardColumns.svelte';
	import DashboardCommittees from './DashboardCommittees.svelte';

	type Props = {
		/** What `dashboardSections` wrote for this phase. */
		sections: AllocationSections;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { sections, conferenceSlug }: Props = $props();
</script>

<!--
	While seats are given: how full each committee is, beside what is left
	before the first day. The committees are `null` for a reader who may not
	open the allocation grid, and are then left out.
-->
<DashboardColumns>
	{#if sections.committees}
		<DashboardColumn isWide>
			<DashboardCommittees
				committees={sections.committees}
				phase="allocation"
				hasPapers={sections.hasPapers}
				{conferenceSlug}
			/>
		</DashboardColumn>
	{/if}

	<DashboardColumn>
		<BeforeFirstDay items={sections.preparation} />
	</DashboardColumn>
</DashboardColumns>
