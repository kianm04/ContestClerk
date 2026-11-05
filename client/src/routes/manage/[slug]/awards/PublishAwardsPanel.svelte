<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import type { PublishFormValues } from '$lib/award-form';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { publishAwardsLabel, unconfirmedAwardsText } from '$lib/organiser-awards-text';

	type Props = {
		/** "15 Feb 2027, 17:00" once the awards are published, or null before. */
		publishedMoment: string | null;
		/** The committees with no confirmed award yet, named in a warning. */
		committeesWithoutAwards: string[];
		/** What the panel holds: "Publish now", or what a refused publish sent back. */
		values: PublishFormValues;
		/** The conference's timezone, which a scheduled moment is typed in. */
		timeZone: string;
		/** How many awards are confirmed, which is how many publishing hands out. */
		confirmedCount: number;
		/** How many are still proposals, which publishing leaves out. */
		proposedCount: number;
	};

	let {
		publishedMoment,
		committeesWithoutAwards,
		values,
		timeZone,
		confirmedCount,
		proposedCount
	}: Props = $props();

	const WHEN_OPTIONS = [
		{ value: 'now', label: 'Now' },
		{ value: 'scheduled', label: 'At a set moment' }
	];

	const missingCommittees = $derived(committeesWithoutAwards.join(', '));
	const unconfirmedText = $derived(unconfirmedAwardsText(proposedCount) ?? '');

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const inPlaceForm = createInPlaceForm();
</script>

<!-- The block under the last committee, over a dark rule like the sections above it. -->
{#if publishedMoment !== null}
	<section
		aria-labelledby="publish-awards"
		class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-t border-foreground pt-5"
	>
		<div class="flex flex-col gap-1">
			<h2 id="publish-awards" class="font-semibold">Published</h2>
			<p class="text-dense text-muted-foreground">
				Published {publishedMoment}. Delegates can see their awards on their profile.
			</p>
		</div>
		<ConfirmButton
			label="Unpublish"
			variant="soft-danger"
			size="dense-sm"
			confirmTitle="Unpublish the awards?"
			confirmText="Delegates stop seeing them. Notifications already sent stay."
			formaction="?/unpublish"
		/>
	</section>
{:else}
	<form
		method="post"
		action="?/publish"
		aria-labelledby="publish-awards"
		class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-t border-foreground pt-5"
		use:enhance={inPlaceForm.submit}
	>
		<div class="flex min-w-0 flex-[1_1_22rem] flex-col gap-3.5">
			<div class="flex flex-col gap-1">
				<h2 id="publish-awards" class="font-semibold">Publish the awards</h2>
				<p class="text-dense text-muted-foreground">
					Only confirmed awards are published. Each winner is notified and the award appears on
					their profile. {unconfirmedText}
				</p>
			</div>
			{#if committeesWithoutAwards.length > 0}
				<Notice tone="warning" title="Committees without a confirmed award">
					{missingCommittees}
				</Notice>
			{/if}
			<RadioGroup legend="When" name="when" value={values.when} options={WHEN_OPTIONS} isDense />
			<TextField
				label="Publish at"
				name="publishAt"
				type="datetime-local"
				value={values.publishAt}
				help="Only for a set moment, in the conference's timezone ({timeZone})."
				isDense
			/>
		</div>
		<Button
			label={publishAwardsLabel(confirmedCount)}
			variant="primary"
			size="dense"
			isLoading={inPlaceForm.isBusy}
		/>
	</form>
{/if}
