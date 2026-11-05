<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Bell from '@lucide/svelte/icons/bell';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import {
		describeNotificationFailure,
		expectNotificationChanges
	} from '$lib/notification-preview';
	import {
		groupNotificationsByDay,
		notificationPageCount,
		type Notification
	} from '$lib/notifications';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import { conferenceListUrl, notificationsUrl } from '$lib/urls';
	import NotificationDayGroup from './NotificationDayGroup.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is replaced
	// with fresh results every time the URL changes. `form` is what the last
	// action sent back, which here is only ever an error.
	let { data, form }: PageProps = $props();

	/*
		One instant form for the whole page (`$lib/instant-form.svelte.ts`):
		"Mark all as read" and every row's own buttons are sent through it, so a
		row shows as read, or disappears, the moment it is pressed, with no
		spinner. Presses queue, and one that fails goes back with a toast.
		`use:enhance` in the markup hands a form over; without JavaScript every
		form posts and reloads as before.
	*/
	const notificationForm = createInstantForm<RowChange<Notification>[]>({
		describeFailure: describeNotificationFailure
	});

	/** What a press will change, worked out from the rows on screen at the moment of the press. */
	function expectPress(input: InstantSubmitInput): RowChange<Notification>[] {
		return expectNotificationChanges(input, data.rows);
	}

	const submitNotificationPress = notificationForm.submitExpecting(expectPress);

	// `$derived` works these out again whenever the results, or the presses
	// still on their way, change.
	const previewedRows = $derived(rowsAfterPresses(data.rows, notificationForm.presses));
	const days = $derived(groupNotificationsByDay(previewedRows, data.now));
	const pageCount = $derived(notificationPageCount(data.total));
</script>

<svelte:head>
	<title>Notifications · MUNMeet</title>
</svelte:head>

<!-- The list is easiest to read narrow, so the page keeps it to 720px. -->
<div class="mx-auto flex max-w-180 flex-col gap-6">
	<PageHeader title="Notifications">
		<!-- A real form, so marking everything read works with no JavaScript. -->
		<form method="post" action="?/markAllRead" use:enhance={submitNotificationPress}>
			<Button label="Mark all as read" variant="secondary" />
		</form>
	</PageHeader>

	{#if form?.message}
		<Notice tone="error">{form.message}</Notice>
	{/if}

	{#if data.rows.length === 0}
		<EmptyState
			icon={Bell}
			title="No notifications yet."
			description="Decisions, seat allocations, invoices and announcements will show up here."
			actionLabel="Browse conferences"
			actionHref={conferenceListUrl()}
		/>
	{:else}
		{#each days as day (day.day)}
			<NotificationDayGroup {day} now={data.now} onSubmit={submitNotificationPress} />
		{/each}

		<Pagination page={data.page} {pageCount} hrefForPage={notificationsUrl} />
	{/if}
</div>
