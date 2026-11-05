<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { paperStatusLabel, type PaperStatus } from '$lib/documents';
	import {
		chairRoomUrl,
		committeeLiveUrl,
		committeePapersUrl,
		crisisDeskUrl,
		manageCommitteeUrl,
		positionPaperUrl
	} from '$lib/urls';

	type Props = {
		conferenceSlug: string;
		committeeId: string;
		committeeSlug: string;
		/** "Resolutions", or "Directives" in a crisis committee: the link to the papers its delegates write. */
		papersTitle: string;
		/** The id of the reader's own seat in this committee, or `null` when they hold none. */
		mySeatId: string | null;
		/** Whether this conference asks delegates for a position paper at all. */
		positionPaperRequired: boolean;
		/** Where the reader's own paper stands, or `null` when they hold no seat to have one. */
		myPaperStatus: PaperStatus | null;
		/** Whether the reader chairs this committee, or runs its conference, and so may open the chair room. */
		isChair: boolean;
		/** Whether the reader runs this conference, and so may open its editor. */
		canManage: boolean;
		/** Whether the reader answers this crisis committee's directives, and so may open the crisis staff's page. */
		isCrisisStaff: boolean;
	};

	let {
		conferenceSlug,
		committeeId,
		committeeSlug,
		papersTitle,
		mySeatId,
		positionPaperRequired,
		myPaperStatus,
		isChair,
		canManage,
		isCrisisStaff
	}: Props = $props();

	// "05-pages/public/committee.md" has the link read "Position paper · Approved" and
	// so on once the reader has something to report, and just "Position paper" before that.
	const positionPaperLabel = $derived(
		myPaperStatus ? `Position paper · ${paperStatusLabel(myPaperStatus)}` : 'Position paper'
	);

	const showsPositionPaperLink = $derived(mySeatId !== null && positionPaperRequired);
	// Everybody the live view lets in may follow the room: its delegates, its
	// chair and the conference's organisers. The committee's papers let in the
	// same people, so the two links come and go together.
	const showsLiveRoomLink = $derived(mySeatId !== null || isChair || canManage);

	// One filled button per row (T171). A reader who may chair came for the chair
	// room, and the crisis staff for the directives, so the live room steps back
	// to an outlined button for them.
	const liveRoomVariant = $derived(isChair || isCrisisStaff ? 'secondary' : 'primary');
</script>

<!--
	The role links `05-pages/public/committee.md` asks for: the chair room
	(T41), the live room (T47), a delegate's own position paper (T37) and the
	organiser's editor (T21), with the committee's papers
	(`docs/committee-papers.md`, section 6) beside the live room. A reader who
	may open none of them sees no row. "Open chair room" comes first and is the
	filled one for a reader who may chair. The crisis staff of a crisis
	committee answer its directives from "Answer directives".
-->
{#if showsLiveRoomLink || isCrisisStaff}
	<div class="flex flex-wrap gap-3">
		{#if isChair}
			<Button
				label="Open chair room"
				variant="primary"
				href={chairRoomUrl(conferenceSlug, committeeSlug)}
			/>
		{/if}

		{#if isCrisisStaff}
			<Button
				label="Answer directives"
				variant={isChair ? 'secondary' : 'primary'}
				href={crisisDeskUrl(conferenceSlug, committeeSlug)}
			/>
		{/if}

		{#if showsLiveRoomLink}
			<Button
				label="Open live room"
				variant={liveRoomVariant}
				href={committeeLiveUrl(conferenceSlug, committeeSlug)}
			/>

			<Button
				label={papersTitle}
				variant="secondary"
				href={committeePapersUrl(conferenceSlug, committeeSlug)}
			/>
		{/if}

		{#if showsPositionPaperLink}
			<Button
				label={positionPaperLabel}
				variant="secondary"
				href={positionPaperUrl(conferenceSlug, committeeSlug)}
			/>
		{/if}

		{#if canManage}
			<Button
				label="Edit committee"
				variant="secondary"
				href={manageCommitteeUrl(conferenceSlug, committeeId)}
			/>
		{/if}
	</div>
{/if}
