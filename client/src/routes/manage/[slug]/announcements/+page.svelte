<script lang="ts">
	import {
		announcementsInListOrder,
		describeAnnouncementFailure,
		expectAnnouncementRowChange
	} from '$lib/announcement-presses';
	import type { Announcement } from '$lib/announcements';
	import Notice from '$lib/components/Notice.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { NEW_ROW_ID_FIELD } from '$lib/new-row-id';
	import { pressedAction, rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import AnnouncementForm from './AnnouncementForm.svelte';
	import SentAnnouncements from './SentAnnouncements.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference comes from. `load`
	// runs again whenever the address changes, such as on "Edit", and after every
	// action. `form` is what the last action answered without redirecting: a
	// refusal, or the count "Preview recipients" asked for.
	let { data, form }: PageProps = $props();

	/*
		One instant form for the whole page (`$lib/instant-form.svelte.ts`):
		publishing, saving an edit, pinning and deleting are all sent through it,
		so the list shows the change the moment a button is pressed, with no
		spinner. "Preview recipients" cannot be predicted (it needs a database
		count), so `AnnouncementForm` keeps that one button on the older
		`createInPlaceForm` instead; see the comment there.
	*/
	const announcementForm = createInstantForm<RowChange<Announcement>[]>({
		describeFailure: describeAnnouncementFailure
	});

	/**
	 * What a press will change (`$lib/announcement-presses.ts`). A press that
	 * might publish gets a fresh id here, because a pure function cannot call
	 * `crypto.randomUUID()` and stay testable; the server saves the row under
	 * that same id.
	 */
	function expectAnnouncementChange(input: InstantSubmitInput): RowChange<Announcement>[] | null {
		if (pressedAction(input.action) === '?/publish') {
			input.formData.set(NEW_ROW_ID_FIELD, crypto.randomUUID());
		}

		return expectAnnouncementRowChange(input, data.announcements, data.delegations, new Date());
	}

	const submitAnnouncementPress = announcementForm.submitExpecting(expectAnnouncementChange);

	// `$derived` works each of these out again whenever `data`, `form` or the
	// presses still on their way change. An answered post hands back everything
	// that was typed, so nothing is lost.
	const formValues = $derived(form?.values ?? data.formValues);
	const formErrors = $derived(form?.errors ?? {});
	const audienceCount = $derived(form ? form.audienceCount : data.audienceCount);
	const previewedAnnouncements = $derived(
		announcementsInListOrder(rowsAfterPresses(data.announcements, announcementForm.presses))
	);
	const now = $derived(new Date(data.now));
	const slug = $derived(data.conference.slug);
</script>

<svelte:head>
	<title>Announcements · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Announcements" summary="Everything you post also arrives as a notification." />

{#if form?.message}
	<div class="mb-5">
		<Notice tone="error">{form.message}</Notice>
	</div>
{/if}

<!--
	The form comes first, so a phone shows it on top. From `xl` up, where both
	fit side by side, `flex-row-reverse` puts the list on the left and the form
	on the right.
-->
<div class="flex flex-col gap-10 xl:flex-row-reverse xl:items-start xl:gap-12">
	<div class="min-w-0 xl:flex-[1_1_22.5rem]">
		<AnnouncementForm
			values={formValues}
			errors={formErrors}
			mayAddressConference={data.mayAddressConference}
			committees={data.committees}
			delegations={data.delegations}
			{audienceCount}
			conferenceSlug={slug}
			onSubmit={submitAnnouncementPress}
		/>
	</div>

	<div class="min-w-0 xl:flex-[1_1_30rem]">
		<SentAnnouncements
			announcements={previewedAnnouncements}
			{now}
			timezone={data.conference.timezone}
			conferenceSlug={slug}
			onSubmit={submitAnnouncementPress}
			readOnlyIds={data.readOnlyIds}
		/>
	</div>
</div>
