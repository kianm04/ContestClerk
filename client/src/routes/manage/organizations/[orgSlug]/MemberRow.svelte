<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import PersonRow from '$lib/components/PersonRow.svelte';
	import { CONTROL_CLASSES, LABEL_CLASSES } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { OrganizationMember } from '$lib/organizations';

	/*
		One row of the members list. It is its own file rather than part of
		`MembersTable.svelte` because the role picker is an `{#each}` inside an
		`{#if}` inside the list's own `{#each}`, and CLAUDE.md asks for the inner
		part of a template three blocks deep to become a component.
		`StaffRow.svelte` on the team page was split for the same reason.
	*/

	/** One choice in the role picker: the value is sent, the label is read. */
	type RoleOption = {
		value: string;
		label: string;
	};

	type Props = {
		/** The person this row is about. */
		member: OrganizationMember;
		/** "Owner", "Admin" or "Member": the words for the role they hold now. */
		roleLabel: string;
		/** The roles the reader may hand out, from `memberRoleOptions(myRole)`. */
		roleOptions: RoleOption[];
		/** The organisation's name, which both questions below put in front of the reader. */
		organizationName: string;
		/** Owners and admins get the controls; a plain member only reads the row. */
		isAdmin: boolean;
		/**
		 * Sends a press through the members table's instant form, which changes
		 * the row at once (T142). The reader's own row does not use it.
		 */
		onSubmit: SubmitFunction;
	};

	// `$props()` takes the values the members table passed in.
	let { member, roleLabel, roleOptions, organizationName, isAdmin, onSubmit }: Props = $props();

	/*
		`memberRoleOptions` leaves out the roles the reader may not hand out, so
		an admin looking at an owner is offered neither. A picker that could not
		show the role somebody already holds would quietly offer to demote them,
		so the row shows no picker at all in that case — which is also what
		`changeRole` in `+page.server.ts` would answer if it were pressed.

		`$derived` works these out again whenever the row's member changes.
	*/
	const canChangeRole = $derived(roleOptions.some((option) => option.value === member.role));

	// A member may take themselves out of the organisation, and the button says
	// so in their own words rather than talking about them in the third person.
	const removeLabel = $derived(member.isMe ? 'Leave organisation' : 'Remove');
	const confirmTitle = $derived(
		member.isMe
			? `Leave ${organizationName}?`
			: `Remove ${member.fullName} from ${organizationName}?`
	);
	const confirmText = $derived(
		member.isMe
			? 'You lose access to this organisation and to the conferences it runs.'
			: 'They lose access to this organisation and to the conferences it runs. You can invite them again afterwards.'
	);

	/*
		A plain member has no controls on anybody else's row, but they may still
		walk out of their own. Otherwise the people the reader may remove are
		the people whose role they may change: an admin may not take an owner
		out any more than demote them, so an owner's row offers an admin no
		Remove button, just as it offers them no picker. The `removeMember`
		action and the `organization_members` delete policy ask the same
		question again. The `prevent_last_owner_removal` trigger is what stops
		the last owner leaving, and its refusal is shown at the top of the page.
	*/
	const canRemove = $derived(member.isMe || (isAdmin && canChangeRole));

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// This form edits the role somebody already holds, so it does not reset.
	const inPlaceForm = createInPlaceForm();

	// Somebody else's row changes the moment its button is pressed (T142). Your own
	// row waits for the server: your role decides this page, and leaving ends it.
	const submitPress = $derived(member.isMe ? inPlaceForm.submit : onSubmit);
	const isRoleBusy = $derived(member.isMe && inPlaceForm.isBusy);
</script>

<div class="flex flex-wrap items-end gap-3 py-2">
	<div class="min-w-0 flex-1 basis-48">
		<PersonRow name={member.fullName} subtitle={roleLabel} imagePath={member.avatarPath} />
	</div>

	<!--
		Each control is its own small `<form method="post">`, because a form
		cannot sit inside another form and the two buttons post to two different
		actions. Both work with JavaScript switched off. A wrapping `<label>`
		names the picker without an `id`, which matters here: every row on the
		page holds the same picker and they cannot all have the same id.
	-->
	{#if isAdmin && canChangeRole}
		<form
			method="post"
			action="?/changeRole"
			class="flex flex-wrap items-end gap-2"
			use:enhance={submitPress}
		>
			<input type="hidden" name="userId" value={member.userId} />

			<label class="min-w-40">
				<span class={LABEL_CLASSES}>Role</span>
				<select name="role" class={CONTROL_CLASSES}>
					<!-- The `(option.value)` key lets Svelte reuse the options. `selected`
						marks the current role in the HTML, so it also shows without
						JavaScript. -->
					{#each roleOptions as option (option.value)}
						<option value={option.value} selected={option.value === member.role}>
							{option.label}
						</option>
					{/each}
				</select>
			</label>

			<Button label="Save role" variant="secondary" size="sm" isLoading={isRoleBusy} />
		</form>
	{/if}

	<!-- `ConfirmButton` is a `<form>` of its own, so it comes after the one above
		rather than inside it. The hidden field it is given is posted with it. -->
	{#if canRemove}
		<ConfirmButton
			label={removeLabel}
			{confirmTitle}
			{confirmText}
			formaction="?/removeMember"
			onSubmit={member.isMe ? undefined : onSubmit}
		>
			<input type="hidden" name="userId" value={member.userId} />
		</ConfirmButton>
	{/if}
</div>
