<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { Notification } from '$lib/notifications';
	import { notificationsUrl } from '$lib/urls';
	import NotificationRow from './NotificationRow.svelte';

	// The bell's open panel: a header, the latest rows and "See all". The bell
	// itself (`NotificationBell`) owns the button, the dot and the presses.
	type Props = {
		/** The latest few, read or unread, newest first, with any presses already applied. */
		notifications: Notification[];
		/** Whether any are still unread; when none are, the header says so. */
		hasUnread: boolean;
		/** The moment the page was built, passed on to each row. */
		now: Date;
		/** The bell's instant form, passed straight through to each row. */
		onSubmit: SubmitFunction;
	};

	let { notifications, hasUnread, now, onSubmit }: Props = $props();
</script>

<!--
	The panel has no padding of its own, so the rows run edge to edge and the
	rules between them meet its edges.
-->
<div class="border-b px-4 py-3">
	<h2 class="font-display text-h2">Notifications</h2>

	{#if notifications.length > 0 && !hasUnread}
		<p class="text-small text-muted-foreground">No new notifications.</p>
	{/if}
</div>

{#if notifications.length === 0}
	<p class="px-4 py-3 text-body text-muted-foreground">No notifications yet.</p>
{:else}
	<!--
		Only the list scrolls, so the heading above and "See all" below stay
		in view. Its tallest is 32rem, or less on a short window, which leaves
		room for the top bar, the heading and "See all".
	-->
	<ul class="max-h-[min(32rem,calc(100dvh-12rem))] divide-y overflow-y-auto">
		<!-- The `(one.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each notifications as one (one.id)}
			<li>
				<NotificationRow notification={one} {now} isCompact {onSubmit} />
			</li>
		{/each}
	</ul>
{/if}

<!-- The ring is drawn inside the link, where the panel's rounded corner cannot cut it off. -->
<a
	href={notificationsUrl()}
	class="flex min-h-11 items-center border-t px-4 text-body text-brand-700 hover:underline focus-visible:-outline-offset-2"
>
	See all
</a>
