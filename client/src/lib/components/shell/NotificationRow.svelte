<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	// `goto` moves to another page the way a link does, without reloading the
	// app. `preloadData` fetches that page's data ahead of time, as every link
	// on the site does under the pointer (`data-sveltekit-preload-data` in
	// `app.html`), so the move is instant once it comes.
	import { goto, preloadData } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { openedNotificationPath } from '$lib/notification-preview';
	import type { Notification } from '$lib/notifications';
	import { notificationsUrl } from '$lib/urls';
	import NotificationSummary from './NotificationSummary.svelte';

	type Props = {
		notification: Notification;
		/**
		 * The moment the page was built. It comes from `load` rather than from
		 * `new Date()` here, so that the server and the browser write the same
		 * words and Svelte has nothing to complain about while it takes over.
		 */
		now: Date;
		/** The bell dropdown draws a shorter row: no body line and no "Remove". */
		isCompact?: boolean;
		/**
		 * Send the row's presses through this instead: the instant form of the
		 * `/notifications` page or of the bell (`$lib/instant-form.svelte.ts`),
		 * which shows the row read or removed the moment it is pressed, with no
		 * spinner. Left out, the row uses an in-place form of its own.
		 */
		onSubmit?: SubmitFunction;
	};

	let { notification, now, isCompact = false, onSubmit }: Props = $props();

	// Both actions live on `/notifications`, so a row in the bell dropdown posts
	// to that page from wherever it is shown.
	const OPEN_ACTION = `${notificationsUrl()}?/open`;
	const DELETE_ACTION = `${notificationsUrl()}?/delete`;

	// Sends the row's own press in the background and redraws the page without
	// reloading it (`$lib/in-place-form.svelte.ts`), when no `onSubmit` is given.
	// `use:enhance` in the markup hands the form over; without JavaScript it
	// posts and reloads as before.
	const inPlaceForm = createInPlaceForm();

	/** Whether the press posting to `formAction` shows a busy button: never on an instant form. */
	function isBusy(formAction: string): boolean {
		return !onSubmit && inPlaceForm.isSending(formAction);
	}

	// `$derived` works these out again whenever the notification changes.
	const destination = $derived(openedNotificationPath(notification));
	const isRemoving = $derived(isBusy(DELETE_ACTION));

	// The row's padding is the open button's, so a click anywhere on the row
	// opens it. A full row leaves room on the right for "Remove".
	const openButtonPadding = $derived(isCompact ? 'px-4 py-2' : 'py-3 pr-2 pl-4');

	/** Fetch the page the row leads to while the pointer is over it, as a link does. */
	function handleOpenPointerEnter() {
		if (destination !== null) void preloadData(destination);
	}

	/**
	 * Go where the row leads at once (Trello 1txzWHCK). The form is still sent,
	 * which marks the notification read in the background; its answer then
	 * only reads this page again (`isRedirectElsewhere` in the instant form).
	 */
	function handleOpenClick() {
		if (destination === null) return;

		// eslint-disable-next-line svelte/no-navigation-without-resolve -- an address stored with the notification, so there is no route for `resolve()` to build
		void goto(destination);
	}
</script>

<!--
	One row is one form, so the notification it is about travels in a hidden
	field and the two buttons only have to say which action they want. It is an
	ordinary form, so opening and removing both work with no JavaScript at all.

	Every row is white; an unread one says so with its dot and its bold title.
	The row turns pale blue under the pointer (`hover:`) and while a button
	inside it has the keyboard focus (`has-focus-visible:`), so a keyboard
	reader sees what the pointer shows.
-->
<form
	method="post"
	action={notificationsUrl()}
	class="flex items-start transition-colors duration-150 ease-out hover:bg-accent has-focus-visible:bg-accent motion-reduce:transition-none"
	use:enhance={onSubmit ?? inPlaceForm.submit}
>
	<input type="hidden" name="notificationId" value={notification.id} />

	<!--
		`min-w-0` lets the button be narrower than its words, which is what lets
		`truncate` cut a long body short instead of pushing a phone sideways.
		The focus ring is drawn inside the button (`-outline-offset-2`), because the
		list's rounded card cuts off anything drawn outside its rows.
	-->
	<button
		type="submit"
		formaction={OPEN_ACTION}
		aria-busy={isBusy(OPEN_ACTION) ? 'true' : undefined}
		class="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 text-left focus-visible:-outline-offset-2 {openButtonPadding}"
		onpointerenter={handleOpenPointerEnter}
		onclick={handleOpenClick}
	>
		<NotificationSummary {notification} {now} {isCompact} />
	</button>

	{#if !isCompact}
		<!-- `Button` has no busy state of its own, so the spinner goes inside it. -->
		<div class="py-1.5 pr-2">
			<Button
				type="submit"
				variant="ghost"
				formaction={DELETE_ACTION}
				disabled={isRemoving}
				class="h-11"
			>
				{#if isRemoving}
					<Spinner data-icon="inline-start" />
				{/if}
				Remove
			</Button>
		</div>
	{/if}
</form>
