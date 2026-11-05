<script lang="ts">
	import {
		DELETE_CONFIRMATION_WORD,
		describeSoleOwnership,
		type SettingsMessage,
		type SoleOwnership
	} from '$lib/accounts';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import DangerZone from '$lib/components/DangerZone.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { organizationSettingsUrl } from '$lib/urls';

	type Props = {
		/** Organisations this person is the only owner of, which block the deletion. */
		soleOwnerships: SoleOwnership[];
		/** What the last submit had to say about this card, if anything. */
		message: SettingsMessage | null;
	};

	let { soleOwnerships, message }: Props = $props();

	// Sends the confirmed form in the background (`$lib/in-place-form.svelte.ts`)
	// through `ConfirmButton`'s `onSubmit`. A refusal leaves this card on the
	// page, and it holds a password, so `clearFields` empties the boxes the moment
	// the server answers, as the password card does. Without JavaScript the form
	// posts and reloads as before.
	const inPlaceForm = createInPlaceForm({ onSettle: clearFields });

	function clearFields(formElement: HTMLFormElement) {
		formElement.reset();
	}
</script>

<!-- `DangerZone` is the card with the red border. Its children sit in a row, so
     everything here goes in one full-width column inside it. -->
<DangerZone title="Delete account">
	<div class="flex w-full flex-col gap-3">
		<p class="text-body text-ink-600">
			This removes your profile, applications and notifications. Seats you hold will be freed. This
			cannot be undone.
		</p>

		<!-- The `(ownership.id)` key lets Svelte reuse list items instead of
		     rebuilding them. The warning is shown before anybody presses anything,
		     because the database will refuse the deletion while it is true. -->
		{#each soleOwnerships as ownership (ownership.id)}
			<Notice tone="warning">
				{describeSoleOwnership(ownership.name)}
				<!-- The warning says what to do; this is where it is done. The
				     settings page of an organisation is where another owner is made
				     and where the organisation itself is deleted. -->
				<a
					href={organizationSettingsUrl(ownership.slug)}
					class="mt-1 inline-flex min-h-11 items-center text-small text-brand-700 hover:underline"
				>
					Manage {ownership.name} →
				</a>
			</Notice>
		{/each}

		{#if message}
			<Notice tone={message.tone}>{message.text}</Notice>
		{/if}

		<!--
			`ConfirmButton` is its own form posting to the `deleteAccount` action,
			and the fields below travel with it. With JavaScript it asks again in a
			dialog first; without it the confirmation page asks, and carries the
			typed fields on to the action. The current password is asked for as well
			as the word, so that somebody at an unlocked laptop cannot delete the
			account (security review L43); it always starts empty.
		-->
		<ConfirmButton
			label="Delete account"
			confirmTitle="Delete your account?"
			confirmText="This removes your profile, applications and notifications. Seats you hold will be freed. This cannot be undone."
			formaction="?/deleteAccount"
			onSubmit={inPlaceForm.submit}
		>
			<div class="flex flex-col gap-4">
				<!-- `idKey`: the password card above has a field of this name too, and
				     each label has to point at its own box. -->
				<TextField
					label="Current password"
					name="currentPassword"
					idKey="delete-current-password"
					type="password"
					value=""
					autocomplete="current-password"
					help="Only you know it, which is how we know this is you."
				/>

				<TextField
					label="Type {DELETE_CONFIRMATION_WORD} to confirm"
					name="confirmation"
					value=""
				/>
			</div>
		</ConfirmButton>
	</div>
</DangerZone>
