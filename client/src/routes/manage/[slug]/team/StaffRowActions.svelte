<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { DENSE_CONTROL_CLASSES, DENSE_LABEL_CLASSES } from '$lib/form-fields';
	import {
		STAFF_TITLE_MAX_LENGTH,
		type TeamCommittee,
		type TeamFilter,
		type TeamPerson
	} from '$lib/team';
	import StaffCommitteeForms from './StaffCommitteeForms.svelte';

	type Props = {
		/** The staff member these buttons act on. */
		person: TeamPerson;
		/** Every committee of this conference, for the picker below. */
		committees: TeamCommittee[];
		/** The role filter the list has open, which each form sends back so saving keeps it. */
		filter: TeamFilter;
		/**
		 * Sends a press through the team list's instant form
		 * (`$lib/instant-form.svelte.ts`), which changes the row at once (T142).
		 */
		onSubmit: SubmitFunction;
	};

	let { person, committees, filter, onSubmit }: Props = $props();

	/*
		`bind:this` puts the real `<details>` element in this variable once Svelte
		has put it on the page. CLAUDE.md asks us to avoid it, but `handleSubmit`
		below cannot close the panel without it, the same reason `Dropdown.svelte`
		uses it for its menu.
	*/
	let details: HTMLDetailsElement | undefined = $state();

	/*
		With JavaScript every form here goes through the team list's instant
		form: the row changes the moment a button is pressed and the page never
		reloads, so nothing else closes this panel. Closing it at the press puts
		the row back the way a page reload always left it, which is also why the
		tests reopen the panel before every button in it. The committee forms
		below are handed this same function.
	*/
	const handleSubmit: SubmitFunction = (input) => {
		if (details) details.open = false;

		return onSubmit(input);
	};
</script>

<!--
	A native `<details>`, so the whole panel opens and closes and the keyboard
	reaches it with no JavaScript at all. `Dropdown.svelte` and
	`MobileMenu.svelte` are built the same way.

	`team.md` names `Dropdown` for this "⋯" menu, and it cannot be used here:
	`Dropdown` renders its items inside one form of its own, which leaves no
	room for the title box, and a `<form>` cannot sit inside another `<form>`.
	So this row writes out its own `<details>` and puts a small form in it per
	thing the organiser can change.

	The summary is the design's "⋯" button: `list-none` and the
	`::-webkit-details-marker` rule hide the browser's triangle. The panel opens
	inside the row rather than floating, because the table's box scrolls
	sideways and would cut off anything that stuck out of it.
-->
<details class="ml-auto open:basis-full" bind:this={details}>
	<summary
		class="ml-auto flex size-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:size-8 [&::-webkit-details-marker]:hidden"
	>
		<Ellipsis aria-hidden="true" class="size-4" />
		<span class="sr-only">Manage {person.fullName}</span>
	</summary>

	<div
		class="mt-2 flex w-full flex-col gap-3 rounded-control border border-border bg-background p-3 text-left md:w-64"
	>
		<!-- Roles are changed in the "Edit roles" dialog beside this menu. -->
		<!--
			Each form carries its own `userId` and `filter`, because each is a separate post and
			none of them can see the fields of the others. A wrapping `<label>`
			names its box without an `id`, which matters here: every row on the page
			holds the same boxes and they cannot all have the same id.
		-->
		<form
			method="post"
			action="?/updateTitle"
			class="flex flex-wrap items-end gap-2"
			use:enhance={handleSubmit}
		>
			<input type="hidden" name="userId" value={person.userId} />
			<input type="hidden" name="filter" value={filter} />
			<label class="min-w-40 flex-1">
				<span class={DENSE_LABEL_CLASSES}>Title</span>
				<input
					name="title"
					value={person.title ?? ''}
					maxlength={STAFF_TITLE_MAX_LENGTH}
					class={DENSE_CONTROL_CLASSES}
				/>
			</label>
			<Button label="Save title" variant="secondary" size="dense-sm" />
		</form>

		<StaffCommitteeForms {person} {committees} {filter} onSubmit={handleSubmit} />

		<!-- `ConfirmButton` is a `<form>` of its own, so it comes after the three
			above rather than inside one of them. The hidden field it is given is
			shown above its button and posted with it. -->
		<ConfirmButton
			label="Remove from the team"
			confirmTitle="Remove {person.fullName} from the team?"
			confirmText="Their committees go with them. You can invite them again afterwards."
			formaction="?/removeStaff"
			size="dense-sm"
			onSubmit={handleSubmit}
		>
			<input type="hidden" name="userId" value={person.userId} />
			<input type="hidden" name="filter" value={filter} />
		</ConfirmButton>
	</div>
</details>
