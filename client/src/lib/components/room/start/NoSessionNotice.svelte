<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** The live room, `chair`, which draws the lobby where a session is started. */
		roomHref: ResolvedPathname;
	};

	let { roomHref }: Props = $props();
</script>

<!--
	What the Mod, Unmod and Single speaker views show while no session runs:
	nothing can start, so there is no start form, only the way to the lobby.
-->
<section aria-labelledby="no-session" class="flex flex-col items-start gap-2 p-8 max-md:p-4">
	<h2 id="no-session" class="text-h3">No session is running.</h2>
	<a href={roomHref} class="font-medium text-brand-700 underline">Open the chair room</a>
</section>
