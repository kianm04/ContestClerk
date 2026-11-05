<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { LOGO_MARK_IMAGE_PATH } from '$lib/media';
	import { QUICK_QUIET_CLASSES } from '$lib/quick-session-classes';
	import { signedInHomeUrl } from '$lib/urls';

	type Props = {
		/** The page's heading: "Run a quick session", "Edit delegations · Thursday practice". */
		title: string;
		/** Where "Cancel" leads: `/home`, or the chair room. */
		cancelHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, cancelHref }: Props = $props();
</script>

<!--
	The page's own top line, the height of the chair console's top bar: the
	MUNMeet mark, a thin divider, the page's heading and a quiet "Cancel" on
	the right. These pages draw no app header (the root layout leaves it out
	under `/quick`), so the mark is the way home.
-->
<header class="flex h-14 shrink-0 items-center gap-4 border-b border-line px-5 max-md:px-4">
	<a href={signedInHomeUrl()} aria-label="MUNMeet home" class="flex h-8 shrink-0 items-center">
		<img src={LOGO_MARK_IMAGE_PATH} alt="" class="h-7 w-auto" />
	</a>
	<span class="h-6 w-px shrink-0 bg-line" aria-hidden="true"></span>
	<h1 class="min-w-0 truncate text-body font-semibold">{title}</h1>
	<a href={cancelHref} class="ml-auto shrink-0 {QUICK_QUIET_CLASSES}">Cancel</a>
</header>
