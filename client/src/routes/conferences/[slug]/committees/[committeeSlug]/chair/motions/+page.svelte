<script lang="ts">
	import { roomFrameAfterPresses, sharedChairForm, type ChairSubmitInput } from '$lib/chair-form';
	import { motionViewPress, motionsAfterPresses, proposalPress } from '$lib/motion-presses';
	import { motionRanks, motionToDecide, splitMotions } from '$lib/motions';
	import MotionComposer from './MotionComposer.svelte';
	import MotionLists from './MotionLists.svelte';
	import MotionToDecide from './MotionToDecide.svelte';
	import SessionNotice from './SessionNotice.svelte';
	import SessionRecord from './SessionRecord.svelte';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`. Both run again after every press, when
	// `?motion` or `?session` changes and whenever realtime reports a change in
	// the room. `form` is what `propose` sent back when it refused a motion.
	let { data, form }: PageProps = $props();

	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);

	// The chair layout's shared instant form (`$lib/chair-form.ts`). The floor
	// and the decided list are drawn with its presses on their way laid on top
	// (`$lib/motion-presses.ts`), so a motion recorded, decided, dropped or
	// restored moves the moment its button is pressed.
	const chairForm = sharedChairForm();
	const frame = $derived(roomFrameAfterPresses(data, chairForm.presses));
	const shownMotions = $derived(splitMotions(motionsAfterPresses(data.motions, chairForm.presses)));
	const toDecide = $derived(motionToDecide(shownMotions.proposed, data.requestedMotionId));
	const ranks = $derived(motionRanks(shownMotions.proposed));
	const canAct = $derived(!data.isReadOnly);

	/** What a press of Pass, Fail, Withdraw, "Clear the floor" or Restore will change. */
	function handlePress(input: ChairSubmitInput) {
		const room = {
			floor: shownMotions.proposed,
			presentCount: data.presentCount,
			majority: data.majority,
			committeeState: frame.committeeState,
			currentSession: frame.currentSession
		};

		return motionViewPress(input.action.search, input.formData, room, new Date());
	}

	/** What "Add to floor" will change: the motion on the floor at once. */
	function handleProposal(input: ChairSubmitInput) {
		const facts = {
			seats: data.seats,
			attendance: data.attendance,
			defaultSpeakingSeconds: data.committee.defaultSpeakingTimeSeconds,
			approvedPapers: data.approvedPapers
		};

		return proposalPress(input.formData, facts, new Date());
	}

	const submitPress = chairForm.submitExpecting(handlePress);
	const submitProposal = chairForm.submitExpecting(handleProposal);
</script>

<!--
	The Motions view, edge to edge inside the console: from 861px wide two
	columns, the motion to decide with "Record a motion" across its foot on
	the left, and only lists on the right, each scrolling inside its own
	column when it is long. Narrower, one column in the same order, as tall as
	it needs (`flex-none`), and the console scrolls. `minmax(0, 1fr)` lets the
	left column shrink instead of widening the page.
-->
{#if data.shownSession === null}
	<div class="p-8 max-md:p-4">
		<SessionNotice state="none" {conferenceSlug} {committeeSlug} />
	</div>
{:else}
	<div
		class="grid min-h-0 flex-1 grid-cols-1 max-[860px]:flex-none min-[861px]:grid-cols-[minmax(0,1fr)_clamp(320px,33%,440px)] min-[861px]:grid-rows-[minmax(0,1fr)]"
	>
		<div
			class="flex min-h-0 min-w-0 flex-col overflow-y-auto px-8 pt-7 pb-6 max-[1100px]:px-6 max-[860px]:overflow-visible max-md:px-4 max-md:py-5"
		>
			{#if data.isReadOnly}
				<SessionRecord
					earlierSessions={data.earlierSessions}
					shownSessionId={data.shownSession.id}
					{conferenceSlug}
					{committeeSlug}
				/>
			{:else}
				<MotionToDecide
					{toDecide}
					presentCount={data.presentCount}
					majority={data.majority}
					hasRollCall={data.hasRollCall}
					onSubmit={submitPress}
				/>
			{/if}

			{#if canAct}
				<MotionComposer
					refusedValues={form?.values ?? null}
					refusedErrors={form?.errors ?? null}
					seats={data.seats}
					attendance={data.attendance}
					defaultSpeakingSeconds={data.committee.defaultSpeakingTimeSeconds}
					papers={data.approvedPapers}
					onSubmit={submitProposal}
				/>
			{/if}
		</div>

		<MotionLists
			further={toDecide.further}
			{ranks}
			hasFloor={shownMotions.proposed.length > 0}
			decided={shownMotions.decided}
			{canAct}
			{conferenceSlug}
			{committeeSlug}
			timeZone={data.conference.timezone}
			onSubmit={submitPress}
		/>
	</div>
{/if}
