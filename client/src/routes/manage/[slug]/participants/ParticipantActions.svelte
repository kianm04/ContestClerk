<script lang="ts">
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Dropdown, { type DropdownItem } from '$lib/components/Dropdown.svelte';
	import type { ParticipantListView } from '$lib/participant-access';
	import { participantLinks } from '$lib/participant-links';
	import type { Participant } from '$lib/participants';

	type Props = {
		participant: Participant;
		view: ParticipantListView;
		/** A menu in the table; a row of buttons on a phone card, which has room for them. */
		isMenu: boolean;
	};

	let { participant, view, isMenu }: Props = $props();

	// `$derived` works the links out again whenever the participant changes.
	const links: DropdownItem[] = $derived(
		participantLinks(view.conferenceSlug, participant, view.permissions)
	);
</script>

<div class="flex flex-wrap items-center gap-2 md:flex-nowrap">
	{#if isMenu && links.length > 0}
		<Dropdown
			label="Actions for {participant.fullName}"
			icon={EllipsisVertical}
			items={links}
			isQuiet
		/>
	{:else if !isMenu}
		<!-- A link's label is unique within one card, so it is the key. -->
		{#each links as link (link.label)}
			<Button label={link.label} variant="secondary" size="dense-sm" href={link.href} />
		{/each}
	{/if}

	<!--
		Its own small form rather than a line of the menu: a form cannot sit inside
		another, and this one needs to ask before it acts. The seat travels in a
		hidden field inside the dialog, which a closed dialog still sends. In the
		table it is a grey icon that turns red under the pointer, so the row fits
		and stays calm; its words become the button's name. A phone card has room
		for the words.
	-->
	{#if view.columns.canRemove}
		<ConfirmButton
			label="Remove from seat"
			confirmTitle="Remove {participant.fullName} from {participant.seatName}?"
			confirmText="The seat becomes free again. An unpaid invoice for it is cancelled."
			formaction={view.removeAction}
			variant={isMenu ? 'quiet-danger' : 'soft-danger'}
			size="dense-sm"
			icon={isMenu ? UserMinus : undefined}
			areFieldsInDialog
		>
			<input type="hidden" name="seatId" value={participant.seatId} />
		</ConfirmButton>
	{/if}
</div>
