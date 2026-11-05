<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import DefaultSearchButton from '$lib/components/quick-session/DefaultSearchButton.svelte';
	import QuickSessionColumns from '$lib/components/quick-session/QuickSessionColumns.svelte';
	import QuickSessionFields from '$lib/components/quick-session/QuickSessionFields.svelte';
	import QuickSessionFooter from '$lib/components/quick-session/QuickSessionFooter.svelte';
	import QuickSessionTopLine from '$lib/components/quick-session/QuickSessionTopLine.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import {
		canStart,
		footerNote,
		type DraftChange,
		type QuickSessionErrors
	} from '$lib/quick-session';
	import { signedInHomeUrl } from '$lib/urls';
	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder.
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned: an empty draft.
	// `form` is the answer of the last action posted without JavaScript, or of
	// a refused "Start session": the draft drawn again, with its messages.
	let { data, form }: PageProps = $props();

	/*
		The draft the page draws. It starts from the action's answer when there
		is one and from `load` otherwise, and follows them whenever a new one
		arrives. A `$derived` may also be assigned to, which `handleChange` does
		each time a button changes the draft in the browser.
	*/
	let draft = $derived(form?.draft ?? data.draft);
	let errors: QuickSessionErrors = $derived(form?.errors ?? {});

	// `$derived` works this out again whenever the members change.
	const note = $derived(footerNote(draft, 'start'));

	/*
		Only "Start session" is ever sent with JavaScript: every other button
		changes the draft here and sends nothing. `createInPlaceForm` sends it
		in the background and shows a refusal without reloading the page.
	*/
	const startForm = createInPlaceForm();

	function handleChange(change: DraftChange) {
		draft = change.draft;
		errors = change.errors;
	}
</script>

<svelte:head>
	<title>Run a quick session · MUNMeet</title>
</svelte:head>

<!--
	"Run a quick session" (`05-pages/chair/quick-session.md`): myMUN's "Set up
	new committee" on plain white, as the chair console is. From `md` up the
	page fills the window and only the two lists scroll, so the footer stays on
	the first screen; on a phone the page scrolls as one.

	The whole page is one form. Each button posts to its own `formaction`, so
	without JavaScript every button works by posting the whole form.
-->
<div class="flex min-h-dvh flex-col bg-surface md:h-dvh">
	<QuickSessionTopLine title="Run a quick session" cancelHref={signedInHomeUrl()} />

	<main id="main" class="flex min-h-0 flex-1 flex-col">
		<form
			method="post"
			action="?/search"
			autocomplete="off"
			use:enhance={startForm.submit}
			class="flex min-h-0 flex-1 flex-col"
		>
			<DefaultSearchButton />
			<QuickSessionFields values={draft} {errors} />
			<QuickSessionColumns {draft} {errors} onChange={handleChange} />
			<QuickSessionFooter
				canStart={canStart(draft)}
				{note}
				primaryLabel="Start session"
				primaryAction="?/start"
				isLoading={startForm.isBusy}
			/>
		</form>
	</main>
</div>
