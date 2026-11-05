<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import {
		removeMemberConfirmText,
		removeMemberConfirmTitle,
		type DelegationMember
	} from '$lib/delegations';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { removeDelegationMemberUrl } from '$lib/urls';

	// Which of these buttons a member gets is decided by the page, not here, so
	// that the rules sit in one place rather than once per row.
	type Props = {
		/** The member the buttons act on. */
		member: DelegationMember;
		/** Draw "Make head". */
		canPromote: boolean;
		/** Draw "Remove". */
		canRemove: boolean;
		/** Draw "Step down", which only the reader's own head row offers. */
		canStepDown: boolean;
		/** The delegation, because the Remove button's address needs it. */
		delegationId: string;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`), which "Make
		 * head" and "Remove" are sent through: the row changes the moment either
		 * is pressed, with no spinner.
		 */
		onSubmit: SubmitFunction;
	};

	let { member, canPromote, canRemove, canStepDown, delegationId, onSubmit }: Props = $props();

	/*
		"Step down" takes the reader off this page, which the browser cannot
		foresee, so it is sent in the background with the busy button instead
		(`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands each
		form over; without JavaScript they post and reload the page as before.
	*/
	const stepDownForm = createInPlaceForm();
</script>

<!--
	`members.md` names a `Dropdown` holding "Make head" and "Remove". These small
	forms are that menu instead, and on purpose: `Dropdown` renders one shared
	`<form>` for all of its items, `ConfirmButton` renders a `<form>` of its own, and
	HTML forbids a form inside a form — so the Remove confirmation the spec quotes
	and the menu cannot both exist. `members.md`'s own words for the menu are "each
	item is a small form posting the action", which is exactly what these are.

	There is no wrapping element: the buttons sit straight in the row's wrapping
	line beside the seat, so they fall onto a further line on a narrow phone.
-->
{#if canPromote}
	<form method="post" action="?/makeHead" use:enhance={onSubmit}>
		<input type="hidden" name="userId" value={member.userId} />
		<Button label="Make head" variant="ghost" />
	</form>
{/if}

{#if canStepDown}
	<form method="post" action="?/stepDown" use:enhance={stepDownForm.submit}>
		<Button label="Step down" variant="secondary" isLoading={stepDownForm.isBusy} />
	</form>
{/if}

{#if canRemove}
	<ConfirmButton
		label="Remove"
		confirmTitle={removeMemberConfirmTitle(member.fullName)}
		confirmText={removeMemberConfirmText(member.fullName)}
		formaction={removeDelegationMemberUrl(delegationId, member.userId)}
		variant="soft-danger"
		{onSubmit}
	/>
{/if}
