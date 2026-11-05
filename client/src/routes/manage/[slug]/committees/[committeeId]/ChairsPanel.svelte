<script lang="ts">
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import {
		chairsAfterPresses,
		describeChairRemovalFailure,
		expectChairRemoved
	} from '$lib/committee-editor-presses';
	import type { CommitteeChair } from '$lib/committees';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { chairPickerOptions, type ChairStaffMember, type PendingChairInvite } from '$lib/team';
	import AddChairForm from './AddChairForm.svelte';
	import ChairList from './ChairList.svelte';
	import ChairYourselfForm from './ChairYourselfForm.svelte';
	import InviteChairForm from './InviteChairForm.svelte';
	import PendingChairInvites from './PendingChairInvites.svelte';

	/** What the last "Invite a chair" press answered: the address, and a refusal or a link. */
	type ChairInviteAnswer = { email: string; error: string | null; link: string | null };

	type Props = {
		/** Who chairs this committee now, sorted by name. */
		chairs: CommitteeChair[];
		/** The chairs the reader ranks above, or all of them for an administrator: the ones "Remove" is shown for. */
		removableChairIds: string[];
		/** The chair staff the reader may make a chair: those ranked below them, or everybody for an administrator. */
		chairStaff: ChairStaffMember[];
		/** This committee's chair invitations nobody has accepted yet. */
		pendingInvites: PendingChairInvite[];
		/** The signed-in reader, whom "Chair it yourself" adds. */
		readerUserId: string;
		/** Whether the reader may chair a committee themselves, which only an administrator may. */
		mayChairYourself: boolean;
		/** Where this site lives, for the full invitation links. */
		origin: string;
		/** What "Invite a chair" last answered, or `null` when it was not the last form sent. */
		chairInvite: ChairInviteAnswer | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		chairs,
		removableChairIds,
		chairStaff,
		pendingInvites,
		readerUserId,
		mayChairYourself,
		origin,
		chairInvite
	}: Props = $props();

	/*
		One instant form for every "Remove" button in `ChairList`
		(`$lib/instant-form.svelte.ts`): the chair leaves the list the moment it
		is pressed, and a refused press puts them back with a toast (T142).
		Without JavaScript each still posts and reloads the page as before.
	*/
	const removeChairForm = createInstantForm<string>({
		describeFailure: describeChairRemovalFailure
	});

	function expectPress(input: InstantSubmitInput): string | null {
		return expectChairRemoved(input, chairs);
	}

	const submitRemoval = removeChairForm.submitExpecting(expectPress);

	/*
		`$derived` works these out again whenever the lists or the presses change.
		`shownChairs` is the loaded chairs without the ones a press is removing.
		The picker offers the conference's chair staff minus the people who
		already chair this committee, and "Chair it yourself" is offered to an
		administrator who is not one of them (T175, security review L5). A
		refused invitation keeps what was typed; one that worked empties the box.
	*/
	const shownChairs = $derived(chairsAfterPresses(chairs, removeChairForm.presses));
	const chairUserIds = $derived(shownChairs.map((chair) => chair.userId));
	const pickerOptions = $derived(chairPickerOptions(chairStaff, chairUserIds));
	const canChairYourself = $derived(mayChairYourself && !chairUserIds.includes(readerUserId));
	const isEmpty = $derived(shownChairs.length === 0 && pendingInvites.length === 0);
	const typedEmail = $derived(chairInvite?.error ? chairInvite.email : '');
</script>

<FormSection title="Chairs" description="Chairs run the room and propose awards.">
	<!-- The forms below are always there, so the empty line never says that
		nobody can be added. -->
	{#if isEmpty}
		<p class="text-dense text-muted-foreground">
			{canChairYourself
				? 'No chairs yet. Invite somebody by email, or chair it yourself.'
				: 'No chairs yet. Invite somebody by email.'}
		</p>
	{/if}

	{#if shownChairs.length > 0}
		<ChairList chairs={shownChairs} {removableChairIds} onRemove={submitRemoval} />
	{/if}

	{#if pendingInvites.length > 0}
		<PendingChairInvites invites={pendingInvites} {origin} />
	{/if}

	<!-- The two ways to add a chair sit side by side when there is room, and
		`flex-wrap` stacks them on a phone. -->
	<div class="flex flex-wrap items-start gap-4">
		<InviteChairForm
			email={typedEmail}
			error={chairInvite?.error ?? null}
			link={chairInvite?.link ?? null}
			linkEmail={chairInvite?.email ?? ''}
		/>

		{#if pickerOptions.length > 0}
			<AddChairForm {pickerOptions} />
		{/if}
	</div>

	{#if pickerOptions.length === 0 && shownChairs.length > 0}
		<p class="text-small text-muted-foreground">
			Everybody you can make a chair already chairs this committee.
		</p>
	{/if}

	{#if canChairYourself}
		<ChairYourselfForm />
	{/if}
</FormSection>
