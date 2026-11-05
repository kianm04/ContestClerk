<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Dropdown, { type DropdownItem } from '$lib/components/Dropdown.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import { announcementMetaLine } from '$lib/announcement-meta';
	import { announcementPreview, type Announcement } from '$lib/announcements';
	import { manageAnnouncementsUrl } from '$lib/urls';

	type Props = {
		announcement: Announcement;
		/** The moment the page was drawn, for "3 hours ago". */
		now: Date;
		/** The conference's timezone, which dates are shown in. */
		timezone: string;
		conferenceSlug: string;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`), which shows
		 * pinning and deleting at once with no spinner (T142).
		 */
		onSubmit: SubmitFunction;
		/** False for one the reader may only read, which then shows no actions. */
		canChange: boolean;
	};

	let { announcement, now, timezone, conferenceSlug, onSubmit, canChange }: Props = $props();

	// `$derived` works this out again whenever the props change.
	const metaLine = $derived(announcementMetaLine(announcement, now, timezone));

	/*
		The menu posts "Pin" or "Unpin" with the announcement's id in the action's
		own address, because the menu is one small form shared by all its lines.
	*/
	const menuItems: DropdownItem[] = $derived([
		{ label: 'Edit', href: manageAnnouncementsUrl(conferenceSlug, announcement.id) },
		{
			label: announcement.isPinned ? 'Unpin' : 'Pin',
			formaction: `?/togglePin&announcementId=${announcement.id}`
		}
	]);
</script>

<!--
	One announcement on the page's white: the title with whom it went to, who
	wrote it and when under it, the actions on the right, and the start of the
	message below. `flex-wrap` drops the actions under the title on a phone.
-->
<article class="px-1 py-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<h3 class="text-body font-semibold text-foreground">{announcement.title}</h3>
			<p class="text-small text-muted-foreground">{metaLine}</p>
		</div>
		{#if canChange}
			<div class="flex items-center gap-2">
				<Dropdown
					label="Actions for {announcement.title}"
					icon={Ellipsis}
					items={menuItems}
					{onSubmit}
					isQuiet
				/>
				<!-- Delete sits beside the menu rather than in it: `ConfirmButton` is a
				form of its own, and a form cannot sit inside the menu's form. The id
				travels inside the dialog, which a closed dialog still sends, so no empty
				line above the button pushes it out of line with the menu (T137). It is a
				grey bin that turns red under the pointer; "Delete" is its name. -->
				<ConfirmButton
					label="Delete"
					confirmTitle="Delete this announcement?"
					confirmText="It disappears for everyone. Notifications already sent will say it was removed."
					formaction="?/delete"
					variant="quiet-danger"
					size="dense-sm"
					icon={Trash2}
					areFieldsInDialog
					{onSubmit}
				>
					<input type="hidden" name="announcementId" value={announcement.id} />
				</ConfirmButton>
			</div>
		{/if}
	</div>
	<div class="mt-2 max-w-[40rem] text-foreground">
		<ParagraphText text={announcementPreview(announcement.body)} />
	</div>
</article>
