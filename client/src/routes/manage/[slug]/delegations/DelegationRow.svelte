<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import {
		hasNoAssignedMembers,
		headNamesSentence,
		NO_MEMBERS_ASSIGNED_TEXT,
		type OrganiserDelegationRow
	} from '$lib/delegations';
	import { seatsAssignedText, seatsGivenText } from '$lib/delegation-seat-words';
	import { manageDelegationReviewUrl } from '$lib/urls';

	type Props = {
		/** The delegation this row is about. */
		delegation: OrganiserDelegationRow;
		/** The conference, so the row can link to this delegation's review page. */
		conferenceSlug: string;
	};

	let { delegation, conferenceSlug }: Props = $props();

	/* `$derived` works each of these out again whenever the delegation changes,
	   which is every time `load` runs and hands down new rows. */
	const headNames = $derived(headNamesSentence(delegation.headNames));

	// `resolve()` inside the helper builds the address from the route's own
	// folder name, so a typo in it is a type error rather than a broken link.
	const reviewHref = $derived(manageDelegationReviewUrl(conferenceSlug, delegation.id));

	/*
		An accepted delegation that has been given seats but has seated nobody in
		them is the one thing on this table an organiser has to chase, so it gets
		an orange dot. `hasNoAssignedMembers` says which delegations those are.
	*/
	const isUnassigned = $derived(hasNoAssignedMembers(delegation));

	// The dot is a colour and nothing else, so the same warning is written out in
	// words here and read on hover and by a screen reader.
	const assignedTitle = $derived(isUnassigned ? NO_MEMBERS_ASSIGNED_TEXT : undefined);
</script>

<!--
	No status here: every row of a tab has the same one, and the tab says it.
-->
<tr class="border-b border-border align-top">
	<td class="p-3 text-dense">
		<a href={reviewHref} class="font-medium text-foreground hover:text-link hover:underline">
			{delegation.name}
		</a>

		<p class="flex items-center gap-2 text-small text-muted-foreground">
			{#if delegation.countryCode}
				<Flag countryCode={delegation.countryCode} />
			{/if}
			{delegation.institutionName}
		</p>
	</td>

	<td class="p-3 text-dense text-foreground">{headNames}</td>
	<td class="p-3 text-dense text-foreground tabular-nums">{delegation.memberCount}</td>

	<td class="p-3 text-dense">
		<p class="font-medium text-foreground">{seatsGivenText(delegation.progress)}</p>

		<p class="flex items-center gap-2 text-small text-muted-foreground" title={assignedTitle}>
			{#if isUnassigned}
				<span class="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true"></span>
			{/if}
			{seatsAssignedText(delegation.progress)}
		</p>
	</td>

	<td class="p-3">
		<StatusDot text={delegation.invoice.label} tone={delegation.invoice.tone} />
	</td>

	<td class="p-3 text-right">
		<!-- The same page the name opens, for an organiser reading along the row. -->
		<a
			href={reviewHref}
			class="text-dense font-medium text-link hover:underline"
			aria-label="Open {delegation.name}">Open</a
		>
	</td>
</tr>
