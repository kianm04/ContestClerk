<script lang="ts">
	import { enhance } from '$app/forms';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		threadId: string;
		/** "Resolve" on an open thread, "Reopen" on a resolved one. */
		kind: 'resolve' | 'reopen';
	};

	let { threadId, kind }: Props = $props();

	// Posts without leaving the page, and reads the threads again after.
	const inPlace = createInPlaceForm();
</script>

<!--
	A thread's one action, drawn as a link at the end of its first line. It is
	a form so that it works without JavaScript; `use:enhance` sends it in
	place once the page's script runs.
-->
<form
	method="post"
	action={kind === 'resolve' ? '?/resolveThreads' : '?/reopenThread'}
	use:enhance={inPlace.submit}
	class="ml-auto"
>
	<input type="hidden" name="threadId" value={threadId} />
	<button
		type="submit"
		class="inline-flex min-h-11 items-center text-caption text-link hover:underline disabled:opacity-50 lg:min-h-5"
		disabled={inPlace.isBusy}
	>
		{kind === 'resolve' ? 'Resolve' : 'Reopen'}
	</button>
</form>
