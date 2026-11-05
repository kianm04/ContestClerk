<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import NotificationRow from '$lib/components/shell/NotificationRow.svelte';
	import type { NotificationDay } from '$lib/notifications';

	type Props = {
		/** One day's notifications, under the heading worked out for that day. */
		day: NotificationDay;
		/** The moment the page was built, passed on to each row. */
		now: Date;
		/** Passed straight through to each row; see `NotificationRow`'s own prop of the same name. */
		onSubmit?: SubmitFunction;
	};

	let { day, now, onSubmit }: Props = $props();
</script>

<!-- `aria-label` names the section, because a `<section>` is only a landmark when it has a name. -->
<section aria-label={day.label}>
	<h2 class="mb-2 text-label text-ink-600 uppercase">{day.label}</h2>

	<!--
		The day's rows are one card, with a rule between each row and the next
		(`divide-y`) rather than a gap, so it is clear where one ends. `overflow-hidden`
		keeps the first and last rows' colour inside the card's rounded corners.
	-->
	<ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line">
		<!-- The `(notification.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each day.notifications as notification (notification.id)}
			<li>
				<NotificationRow {notification} {now} {onSubmit} />
			</li>
		{/each}
	</ul>
</section>
