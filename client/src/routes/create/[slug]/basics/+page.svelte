<script lang="ts">
	import Link from '@lucide/svelte/icons/link';
	import FileText from '@lucide/svelte/icons/file-text';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import CreationColumns from '$lib/components/creation/CreationColumns.svelte';
	import CreationFooter from '$lib/components/creation/CreationFooter.svelte';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import { createAutosaveForm } from '$lib/autosave-form.svelte';
	import { basicsPreview, type BasicsErrors } from '$lib/creation-basics';
	import { creationPreview, sourceChipLabel, type CreationDraft } from '$lib/creation-draft';
	import { continueLabel } from '$lib/creation-steps';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createConferenceUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import BasicsFields from './BasicsFields.svelte';
	import BasicsPreview from './BasicsPreview.svelte';
	import BrandingFields from './BrandingFields.svelte';
	import ImageForms from './ImageForms.svelte';

	// `data` is what the layout's `load` returned: the draft, its organisation
	// and the previous edition. `form` is what an action sent back when it
	// refused, such as Continue without a name.
	let { data, form }: PageProps = $props();

	const FORM_ID = 'creation-step-form';

	/*
		What the fields hold. Each starts as the saved value and, because a
		`$derived` may also be assigned to, `bind:value` puts what is typed into
		it. When new `data` arrives (after "Regenerate name" or an upload), they
		all start again from the saved draft.
	*/
	let savedDraft: CreationDraft = $derived(data.draft);
	let name = $derived(form?.values?.name ?? data.draft.name);
	let tagline = $derived(form?.values?.tagline ?? data.draft.tagline ?? '');
	let description = $derived(form?.values?.description ?? data.draft.description ?? '');
	let contactEmail = $derived(form?.values?.contactEmail ?? data.draft.contactEmail ?? '');
	let websiteUrl = $derived(form?.values?.websiteUrl ?? data.draft.websiteUrl ?? '');
	let instagramUrl = $derived(form?.values?.instagramUrl ?? data.draft.instagramUrl ?? '');
	let errors: BasicsErrors = $derived(form?.errors ?? {});

	/**
	 * A background save came back. Its sources say which values are now the
	 * organiser's own, and the name may have followed the year of the dates.
	 * A name typed since the save was sent is kept.
	 */
	function onSaved(answer: Record<string, unknown>) {
		const stored = answer.draft as CreationDraft | undefined;
		if (stored === undefined) return;
		if (name === savedDraft.name) name = stored.name;
		savedDraft = stored;
		errors = (answer.errors as BasicsErrors | undefined) ?? {};
	}

	const autosave = createAutosaveForm({
		action: '?/save',
		// `untrack` reads the value once, on purpose: the helper keeps its own
		// "saved at" from here on, so later `data` should not reach it.
		initialSavedAt: untrack(() => data.draft.updatedAt),
		onSaved
	});
	// Continue sends the whole form itself, so a save still waiting is dropped.
	const stepForm = createInPlaceForm({ onSend: () => autosave.cancel() });

	const preview = $derived(
		basicsPreview(
			creationPreview(
				{ ...savedDraft, name, tagline: tagline || null, description: description || null },
				data.organization.name,
				null
			)
		)
	);
</script>

<svelte:head>
	<title>Basics · {data.draft.name} · MUNMeet</title>
</svelte:head>

<!--
	The design's columns, 975 and 569 wide. Its left column is 72 pixels taller
	than the room above the footer, so here the counts sit on their labels'
	lines, the branding line is one line and the pictures are 64 tall, not 68.
-->
<CreationColumns left={975} right={569} leftClass="gap-1.5">
	<!--
		`use:enhance` sends Continue in the background once JavaScript has
		loaded; without it the form posts and the page reloads as usual. The
		`oninput` and `onchange` listeners hear every field inside the form.
	-->
	<form
		id={FORM_ID}
		method="POST"
		action="?/continue"
		class="contents"
		use:enhance={stepForm.submit}
		oninput={autosave.handleChange}
		onchange={autosave.handleChange}
	>
		<CreationPanel
			title="Tell delegates what this conference is"
			description="This information will be shown on your public page and helps delegates understand your conference."
			icon={FileText}
			class="pb-4.5"
		>
			<BasicsFields
				bind:name
				bind:tagline
				bind:description
				{errors}
				isNameGenerated={sourceChipLabel('name', savedDraft.prefillSources.name) !== null}
			/>
		</CreationPanel>
		<CreationPanel
			title="Branding & links"
			description="This conference will use your organisation's branding by default. You can change these settings later."
			icon={Link}
			class="pb-4.5"
		>
			<BrandingFields
				draft={savedDraft}
				organizationName={data.organization.name}
				bind:contactEmail
				bind:websiteUrl
				bind:instagramUrl
				{errors}
				imageErrors={form?.imageErrors ?? {}}
			/>
		</CreationPanel>
	</form>

	{#snippet aside()}
		<BasicsPreview {preview} />
	{/snippet}
</CreationColumns>

<ImageForms />

<CreationFooter
	status={autosave.status}
	savedAt={autosave.savedAt}
	now={data.now}
	timezone={data.draft.timezone}
	backHref={createConferenceUrl()}
	primaryLabel={continueLabel('basics') ?? 'Continue'}
	primaryForm={FORM_ID}
	isPrimaryBusy={stepForm.isBusy}
/>
