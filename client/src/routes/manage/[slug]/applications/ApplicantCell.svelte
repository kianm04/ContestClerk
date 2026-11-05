<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Flag from '$lib/components/Flag.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { ListedApplicationStatus, OrganiserApplicationRow } from '$lib/applications';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		/** The application this cell names. */
		application: OrganiserApplicationRow;
		/** Its review page, carrying the table's query so Previous and Next walk this queue. */
		reviewHref: ResolvedPathname;
		/** The same list with this application in the review panel beside it. */
		panelHref: ResolvedPathname;
		/** True while the review panel is beside the table, which takes the status cell away. */
		hasReviewPanel: boolean;
		/** True when this is the application the panel is showing. */
		isInReviewPanel: boolean;
		/** The tab on screen, so a row whose status has just changed can say so. */
		tabStatus: ListedApplicationStatus;
	};

	let { application, reviewHref, panelHref, hasReviewPanel, isInReviewPanel, tabStatus }: Props =
		$props();

	/* `$derived` works each of these out again whenever the application changes,
	   which is after every action on this page. */
	const statusTone = $derived(statusBadgeTone('application_status', application.status));
	const statusText = $derived(statusLabel('application_status', application.status));

	// A press that changes the status shows at once, before the row leaves the tab.
	const hasLeftTab = $derived(application.status !== tabStatus);
	const hasStatusLine = $derived(hasReviewPanel && (hasLeftTab || application.seatLabel !== null));
</script>

<td class="p-3 text-dense">
	<!-- A thin blue bar from `xl` up marks the row the panel is showing. -->
	<div class="-ml-2.5 border-l-2 border-transparent pl-2 {isInReviewPanel ? 'xl:border-ring' : ''}">
		<!--
			Two links, and the screen width decides which one is drawn. Below `xl`
			there is no room for the panel, so the name opens the review page; from
			`xl` up it opens this application in the panel beside the table.
		-->
		<a
			href={reviewHref}
			class="font-medium text-foreground hover:text-link hover:underline xl:hidden"
		>
			{application.applicantName}
		</a>
		<a
			href={panelHref}
			aria-current={isInReviewPanel ? 'true' : undefined}
			class="hidden font-medium text-foreground hover:text-link hover:underline xl:inline"
		>
			{application.applicantName}
		</a>

		<p class="flex items-center gap-2 text-small text-muted-foreground">
			{#if application.countryCode}
				<Flag countryCode={application.countryCode} />
			{/if}
			{application.institutionName ?? '—'}
		</p>

		<!-- From `xl` up the panel takes the status cell's place, so its news moves here. -->
		{#if hasStatusLine}
			<div class="mt-0.5 hidden items-center gap-2 text-small text-muted-foreground xl:flex">
				{#if hasLeftTab}
					<StatusDot text={statusText} tone={statusTone} />
				{/if}
				{application.seatLabel ?? ''}
			</div>
		{/if}
	</div>
</td>
