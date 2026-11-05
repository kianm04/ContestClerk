<script lang="ts">
	import { SAMPLE_NOTIFICATIONS } from '$lib/organiser-fees';
</script>

<!--
	A delegate's notifications on a phone, newest first, with the announcement
	at the top. An unread row has a light blue dot and a heavier title; a read
	one keeps the dot's space so the titles still line up.

	On a phone it is tucked under the form's lower edge at the right; from `md`
	up it overlaps the form's right edge. The `(notification.title)` key in
	`{#each}` tells Svelte which row is which. A `class={[…]}` list drops any
	entry that is false, so `isUnread && '…'` adds the class only when unread.
-->
<div
	class="relative -mt-4 mr-2 flex w-[15.5rem] flex-col self-end rounded-[1.375rem] border border-line bg-surface px-3.5 pt-2 pb-3.5 shadow-card md:absolute md:top-7 md:right-0 md:m-0 md:w-[15rem]"
>
	<span class="h-1 w-9 self-center rounded-full bg-line"></span>
	<span class="mt-3 pb-2 font-medium">Notifications</span>
	{#each SAMPLE_NOTIFICATIONS as notification (notification.title)}
		<div class="flex gap-2 border-t border-neutral-100 pt-[0.5625rem] pb-[0.5625rem] last:pb-0">
			<span
				class={[
					'mt-[0.3125rem] size-1.5 flex-none rounded-full',
					notification.isUnread && 'bg-brand-500'
				]}
			></span>
			<span class="flex flex-col text-caption">
				<span class={[notification.isUnread && 'font-medium']}>{notification.title}</span>
				<span class="mt-0.5 text-ink-600">{notification.meta}</span>
			</span>
		</div>
	{/each}
</div>
