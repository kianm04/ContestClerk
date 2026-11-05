<script lang="ts">
	// `enhance` sends a form in the background once JavaScript runs; `createInPlaceForm` says how.
	import { enhance } from '$app/forms';
	import Flag from '$lib/components/Flag.svelte';
	import { paperPersonLine, type AuthorWords, type PaperPerson } from '$lib/committee-papers';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		person: PaperPerson;
		words: AuthorWords;
		/** True on another author's row while the reader leads: "Make lead" hands the lead to them. */
		canMakeLead: boolean;
	};

	let { person, words, canMakeLead }: Props = $props();

	// "Make lead" answers in place: the list is drawn again with its new lead, and a toast says so.
	const inPlace = createInPlaceForm();
</script>

<!--
	One seat on the paper: its flag, its name, and who sits in it. Under a
	mouse the lead's own row-action appears on the row it points at, as the
	paper writer was drawn; a phone has nothing to point with, so there it
	stays in view. `group` lets the button see the pointer on its row
	(`group-hover:`), and `pointer-fine:` means a mouse or a trackpad.
-->
<li
	class={[
		'group flex min-h-11 items-center gap-2.5 border-b border-border py-1.5',
		canMakeLead && 'hover:-mx-2 hover:bg-accent hover:px-2'
	]}
>
	<!-- The name says the country, so a screen reader skips the flag. -->
	<span class="flex w-5 flex-none" aria-hidden="true">
		{#if person.countryCode}
			<Flag countryCode={person.countryCode} />
		{/if}
	</span>
	<div class="min-w-0 flex-1">
		<p class="text-dense font-medium text-foreground">{person.seatName}</p>
		<p class="text-caption/4.5 text-muted-foreground">{paperPersonLine(person, words)}</p>
	</div>
	{#if canMakeLead}
		<form method="post" action="?/makeLead" use:enhance={inPlace.submit} class="flex-none">
			<input type="hidden" name="seatId" value={person.seatId} />
			<button
				type="submit"
				class="inline-flex min-h-11 cursor-pointer items-center text-caption text-link sm:min-h-5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
			>
				{words.makeLead}<span class="sr-only">: {person.seatName}</span>
			</button>
		</form>
	{/if}
</li>
