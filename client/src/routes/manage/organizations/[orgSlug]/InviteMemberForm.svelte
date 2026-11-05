<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import {
		INVITE_MEMBER_ROLE_OPTIONS,
		type InviteMemberErrors,
		type InviteMemberValues
	} from '$lib/organizations';

	type Props = {
		/** What the boxes hold: what was last typed, or empty for a fresh form. */
		values: InviteMemberValues;
		/** What is wrong with each box, from `validateInviteMember`. */
		errors: InviteMemberErrors;
	};

	// `$props()` takes the values the members table passed in. A refused
	// invitation hands back everything that was typed, so nothing is lost.
	let { values, errors }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	//
	// `isResetAfterSave` is on because this form adds a new invitation rather
	// than editing something that already exists: once the server has made it,
	// the email box should empty again, the way a reload used to leave it.
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<!-- A real `<form method="post">`, so inviting somebody works with JavaScript
	switched off. `?/invite` is the action in `+page.server.ts`, and it is the one
	action on this page that stays put rather than redirecting, because it has
	the invitation link to hand back. -->
<form method="post" action="?/invite" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
	<div class="grid gap-4 md:grid-cols-2">
		<TextField
			label="Email"
			name="email"
			type="email"
			value={values.email}
			error={errors.email}
			autocomplete="email"
			isRequired
		/>

		<SelectField
			label="Role"
			name="role"
			value={values.role}
			options={INVITE_MEMBER_ROLE_OPTIONS}
			error={errors.role}
			placeholder="Pick a role"
			isRequired
		/>
	</div>

	<FormActions>
		<Button label="Send invitation" variant="primary" isLoading={inPlaceForm.isBusy} />
	</FormActions>
</form>
