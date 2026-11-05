<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import InviteRoleFields from './InviteRoleFields.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import {
		STAFF_TITLE_MAX_LENGTH,
		type InviteFormErrors,
		type InviteFormValues,
		type TeamCommittee,
		type TeamRole
	} from '$lib/team';

	type Props = {
		/** What the boxes hold: what was last typed, or empty for a fresh form. */
		values: InviteFormValues;
		/** What is wrong with each box, from `validateInviteForm`. */
		errors: InviteFormErrors;
		/** Every committee of this conference, for the picker. */
		committees: TeamCommittee[];
		/** The roles the reader may give, the ones below their own, in the conference's order. */
		roles: TeamRole[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, committees, roles }: Props = $props();

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
		form over; without JavaScript it posts and reloads the page as before.
		`?/invite` is the one action in this file that answers without a
		redirect, because it has a link to hand back; `+page.svelte` falls back
		to an empty form once that answer arrives, so resetting the fields here
		matches what a full page load would already show.
	*/
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<ManageSection title="Invite someone">
	<!-- A real `<form method="post">`, so inviting somebody works with
		JavaScript switched off. `?/invite` is the action in `+page.server.ts`. -->
	<form method="post" action="?/invite" use:enhance={inPlaceForm.submit}>
		<!--
			One row of fields that wraps onto more lines when it runs out of room.
			Email takes whatever width is left over (`flex-[1_1_12.5rem]`, at least
			200px); the others keep the design's widths from `sm` up and fill the
			line on a phone.
		-->
		<div class="flex flex-wrap items-end gap-3 pt-4">
			<div class="w-full min-w-0 sm:w-auto sm:flex-[1_1_12.5rem]">
				<TextField
					label="Email"
					name="email"
					type="email"
					value={values.email}
					error={errors.email}
					autocomplete="email"
					placeholder="name@example.org"
					isRequired
					isDense
				/>
			</div>

			<InviteRoleFields {values} {errors} {committees} {roles} />

			<div class="w-full sm:w-44">
				<TextField
					label="Title"
					name="title"
					value={values.title}
					error={errors.title}
					maxLength={STAFF_TITLE_MAX_LENGTH}
					placeholder="Vice Chair"
					isDense
				/>
			</div>

			<Button
				label="Send invitation"
				variant="primary"
				size="dense"
				isLoading={inPlaceForm.isBusy}
			/>
		</div>

		<!--
			The design says "They get an email". MUNMeet sends no email yet
			(Phase 2), so the line says what really happens: the page hands back a
			link for the organiser to send.
		-->
		<p class="mt-2 max-w-2xl text-small text-muted-foreground">
			They get a link to accept, which you copy and send them. An invitation carries one role; give
			more once they have joined.
		</p>
	</form>
</ManageSection>
