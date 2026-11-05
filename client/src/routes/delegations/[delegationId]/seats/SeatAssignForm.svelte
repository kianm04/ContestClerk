<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import PersonRow from '$lib/components/PersonRow.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import {
		UNASSIGN_SEAT_CONFIRM_TEXT,
		emptySeatSentence,
		memberFieldName,
		unassignSeatConfirmTitle,
		unseatedMemberOptionLabel,
		type DelegationSeat,
		type UnseatedMember
	} from '$lib/delegations';
	import { unassignDelegationSeatUrl } from '$lib/urls';

	type Props = {
		/** Which delegation the seat belongs to. The Unassign button's address needs it. */
		delegationId: string;
		seat: DelegationSeat;
		/** Everybody in the delegation with no seat yet: what the dropdown offers. */
		unseatedMembers: UnseatedMember[];
		/** The reader's own id, so the dropdown marks their own name "(you)". */
		myUserId: string;
		/** False from the conference's first day, when only organisers may still move people. */
		canChangeSeats: boolean;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`), which both
		 * buttons are sent through: the seat fills or empties the moment it is
		 * pressed, with no spinner.
		 */
		onSubmit: SubmitFunction;
	};

	let { delegationId, seat, unseatedMembers, myUserId, canChangeSeats, onSubmit }: Props = $props();

	// `$derived` works each of these out again whenever the props change.
	const memberOptions = $derived(
		unseatedMembers.map((member) => ({
			value: member.userId,
			label: unseatedMemberOptionLabel(member, myUserId)
		}))
	);
	const canAssign = $derived(canChangeSeats && unseatedMembers.length > 0);
	const sentenceForEmptySeat = $derived(emptySeatSentence(canChangeSeats));
</script>

{#if seat.holder}
	<PersonRow name={seat.holder.fullName} imagePath={seat.holder.avatarPath}>
		{#if canChangeSeats}
			<ConfirmButton
				label="Unassign"
				variant="danger"
				confirmTitle={unassignSeatConfirmTitle(seat.holder.fullName)}
				confirmText={UNASSIGN_SEAT_CONFIRM_TEXT}
				formaction={unassignDelegationSeatUrl(delegationId, seat.id)}
				{onSubmit}
			/>
		{/if}
	</PersonRow>
{:else if canAssign}
	<!--
		A real form with a real action, so it works with JavaScript switched off.
		With JavaScript, `use:enhance` hands it to the page's instant form, and
		once pressed the seat shows its new holder, which replaces this form.
		The dropdown's `name` carries the seat id because `SelectField` builds the
		`<select>`'s `id` out of its `name`, and this page draws one dropdown per
		seat: with a plain `userId` every one of them would share an `id`, and
		clicking the third seat's label would move the cursor into the first seat's
		dropdown. `memberFieldName` is where that rule is written, and the form
		action reads the value back under the same name.
	-->
	<form
		method="post"
		action="?/assign"
		class="flex flex-wrap items-end gap-2"
		use:enhance={onSubmit}
	>
		<input type="hidden" name="seatId" value={seat.id} />

		<SelectField
			label="Member"
			name={memberFieldName(seat.id)}
			value=""
			options={memberOptions}
			placeholder="Choose member"
			isRequired
		/>

		<Button label="Assign" variant="primary" />
	</form>
{:else}
	<p class="text-small text-ink-600">{sentenceForEmptySeat}</p>
{/if}
