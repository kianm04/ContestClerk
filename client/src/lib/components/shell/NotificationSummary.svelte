<script lang="ts">
	import { formatRelativeTime } from '$lib/dates';
	import { NOTIFICATION_TIME_ZONE, type Notification } from '$lib/notifications';

	// What a notification row says, inside its open button: the unread dot, the
	// title, the body and when it came. `NotificationRow` owns the form.
	type Props = {
		notification: Notification;
		/** The moment the page was built, for "2 hours ago". */
		now: Date;
		/**
		 * The bell dropdown's smaller version (Trello 1txzWHCK): a small title
		 * cut at two lines and no body.
		 */
		isCompact: boolean;
	};

	let { notification, now, isCompact }: Props = $props();

	// `$derived` works these out again whenever the notification changes.
	const isUnread = $derived(notification.readAt === null);
	const relativeTime = $derived(
		formatRelativeTime(notification.createdAt, now, NOTIFICATION_TIME_ZONE)
	);

	// The title is bold only while unread, so the weight says it as well as the dot.
	const titleWeight = $derived(isUnread ? 'font-semibold' : 'font-normal');

	// `line-clamp-2` stops a long title after two lines with an ellipsis.
	const titleSize = $derived(isCompact ? 'line-clamp-2 text-small' : 'text-h3');
</script>

<span class="min-w-0 flex-1">
	<span class="flex items-start gap-2">
		{#if isUnread}
			<!-- Colour is never the only signal, so the dot says what it means too. -->
			<span class="mt-1.5 size-2 shrink-0 rounded-full bg-ring" aria-hidden="true"></span>
			<span class="sr-only">Unread.</span>
		{/if}

		<span class="text-foreground {titleSize} {titleWeight}">{notification.title}</span>
	</span>

	{#if isCompact}
		<span class="flex min-w-0 gap-1 text-small text-muted-foreground">
			<span class="shrink-0">{relativeTime}</span>
			{#if notification.conferenceName}
				<span aria-hidden="true">·</span>
				<span class="truncate">{notification.conferenceName}</span>
			{/if}
		</span>
	{:else}
		{#if notification.body}
			<!-- `truncate` keeps the body to one line with an ellipsis at the end. -->
			<span class="mt-0.5 block truncate text-body text-muted-foreground">{notification.body}</span>
		{/if}

		<span class="mt-1 flex flex-wrap gap-1 text-small text-muted-foreground">
			<span>{relativeTime}</span>
			{#if notification.conferenceName}
				<span aria-hidden="true">·</span>
				<span>{notification.conferenceName}</span>
			{/if}
		</span>
	{/if}
</span>
