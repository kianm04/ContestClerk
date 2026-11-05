<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import type { PaperKind } from '$lib/committee-papers';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { LivePaper } from '$lib/paper-live.svelte';
	import { goesToCrisisStaff, sendConfirmText, submitWords } from '$lib/crisis-papers';
	import { submitBlockedSentence, submitConfirmText } from '$lib/paper-submitting';

	type Props = {
		title: string;
		kind: PaperKind;
		isOpenForSignatures: boolean;
		/** The suggestions still open, which have to be decided first. */
		openSuggestions: number;
		/** The live paper's saving, so the last words typed are stored first; `null` without JavaScript. */
		save: LivePaper['save'] | null;
		/** The paper's page with this dialog closed. */
		closeHref: ResolvedPathname;
	};

	let { title, kind, isOpenForSignatures, openSuggestions, save, closeHref }: Props = $props();

	// "Submit to the dais", or "Send to the crisis staff" for a directive or a press release.
	const words = $derived(submitWords(kind));
	const confirmText = $derived(
		goesToCrisisStaff(kind) ? sendConfirmText(kind) : submitConfirmText(kind, isOpenForSignatures)
	);

	/*
		Sent in the background. The server submits the text as it is stored, so
		whatever the reader typed last is saved before the request goes.
	*/
	const inPlace = createInPlaceForm({
		waitBeforeSending: async () => {
			if (save?.hasUnsavedText) await save.saveNow();
		}
	});
</script>

<!--
	The question "Submit to the dais" asks: once sent, the text is frozen until
	the dais approves it or returns it. Open suggestions are not yet agreed, so
	they are decided first. A crisis committee's directives and press releases
	ask the same of the crisis staff.
-->
<ManageDialog title={words.question(title)} {closeHref}>
	{#if openSuggestions > 0}
		<p class="max-w-md text-body text-foreground">{submitBlockedSentence(openSuggestions)}</p>
		<div class="pt-3">
			<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">
				Back to the paper
			</Button>
		</div>
	{:else}
		<p class="max-w-md text-body text-foreground">{confirmText}</p>
		<form
			method="post"
			action="?/submit"
			use:enhance={inPlace.submit}
			class="flex flex-wrap gap-3 pt-3"
		>
			<Button type="submit" size="lg" class="max-lg:h-11" disabled={inPlace.isBusy}>
				{words.button}
			</Button>
			<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Keep writing</Button>
		</form>
	{/if}
</ManageDialog>
