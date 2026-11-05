<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import DefaultSearchButton from '$lib/components/quick-session/DefaultSearchButton.svelte';
	import QuickSessionColumns from '$lib/components/quick-session/QuickSessionColumns.svelte';
	import QuickSessionFooter from '$lib/components/quick-session/QuickSessionFooter.svelte';
	import QuickSessionTopLine from '$lib/components/quick-session/QuickSessionTopLine.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import {
		canStart,
		footerNote,
		type DraftChange,
		type QuickSessionErrors
	} from '$lib/quick-session';
	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder.
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned: the committee's
	// current members as a draft, its name and its chair room's address.
	// `form` is the answer of the last action posted without JavaScript, or of
	// a refused "Save delegations".
	let { data, form }: PageProps = $props();

	/*
		The draft the page draws, from the action's answer when there is one and
		from `load` otherwise. A `$derived` may also be assigned to, which
		`handleChange` does each time a button changes the draft in the browser.
	*/
	let draft = $derived(form?.draft ?? data.draft);
	let errors: QuickSessionErrors = $derived(form?.errors ?? {});

	// `$derived` works these out again whenever what they read changes.
	const note = $derived(footerNote(draft, 'save'));
	const title = $derived(`Edit delegations · ${data.committeeName}`);

	// Only "Save delegations" is ever sent with JavaScript; see `/quick/new`.
	const saveForm = createInPlaceForm();

	function handleChange(change: DraftChange) {
		draft = change.draft;
		errors = change.errors;
	}
</script>

<svelte:head>
	<title>{title} · MUNMeet</title>
</svelte:head>

<!--
	"Edit delegations" of a kept quick session (`05-pages/chair/quick-session.md`):
	the same two columns as "Run a quick session", without the committee's
	name, agenda and speaking time. "Cancel" goes back to the chair room, and
	so does "Save delegations" once it has saved. One form, every button
	posting to its own `formaction`, as on `/quick/new`.
-->
<div class="flex min-h-dvh flex-col bg-surface md:h-dvh">
	<QuickSessionTopLine {title} cancelHref={data.roomHref} />

	<main id="main" class="flex min-h-0 flex-1 flex-col">
		<form
			method="post"
			action="?/search"
			autocomplete="off"
			use:enhance={saveForm.submit}
			class="flex min-h-0 flex-1 flex-col"
		>
			<DefaultSearchButton />
			<QuickSessionColumns {draft} {errors} onChange={handleChange} />
			<QuickSessionFooter
				canStart={canStart(draft)}
				{note}
				primaryLabel="Save delegations"
				primaryAction="?/save"
				isLoading={saveForm.isBusy}
			/>
		</form>
	</main>
</div>
