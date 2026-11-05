<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** What the box holds: the address last typed, or empty for a fresh form. */
		email: string;
		/** Why that address was refused, or `null`. */
		error: string | null;
		/** The link of the invitation just written, or `null` when none was. */
		link: string | null;
		/** Who that link is for. */
		linkEmail: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { email, error, link, linkEmail }: Props = $props();

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`); without JavaScript it posts and
		reloads the page as before. `?/inviteChair` answers with the new link
		rather than a redirect, and the box empties once it has, the way a full
		page load would leave it.
	*/
	const inviteForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<!--
	Email delivery is Phase 2, so a new invitation hands the organiser its
	link to send on by hand, the way the team page does. This form shares a
	wrapping row with "Or choose from your team" (`ChairsPanel`), and
	`basis-full` gives the notice a whole line of that row to itself.
-->
{#if link}
	<div class="basis-full">
		<Notice tone="success" title="Copy this link and send it to {linkEmail}">
			<p class="mt-1 font-mono text-small break-all">{link}</p>
		</Notice>
	</div>
{/if}

<!-- `flex-[1_1_18rem]` takes half the row on a wide screen and the whole of it on a phone. -->
<form
	method="post"
	action="?/inviteChair"
	class="flex min-w-0 flex-[1_1_18rem] items-start gap-2"
	use:enhance={inviteForm.submit}
>
	<div class="min-w-0 flex-1">
		<TextField
			label="Invite a chair by email"
			name="email"
			type="email"
			value={email}
			{error}
			placeholder="name@example.org"
			autocomplete="off"
			isRequired
			isDense
		/>
	</div>

	<!-- `pt-6.5` is the height of the label above the box, so the button lines up with the box. -->
	<div class="pt-6.5">
		<Button label="Invite" variant="secondary" size="dense" isLoading={inviteForm.isBusy} />
	</div>
</form>
