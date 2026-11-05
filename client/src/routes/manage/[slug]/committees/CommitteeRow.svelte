<script lang="ts">
	import DragHandle from '$lib/components/DragHandle.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import {
		COMMITTEE_COLUMNS_CLASS,
		committeeSubline,
		hasNoOpenSeats,
		papersLine
	} from '$lib/committee-list';
	import {
		COMMITTEE_DROP_FORM_ID,
		COMMITTEE_DROP_HINT_ID,
		committeeHeading,
		type ManagedCommittee
	} from '$lib/committees';
	import type { PendingMove } from '$lib/list-move-preview';
	import type { SortableList } from '$lib/sortable-list.svelte';
	import { statusLabel } from '$lib/status';
	import { chairRoomUrl, manageCommitteeUrl } from '$lib/urls';
	import CommitteeCell from './CommitteeCell.svelte';
	import CommitteeChairsCell from './CommitteeChairsCell.svelte';
	import CommitteeGuideCell from './CommitteeGuideCell.svelte';
	import CommitteeMoveForm from './CommitteeMoveForm.svelte';
	import CommitteeRowLink from './CommitteeRowLink.svelte';

	type Props = {
		committee: ManagedCommittee;
		/** The conference's slug, for the links out of this row. */
		conferenceSlug: string;
		/** Where the row stands in the list, counting from 0. The first cannot move up. */
		index: number;
		/** True for the last row, which cannot move down. */
		isLast: boolean;
		/** Whether the handle and the arrows are drawn: a conference-wide editor. */
		isReorderable: boolean;
		/** Whether the reader may run this committee's room, which "Chair room" opens. */
		mayOpenRoom: boolean;
		/** The list's dragging helper, which the row's drag handle reports to. */
		sortable: SortableList;
		/** While a drop is being saved, so no row can be picked up yet. */
		isSaving: boolean;
		/** Tells the list which row is moving which way, the moment the press is sent. */
		onMoveSend: (move: PendingMove | null) => void;
		/** Tells the list the server has answered, so it can drop the guess. */
		onMoveSettle: () => void;
	};

	let {
		committee,
		conferenceSlug,
		index,
		isLast,
		isReorderable,
		mayOpenRoom,
		sortable,
		isSaving,
		onMoveSend,
		onMoveSettle
	}: Props = $props();

	/*
		`$derived` works each of these out again whenever `committee` changes,
		which is what redraws a row once it has been moved. `shortName` is what
		the handle and the arrows are called, so a screen reader says "Move UNSC
		up" rather than reading the committee's full name over again.
	*/
	const shortName = $derived(committeeHeading(committee));
	const subline = $derived(committeeSubline(committee));
	const papers = $derived(papersLine(committee));
	const editorUrl = $derived(manageCommitteeUrl(conferenceSlug, committee.id));
</script>

<!--
	A grid of two columns on a phone, the handle and the rest stacked beside
	it, and of the table's eight columns from `xl` up, shared with the
	headings above the list (`$lib/committee-list.ts`).
-->
<div
	class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-border py-3 text-dense text-foreground xl:items-center xl:gap-0 xl:py-0 {COMMITTEE_COLUMNS_CLASS}"
>
	<!--
		The handle belongs to the list's hidden drop form, so it sits outside the
		arrows' form. On a phone it runs down beside all five lines of the row,
		so its height does not push the facts away from the name.
	-->
	<div class="row-span-5 flex items-center gap-1 self-start xl:row-span-1 xl:self-auto">
		{#if isReorderable}
			<DragHandle
				{sortable}
				row={{ id: committee.id, index, name: shortName }}
				hintId={COMMITTEE_DROP_HINT_ID}
				form={COMMITTEE_DROP_FORM_ID}
				isDisabled={isSaving}
			/>
			<CommitteeMoveForm
				committeeId={committee.id}
				{shortName}
				isFirst={index === 0}
				{isLast}
				{onMoveSend}
				{onMoveSettle}
			/>
		{/if}
	</div>

	<div class="min-w-0 xl:p-3">
		<h2 class="font-medium">{committee.name}</h2>
		{#if subline}
			<p class="text-small text-muted-foreground">{subline}</p>
		{/if}
		<!-- The publish checklist will not publish until every committee has a seat on offer. -->
		{#if hasNoOpenSeats(committee)}
			<StatusDot text="No seats" tone="warning" />
		{/if}
	</div>

	<!--
		On a phone these three share one line under the name. `xl:contents`
		makes this box itself disappear from `xl` up, so that each of the three
		takes a column of the table of its own.
	-->
	<div class="col-start-2 flex flex-wrap gap-x-4 xl:contents">
		<CommitteeCell>{statusLabel('experience_level', committee.level)}</CommitteeCell>
		<CommitteeCell label="Topics:" isNumber>{committee.topics.length}</CommitteeCell>
		<CommitteeCell label="Seats:" isNumber>{committee.seatCounts.total}</CommitteeCell>
	</div>

	<CommitteeChairsCell
		chairNames={committee.chairNames}
		committeeName={committee.name}
		{editorUrl}
	/>
	<CommitteeGuideCell hasBackgroundGuide={committee.hasBackgroundGuide} {papers} />

	<!-- "Chair room" opens the room on any day (T171), named by the slug, not the id. -->
	<CommitteeCell>
		<!-- Side by side on a phone, one above the other in the table's narrow last column. -->
		<div class="flex flex-wrap gap-x-4 xl:flex-col">
			<CommitteeRowLink href={editorUrl} label="Edit" accessibleName="Edit {committee.name}" />
			{#if mayOpenRoom}
				<CommitteeRowLink
					href={chairRoomUrl(conferenceSlug, committee.slug)}
					label="Chair room"
					accessibleName="Open chair room of {committee.name}"
				/>
			{/if}
		</div>
	</CommitteeCell>
</div>
