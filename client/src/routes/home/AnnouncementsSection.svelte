<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { HomeAnnouncement, HomeLink } from '$lib/home';
	import AnnouncementRow from './AnnouncementRow.svelte';

	type Props = {
		/**
		 * The newest announcements across the reader's conferences, newest first
		 * and already cut to three by the server. The page leaves the section out
		 * when there are none.
		 */
		announcements: HomeAnnouncement[];
		/**
		 * "All announcements", from `announcementsLink` in `$lib/home-rows.ts`:
		 * set when every row is from one conference, `null` when the rows come
		 * from several and there is no one page to lead to.
		 */
		link: HomeLink | null;
		/** The moment the page was drawn, which turns each date into "3 days ago". */
		now: Date;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { announcements, link, now }: Props = $props();
</script>

<!--
	"Announcements" (`docs/home.md` section 3.6): a ruled list of
	`AnnouncementRow`s under the section's black rule. `?? undefined` turns "no
	link" from the `null` the page hands in into the `undefined` `ManageSection`
	expects.
-->
<ManageSection title="Announcements" link={link ?? undefined}>
	<ul>
		<!-- The `(announcement.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each announcements as announcement (announcement.id)}
			<AnnouncementRow {announcement} {now} />
		{/each}
	</ul>
</ManageSection>
