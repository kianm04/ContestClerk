<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import CreationColumns from '$lib/components/creation/CreationColumns.svelte';
	import CreationFooter from '$lib/components/creation/CreationFooter.svelte';
	import { createAutosaveForm } from '$lib/autosave-form.svelte';
	import type { CreationDraft } from '$lib/creation-draft';
	import { continueLabel } from '$lib/creation-steps';
	import { draftWithWhen, whenFormValues, type WhenErrors } from '$lib/creation-when';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createStepUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import WhenPanel from './WhenPanel.svelte';
	import WhenPreview from './WhenPreview.svelte';
	import WherePanel from './WherePanel.svelte';

	// `data` is the layout's draft, organisation and previous edition, with this
	// step's suggestion and timezones. `form` is what a refused Continue sent back.
	let { data, form }: PageProps = $props();

	const FORM_ID = 'creation-step-form';
	const SUGGESTION_FORM_ID = 'use-suggested-dates';

	// What the fields hold. A `$derived` may be assigned to, so `bind:value` writes
	// into it; new `data` (after "Use these dates") starts them again from the draft.
	let savedDraft: CreationDraft = $derived(data.draft);
	const initial = $derived(form?.values ?? whenFormValues(data.draft));
	let startDate = $derived(initial.startDate);
	let endDate = $derived(initial.endDate);
	let isTimesTba = $derived(initial.isTimesTba);
	let startTime = $derived(initial.startTime);
	let endTime = $derived(initial.endTime);
	let locationMode = $derived(initial.locationMode);
	let city = $derived(initial.city);
	let countryCode = $derived(initial.countryCode);
	let venueName = $derived(initial.venueName);
	let venueAddress = $derived(initial.venueAddress);
	let timezone = $derived(initial.timezone);
	let errors: WhenErrors = $derived(form?.errors ?? {});

	/** A background save came back with the draft as stored. */
	function onSaved(answer: Record<string, unknown>) {
		const stored = answer.draft as CreationDraft | undefined;
		if (stored === undefined) return;
		savedDraft = stored;
		errors = (answer.errors as WhenErrors | undefined) ?? {};
	}

	const autosave = createAutosaveForm({
		action: '?/save',
		// Read once, on purpose: the helper keeps its own "saved at" from here on.
		initialSavedAt: untrack(() => data.draft.updatedAt),
		onSaved
	});
	// Continue and "Use these dates" send a form themselves, so a waiting save is dropped.
	const stepForm = createInPlaceForm({ onSend: () => autosave.cancel() });
	const suggestionForm = createInPlaceForm({ onSend: () => autosave.cancel() });

	let stepFormElement: HTMLFormElement | undefined = $state(); // set by `bind:this`

	/** The calendar and the switch change fields without a form event, so tell the autosave. */
	function announceChange() {
		stepFormElement?.dispatchEvent(new Event('change'));
	}

	// The draft as the form now has it, so the preview changes as the organiser types.
	const formDraft = $derived(
		draftWithWhen(savedDraft, {
			startDate,
			endDate,
			isTimesTba,
			startTime,
			endTime,
			locationMode,
			city,
			countryCode,
			venueName,
			venueAddress,
			timezone
		})
	);
</script>

<svelte:head>
	<title>When & where · {data.draft.name} · MUNMeet</title>
</svelte:head>

<!-- The design's left panels run on under the footer: from `lg` up the left column is the preview's 666 pixels tall and scrolls, with no scrollbar drawn. -->
<CreationColumns leftClass="lg:h-166.5 lg:overflow-y-auto lg:[scrollbar-width:none]">
	<!-- `use:enhance` sends Continue in the background; without JavaScript it posts as usual. -->
	<form
		id={FORM_ID}
		method="POST"
		action="?/continue"
		class="flex flex-col gap-1.5"
		bind:this={stepFormElement}
		use:enhance={stepForm.submit}
		oninput={autosave.handleChange}
		onchange={autosave.handleChange}
	>
		<WhenPanel
			bind:startDate
			bind:endDate
			bind:isTimesTba
			bind:startTime
			bind:endTime
			{errors}
			suggestion={data.suggestion}
			startDateSource={savedDraft.prefillSources.start_date}
			today={data.now.slice(0, 10)}
			suggestionFormId={SUGGESTION_FORM_ID}
			onPick={announceChange}
		/>
		<WherePanel
			bind:locationMode
			bind:city
			bind:countryCode
			bind:venueName
			bind:venueAddress
			bind:timezone
			timezoneOptions={data.timezoneOptions}
			isTimezoneSaved={data.draft.prefillSources.timezone === 'user'}
			{errors}
		/>
	</form>

	{#snippet aside()}
		<WhenPreview draft={formDraft} organizationName={data.organization.name} now={data.now} />
	{/snippet}
</CreationColumns>

<!-- The form behind "Use these dates", out here because forms may not nest. -->
<form
	id={SUGGESTION_FORM_ID}
	method="POST"
	action="?/useSuggestedDates"
	use:enhance={suggestionForm.submit}
></form>

<CreationFooter
	status={autosave.status}
	savedAt={autosave.savedAt}
	now={data.now}
	timezone={data.draft.timezone}
	backHref={createStepUrl(data.draft.slug, 'basics')}
	primaryLabel={continueLabel('when') ?? 'Continue'}
	primaryForm={FORM_ID}
	isPrimaryBusy={stepForm.isBusy}
/>
