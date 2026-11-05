<script lang="ts">
	import { contactEmailUrl, landingUrl, privacyUrl, termsUrl } from '$lib/urls';

	type Props = {
		/** The year in the copyright line. It comes from the page, not from the clock here. */
		year: number;
	};

	let { year }: Props = $props();

	/*
		Terms and Privacy are pages of ours, so `resolve()` checks them. Contact is
		a `mailto:` instead, because there is no contact page: writing to us is the
		whole of it, and `contactEmailUrl` builds that one address from the email
		address `$lib/urls` keeps.

		Every one of the four is 44px tall, which is the touch target
		docs/DESIGN.md asks of anything pressed. The row is four
		small links close together on a phone, so the padding that used to sit on
		the row around them now sits inside each of them, where a finger can
		actually land on it. That is what `LINK_CLASSES` below is for: written out
		once, because Tailwind reads class names out of this file and cannot follow
		a name that is glued together while the page runs.
	*/
	const LINK_CLASSES =
		'inline-flex min-h-11 items-center transition-colors duration-150 hover:text-foreground motion-reduce:transition-none';
</script>

<!--
	`print:hidden` leaves the footer off a printed page, such as a written paper
	saved as a PDF (T146). Like the top bar, it runs the full width of the
	window, with its words in line with the logo above.
-->
<footer class="border-t print:hidden">
	<div
		class="flex flex-wrap items-center gap-x-2 px-4 py-2 text-small text-muted-foreground md:px-6"
	>
		<a href={landingUrl()} class={LINK_CLASSES}>© {year} MUNMeet</a>
		<span aria-hidden="true">·</span>
		<a href={termsUrl()} class={LINK_CLASSES}>Terms</a>
		<span aria-hidden="true">·</span>
		<a href={privacyUrl()} class={LINK_CLASSES}>Privacy</a>
		<span aria-hidden="true">·</span>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- this is an email address, not a page of ours, so there is no route for `resolve()` to check it against -->
		<a href={contactEmailUrl()} class={LINK_CLASSES}>Contact</a>
	</div>
</footer>
