<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import type { CommitteeFormErrors, CommitteeFormValues } from '$lib/committee-details';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import TopicsEditor from '../TopicsEditor.svelte';

	// The part of `CommitteeForm` somebody who edits only this committee may
	// change: its description and its agenda. The server saves nothing else
	// from them, and the database refuses anything else they send.
	type Props = {
		/** The saved committee, or what was typed into a refused form. */
		values: CommitteeFormValues;
		/** One message per field that has something wrong with it. */
		errors: CommitteeFormErrors;
	};

	let { values, errors }: Props = $props();

	// Saves in the background without reloading the page; without JavaScript the
	// form posts as before.
	const inPlaceForm = createInPlaceForm();
</script>

<form method="post" action="?/save" use:enhance={inPlaceForm.submit}>
	<FormSection title="About">
		<TextArea
			label="Description"
			name="description"
			value={values.description}
			error={errors.description}
			rows={3}
			maxLength={4000}
			isDense
		/>
	</FormSection>

	<FormSection title="Topics" description="What the committee debates, in agenda order.">
		<TopicsEditor topics={values.topics} error={errors.topics} isBusy={inPlaceForm.isBusy} />
	</FormSection>

	<div class="flex flex-wrap items-center gap-3 border-b border-border py-3.5">
		<Button
			label="Save changes"
			variant="primary"
			size="dense"
			type="submit"
			isLoading={inPlaceForm.isBusy}
		/>
	</div>
</form>
