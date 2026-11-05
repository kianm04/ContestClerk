<script lang="ts">
	import UsersRound from '@lucide/svelte/icons/users-round';
	import type { ResolvedPathname } from '$app/types';
	import { enhance } from '$app/forms';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import type { CatalogueCommittee } from '$lib/committee-catalogue';
	import type { CommitteeFormErrors } from '$lib/committee-details';
	import { dialogAction, type CommitteeDialogValues } from '$lib/creation-setup-dialog';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createSetupDialogUrl } from '$lib/urls';
	import AbbreviationField from './AbbreviationField.svelte';
	import CommitteeDescriptionField from './CommitteeDescriptionField.svelte';
	import CommitteeLevelFields from './CommitteeLevelFields.svelte';
	import CommitteeMoreActions from './CommitteeMoreActions.svelte';
	import CommitteeNameField from './CommitteeNameField.svelte';
	import CommitteeSeatFields from './CommitteeSeatFields.svelte';
	import CommitteeTemplates from './CommitteeTemplates.svelte';
	import DialogActions from './DialogActions.svelte';
	import DialogFrame from './DialogFrame.svelte';

	type Props = {
		/** What the fields open with: the committee, or what was typed before a refusal. */
		values: CommitteeDialogValues;
		errors: CommitteeFormErrors & { plannedSeatCount?: string };
		slug: string;
		conferenceName: string;
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, slug, conferenceName, closeHref }: Props = $props();

	/*
		The fields a catalogue pick fills in. Each is a `$derived` that can also
		be written to: typing and picking change it, and a fresh `values` (the
		answer to a refused save) starts it again from what came back.
	*/
	let name = $derived(values.name);
	let abbreviation = $derived(values.abbreviation);
	let level = $derived(values.level);
	let topics = $derived(values.topics);
	let description = $derived(values.description);
	let speakingTime = $derived(values.defaultSpeakingTimeSeconds);

	const isNew = $derived(values.committeeId === '');
	const saveForm = createInPlaceForm();
	const deleteHref = $derived(createSetupDialogUrl(slug, 'delete-committee', values.committeeId));
	// Edit committee's labels sit 3 pixels over their fields, Create committee's 6.
	const controlClass = $derived(isNew ? undefined : 'mt-0.75');

	/** Fill the fields from a catalogue committee; everything stays editable. */
	function handlePick(committee: CatalogueCommittee) {
		name = committee.name;
		abbreviation = committee.abbreviation;
		level = committee.level;
		topics = [...committee.topics];
		description = committee.description;
		speakingTime = String(committee.defaultSpeakingTimeSeconds);
	}
</script>

<!--
	Two designs share this dialog. Create committee is 649 pixels wide with
	DialogFrame's own title. Edit committee is 720 wide, with a 64 pixel circle
	left of a smaller title: the box becomes a two-column grid, the circle
	(passed as `above`, a snippet: a piece of markup handed to a component)
	spans the title's two rows, and everything else spans both columns.
-->
<DialogFrame
	title={isNew ? 'Create committee' : 'Edit committee'}
	description={isNew
		? `Add a new committee for ${conferenceName}.`
		: 'Update the details for this committee. Changes will be saved to your conference setup.'}
	width={isNew ? 649 : 720}
	class={isNew
		? undefined
		: 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 pt-5.75 pr-7.5 pb-4.75 pl-7.75'}
	titleClass={isNew ? undefined : 'fs-30 lh-36 lg:pr-28'}
	descriptionClass={isNew ? undefined : 'mt-0 fs-13 lh-18 lg:whitespace-nowrap'}
	closeClass={isNew ? undefined : 'top-7 right-7.5 size-6 max-lg:top-5 max-lg:right-4'}
	above={isNew ? undefined : circle}
	{closeHref}
>
	<div class={isNew ? 'contents' : 'col-span-2'}>
		{#if !isNew}
			<CommitteeMoreActions {deleteHref} />
		{/if}
		<!--
			The address repeats the dialog, so a refusal without JavaScript comes
			back with this dialog still open (see `dialogAction`).
		-->
		<form
			method="POST"
			action={dialogAction(
				isNew ? 'addCommittee' : 'updateCommittee',
				'committee',
				values.committeeId
			)}
			use:enhance={saveForm.submit}
			class={['flex flex-col', isNew ? 'mt-5.5' : 'mt-6.75']}
		>
			<input type="hidden" name="committeeId" value={values.committeeId} />
			<div
				class={[
					'grid grid-cols-1 gap-y-3',
					isNew
						? 'lg:grid-cols-[363fr_210fr] lg:gap-x-5'
						: 'lg:grid-cols-[356fr_279fr] lg:gap-x-5.75'
				]}
			>
				<CommitteeNameField bind:name error={errors.name} {controlClass} onpick={handlePick} />
				<AbbreviationField bind:abbreviation error={errors.abbreviation} {controlClass} />
			</div>
			<CommitteeSeatFields {values} {errors} {isNew} />
			<CommitteeLevelFields {errors} {isNew} bind:level bind:speakingTime bind:topics />
			<CommitteeDescriptionField bind:description error={errors.description} isTall={!isNew} />
			{#if isNew}
				<CommitteeTemplates onpick={handlePick} />
			{:else}
				<hr class="mt-4 border-creation-rule" />
			{/if}

			<!--
				The buttons' sizes are the designs': 42 tall with 17 pixel words.
				`[&[type=submit]]:` reaches the primary button alone and
				`[&:has(svg)]:` the Delete link alone (the one with an icon). Edit
				committee draws no Cancel, so the container hides that link there.
			-->
			<DialogActions
				submitLabel={isNew ? 'Add committee' : 'Save changes'}
				{closeHref}
				isBusy={saveForm.isBusy}
				deleteHref={isNew ? undefined : deleteHref}
				class={isNew ? 'mt-5' : 'mt-2.5 [&_a:not(:has(svg))]:hidden'}
				buttonClass={isNew
					? 'h-10.5 px-6 fs-17 lh-24 [&[type=submit]]:px-5.5'
					: 'h-10.5 fs-17 lh-24 [&:has(svg)]:w-29.25 [&:has(svg)]:gap-3 [&:has(svg)]:border-creation-red [&[type=submit]]:w-36.75'}
			/>
		</form>
	</div>
</DialogFrame>

{#snippet circle()}
	<IconCircle
		icon={UsersRound}
		class="row-span-2 -my-1.25 -ml-3.25 size-16 self-center"
		iconClass="size-7.5"
	/>
{/snippet}
