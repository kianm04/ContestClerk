<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import FieldRow from '$lib/components/manage/FieldRow.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import {
		COMMITTEE_LEVEL_OPTIONS,
		type CommitteeFormErrors,
		type CommitteeFormValues
	} from '$lib/committee-details';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import SpeakingTimeField from './SpeakingTimeField.svelte';
	import TopicsEditor from './TopicsEditor.svelte';

	type Props = {
		/** What the fields show: the saved committee, or what was typed into a refused form. */
		values: CommitteeFormValues;
		/** One message per field that has something wrong with it. */
		errors: CommitteeFormErrors;
		/**
		 * Whether this committee already has a link people may have shared: a saved
		 * committee of a published conference. A new committee has no link yet.
		 */
		hasSharedLink: boolean;
		/** The words on the button that saves it: "Create committee" or "Save changes". */
		submitLabel: string;
	};

	let { values, errors, hasSharedLink, submitLabel }: Props = $props();

	// Saves in the background without reloading the page (`$lib/in-place-form.svelte.ts`);
	// both saves redirect, so nothing is emptied. Without JavaScript the form posts as before.
	const inPlaceForm = createInPlaceForm();
</script>

<!-- An ordinary HTML form posting to the page's own `save` action, so the whole
	editor works with JavaScript switched off. -->
<form method="post" action="?/save" use:enhance={inPlaceForm.submit}>
	<FormSection title="About">
		<!--
			The name takes what is left of the row and the two short fields keep
			their own widths, as the design draws them. A grid with no columns of
			its own is one column, so a phone stacks the three.
		-->
		<div class="grid gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_8.75rem_10rem]">
			<TextField
				label="Name"
				name="name"
				value={values.name}
				error={errors.name}
				isRequired
				maxLength={120}
				isDense
			/>
			<TextField
				label="Abbreviation"
				name="abbreviation"
				value={values.abbreviation}
				error={errors.abbreviation}
				help="Such as UNSC."
				maxLength={12}
				isDense
			/>
			<TextField
				label="Room"
				name="room"
				value={values.room}
				error={errors.room}
				maxLength={60}
				isDense
			/>
		</div>

		<TextArea
			label="Description"
			name="description"
			value={values.description}
			error={errors.description}
			rows={3}
			maxLength={4000}
			isDense
		/>

		<RadioGroup
			legend="Level"
			name="level"
			value={values.level}
			options={COMMITTEE_LEVEL_OPTIONS}
			error={errors.level}
			isDense
		/>

		<FieldRow columns={2}>
			<SpeakingTimeField
				value={values.defaultSpeakingTimeSeconds}
				error={errors.defaultSpeakingTimeSeconds}
			/>

			<!--
				The page file asks for the warning when the link changes on a published
				conference, but without JavaScript nothing can tell that a box has been
				typed in, so it is shown whenever the conference is public, which is
				the only time it could ever be true.
			-->
			<div class="flex flex-col gap-2">
				<TextField
					label="Link"
					name="slug"
					value={values.slug}
					error={errors.slug}
					help="Left empty, this is made from the name."
					maxLength={100}
					isDense
				/>
				{#if hasSharedLink}
					<Notice tone="warning">Links shared earlier will stop working.</Notice>
				{/if}
			</div>
		</FieldRow>
	</FormSection>

	<FormSection title="Topics" description="What the committee debates, in agenda order.">
		<TopicsEditor topics={values.topics} error={errors.topics} isBusy={inPlaceForm.isBusy} />
	</FormSection>

	<!--
		`sticky bottom-0` keeps the save button in view at the foot of the window
		while any part of this form is on screen. Chairs, the guide and the seats
		below save as they are changed, so the bar ends with the form.
	-->
	<div
		class="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-y border-border bg-background py-3.5"
	>
		<p class="text-small text-muted-foreground">About and topics are saved together.</p>
		<Button
			label={submitLabel}
			variant="primary"
			size="dense"
			type="submit"
			isLoading={inPlaceForm.isBusy}
		/>
	</div>
</form>
