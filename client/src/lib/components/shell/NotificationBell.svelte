<script lang="ts">
	import Notification from 'carbon-icons-svelte/lib/Notification.svelte';
	// `afterNavigate` runs the function it is given after every navigation from
	// one page to another, once the new page is on screen.
	import { afterNavigate } from '$app/navigation';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import {
		describeNotificationFailure,
		expectNotificationChanges,
		unreadCountAfterPresses
	} from '$lib/notification-preview';
	import type { Notification as NotificationRecord } from '$lib/notifications';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import { cn } from '$lib/utils';
	import NotificationPanel from './NotificationPanel.svelte';

	type Props = {
		/** The latest few, read or unread, newest first. */
		notifications: NotificationRecord[];
		/** How many are still unread. The dot on the bell shows that there are any. */
		unreadCount: number;
		/** The moment the page was built, passed on to each row. */
		now: Date;
	};

	let { notifications, unreadCount, now }: Props = $props();

	/*
		Opening a row is worked out in the browser (`$lib/notification-preview.ts`,
		shared with `/notifications`), so it shows as read at once (T142). The
		bell has no "Remove" or "Mark all as read", so this only carries "open".
	*/
	const bellNotificationForm = createInstantForm<RowChange<NotificationRecord>[]>({
		describeFailure: describeNotificationFailure
	});

	/** What a press will change, worked out from the rows shown in the bell. */
	function expectPress(input: InstantSubmitInput): RowChange<NotificationRecord>[] {
		return expectNotificationChanges(input, notifications);
	}

	const submitNotificationPress = bellNotificationForm.submitExpecting(expectPress);

	// `$derived` works this out again whenever the notifications or the presses
	// still on their way change.
	const previewedNotifications = $derived(
		rowsAfterPresses(notifications, bellNotificationForm.presses)
	);

	// An opened row comes off the count at once too, rather than when the page
	// is read again after the server has answered (Trello 1txzWHCK).
	const shownUnreadCount = $derived(
		unreadCountAfterPresses(unreadCount, notifications, previewedNotifications)
	);
	const hasUnread = $derived(shownUnreadCount > 0);
	const label = $derived(hasUnread ? `Notifications, ${shownUnreadCount} unread` : 'Notifications');

	// `bind:open` below keeps this in step with the panel, both ways.
	let isOpen = $state(false);

	// The bell sits in the top bar, which stays on screen from page to page, so
	// a row opened from the panel would leave the panel open over the page it
	// led to.
	afterNavigate(() => {
		isOpen = false;
	});
</script>

<!--
	The panel opens from the bell and needs JavaScript to do so. A light blue
	dot on the bell says something is unread; how many is in the button's name,
	for a screen reader. The trigger draws its own `<button>`, so the button's
	look is passed in as a class.
-->
<Popover.Root bind:open={isOpen}>
	<Popover.Trigger
		aria-label={label}
		class={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'relative size-11')}
	>
		<Notification size={20} class="size-5" />

		{#if hasUnread}
			<span aria-hidden="true" class="absolute top-2.5 right-2.5 size-2 rounded-full bg-ring"
			></span>
		{/if}
	</Popover.Trigger>

	<!-- As wide as 24rem, or the window less 16px each side on a phone. -->
	<Popover.Content align="end" class="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
		<NotificationPanel
			notifications={previewedNotifications}
			{hasUnread}
			{now}
			onSubmit={submitNotificationPress}
		/>
	</Popover.Content>
</Popover.Root>
