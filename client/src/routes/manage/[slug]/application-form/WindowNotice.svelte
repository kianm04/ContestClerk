<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { applicationWindowNotice } from '$lib/application-form-settings';
	import type { Conference } from '$lib/conferences';

	type Props = {
		conference: Conference;
		/** The moment `load` drew the page, as an ISO string. */
		now: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { conference, now }: Props = $props();

	/*
		Where the conference stands between its opening and closing times. The
		moment comes from `load` rather than from `new Date()` here, because the
		server and the browser would each read a different one and Svelte would
		report the two drawings as a mismatch. `$derived` works it out again
		whenever the props change.
	*/
	const notice = $derived(applicationWindowNotice(conference, new Date(now)));
</script>

<!-- Only once the conference is public: a draft takes no applications yet, and
	while it is one the setup steps say what is left to do instead. -->
{#if conference.status !== 'draft'}
	<Notice tone={notice.tone} title={notice.title}>
		{#if notice.text}
			<p>{notice.text}</p>
		{/if}
	</Notice>
{/if}
