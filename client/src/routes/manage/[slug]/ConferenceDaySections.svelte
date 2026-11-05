<script lang="ts">
	import type { AttentionItem } from '$lib/dashboard-attention';
	import type { ConferenceDaySections } from '$lib/dashboard-sections';
	import ConferenceDayPanel from './ConferenceDayPanel.svelte';
	import DashboardColumn from './DashboardColumn.svelte';
	import DashboardColumns from './DashboardColumns.svelte';
	import NeedsYou from './NeedsYou.svelte';
	import RoomsSection from './RoomsSection.svelte';
	import TodayList from './TodayList.svelte';

	type Props = {
		/** What `dashboardSections` wrote for a conference day. */
		sections: ConferenceDaySections;
		/** The heading of "Needs you", from `attentionTitle`. */
		attentionTitle: string;
		/** What `dashboardAttention` found waiting. */
		attention: AttentionItem[];
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { sections, attentionTitle, attention, conferenceSlug }: Props = $props();
</script>

<!--
	On a conference day the rooms come first, so "Needs you" moves beside the
	programme. The panel holds the page's one filled button, so no line of
	"Needs you" is filled.
-->
<div class="flex flex-col gap-9">
	<ConferenceDayPanel
		panel={sections.panel}
		mayPostAnnouncement={sections.mayPostAnnouncement}
		{conferenceSlug}
	/>

	<RoomsSection rooms={sections.rooms} total={sections.roomsTotal} {conferenceSlug} />

	<DashboardColumns>
		<!-- `null` for a reader who may not open the programme. -->
		{#if sections.today}
			<DashboardColumn isWide>
				<TodayList rows={sections.today} {conferenceSlug} />
			</DashboardColumn>
		{/if}

		<DashboardColumn>
			<NeedsYou title={attentionTitle} items={attention} isFirstPrimary={false} />
		</DashboardColumn>
	</DashboardColumns>
</div>
