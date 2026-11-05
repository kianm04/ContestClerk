<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { sharedChairForm, type ChairSubmitInput } from '$lib/chair-form';
	import type { ChairPage } from '$lib/live-mode';
	import { focusHeadingAfterPress } from '$lib/room-focus';
	import type { OpeningBandLinks, OpeningRollCall } from '$lib/room-opening';
	import { setAgendaPress } from '$lib/room-presses';
	import { sharedRollCallForm } from '$lib/roll-call-preview';
	import OpeningAgendaRow from './OpeningAgendaRow.svelte';
	import OpeningRollCallRow from './OpeningRollCallRow.svelte';

	type Props = {
		/** The session's roll call with its counts (`openingRollCall`), or null before its first. */
		rollCall: OpeningRollCall | null;
		/** The committee's topics, and the one under debate now. */
		topics: string[];
		agendaTopic: string | null;
		/** Where the band's forms post and its links lead (`openingBandLinks`). */
		links: OpeningBandLinks;
		/** This page with the agenda menu open, behind the agenda row's "Change". */
		changeAgendaHref: string;
		/** The page drawing the band, `chair` or `chair/gsl`, where every press comes back to. */
		fromView: ChairPage;
		/** A quick session's chair may add a topic, so a committee with none still has an agenda row. */
		canAddTopic?: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		rollCall,
		topics,
		agendaTopic,
		links,
		changeAgendaHref,
		fromView,
		canAddTopic = false
	}: Props = $props();

	/** The band's heading, where the focus goes once a step ticks off (R12). */
	const HEADING_ID = 'opening-heading';

	// The chair layout's two instant forms (`$lib/chair-form.ts` and
	// `$lib/roll-call-preview.ts`). The page draws the room with the presses
	// still on their way laid on top, so each step ticks off the moment it is
	// pressed, with no spinner.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();

	/** "Mark all present": the roll call row ticks off, and the focus goes to the band's heading. */
	const handleMarkAllPresent: SubmitFunction = (input) => {
		const answer = rollCallForm.submit(input);
		focusHeadingAfterPress([HEADING_ID]);

		return answer;
	};

	/** A topic: it becomes the agenda at once, and the focus goes to the band's heading. */
	function handleTopicPress(input: ChairSubmitInput) {
		focusHeadingAfterPress([HEADING_ID]);

		return setAgendaPress(String(input.formData.get('topic') ?? ''));
	}

	const submitTopic = chairForm.submitExpecting(handleTopicPress);
</script>

<!--
	"Before debate": the slim band above the GSL from the moment a session
	starts until the first speaker is called (`committee-room.md`, "Opening
	band"). Its title on the left, then one row each for the roll call and the
	agenda, a label and its step, on a three-column grid; on a phone the title
	goes above the rows. It blocks nothing: speakers can be added and called
	before either step is done, and no step not yet taken is drawn in a
	warning colour (P4). `tabindex="-1"` lets a script focus the heading.
-->
<section
	aria-labelledby={HEADING_ID}
	class="grid flex-none grid-cols-[120px_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-line px-8 py-3.5 max-[1100px]:px-6 max-md:grid-cols-[auto_minmax(0,1fr)] max-md:px-4"
>
	<h2
		id={HEADING_ID}
		tabindex="-1"
		class="row-span-2 self-start pt-2.5 font-semibold focus:outline-none max-md:col-span-2 max-md:row-span-1 max-md:pt-0"
	>
		Before debate
	</h2>
	<OpeningRollCallRow
		{rollCall}
		markAllPresentAction={links.markAllPresentAction}
		rollCallHref={links.rollCallHref}
		{fromView}
		onSubmit={handleMarkAllPresent}
	/>
	<!--
		A committee with no topics has no agenda to set, so no agenda row, except
		in a quick session, whose row offers "Add a topic" (`chair/quick-session.md`).
	-->
	{#if topics.length > 0 || canAddTopic}
		<OpeningAgendaRow
			{topics}
			{agendaTopic}
			setAgendaAction={links.setAgendaAction}
			{changeAgendaHref}
			onSubmit={submitTopic}
		/>
	{/if}
</section>
