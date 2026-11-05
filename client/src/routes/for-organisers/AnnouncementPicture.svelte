<script lang="ts">
	import AnnouncementPictureEmail from './AnnouncementPictureEmail.svelte';
	import AnnouncementPictureForm from './AnnouncementPictureForm.svelte';
	import AnnouncementPictureNotifications from './AnnouncementPictureNotifications.svelte';
</script>

<!--
	The picture for "The weeks before": an announcement being written, and the
	two places it lands, a delegate's notifications and their email.

	From `md` up the three cards are placed by hand on a stage of fixed height:
	the form at the top left, the notifications over its right edge, the email
	over its lower right corner. On a phone they stack, each tucked a little
	under the one above. Later cards are drawn over earlier ones.

	The picture is a drawing of the product, so it is hidden from screen
	readers and nothing in it can be pressed; the sentence before it says what
	it shows.
-->
<p class="sr-only">
	An example of an announcement to the Human Rights Council, reaching 29 people, arriving at the top
	of a delegate's notifications and in their email.
</p>

<div aria-hidden="true" class="relative flex flex-col text-small text-ink-900 md:h-[28.75rem]">
	<AnnouncementPictureForm />
	<AnnouncementPictureNotifications />
	<AnnouncementPictureEmail />
</div>
