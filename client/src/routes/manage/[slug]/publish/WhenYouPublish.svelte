<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { PublishChecklistLine } from '$lib/publish-checklist';
	import PublishWaitsNotice from './PublishWaitsNotice.svelte';

	type Props = {
		/** What publishing does, from `whenYouPublishBullets` in `$lib/publish-review.ts`. */
		bullets: string[];
		/** The required steps still undone. While there are any, Publish waits. */
		missingLines: PublishChecklistLine[];
		/** Why the last press of "Publish conference" was refused, if it was. */
		publishError: string | null;
		/** The step before this one, Team. */
		backHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { bullets, missingLines, publishError, backHref }: Props = $props();

	// `$derived` works this out again whenever `missingLines` changes.
	const canPublish = $derived(missingLines.length === 0);

	// Sends the form in the background (`$lib/in-place-form.svelte.ts`) and keeps
	// the button busy until the Published page has loaded. Without JavaScript
	// the form posts and the browser follows the redirect as usual.
	const publishForm = createInPlaceForm();
</script>

<section aria-label="When you publish" class="flex flex-col gap-3.5">
	<h2 class="text-h3 text-foreground">When you publish</h2>

	<!-- The bullets are plain strings with no id of their own, so they are keyed by position. -->
	<ul class="flex list-disc flex-col gap-1.5 pl-5 text-body text-foreground">
		{#each bullets as bullet, index (index)}
			<li>{bullet}</li>
		{/each}
	</ul>

	{#if !canPublish}
		<PublishWaitsNotice {missingLines} />
	{/if}

	{#if publishError}
		<Notice tone="error"><p>{publishError}</p></Notice>
	{/if}

	<!--
		The button stays on the page while it waits, greyed out, so the organiser
		can see where it will be. The action checks the same steps again, so a
		post that gets past a disabled button is refused all the same.
	-->
	<form
		method="post"
		action="?/publish"
		use:enhance={publishForm.submit}
		class="flex flex-wrap items-center gap-2 pt-2"
	>
		<Button
			label="Publish conference"
			variant="primary"
			type="submit"
			isDisabled={!canPublish}
			isLoading={publishForm.isBusy}
		/>
		<Button label="Back" variant="ghost" href={backHref} />
	</form>
</section>
