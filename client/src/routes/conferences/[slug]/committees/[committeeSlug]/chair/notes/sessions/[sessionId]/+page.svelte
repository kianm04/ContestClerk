<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SessionNotesPanel from '$lib/components/session-notes/SessionNotesPanel.svelte';
	import { readNotesDraft } from '$lib/session-notes';
	import { statusLabel } from '$lib/status';
	import { chairNotesUrl } from '$lib/urls';
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`. `form` is what a refused Save of the
	// notes sent back without JavaScript.
	let { data, form }: PageProps = $props();

	const subtitle = $derived(
		`${statusLabel('session_status', data.session.status)} · Private to chairs and organisers`
	);
</script>

<div class="flex flex-col gap-6">
	<a
		href={chairNotesUrl(data.conference.slug, data.committee.slug)}
		class="text-small text-brand-700 hover:underline"
	>
		‹ Back to notes
	</a>

	<PageHeader title={data.session.name} eyebrow="Session notes" {subtitle} />

	<!-- `{#key}` draws a fresh notes panel when the address moves to another session. -->
	{#key data.session.id}
		<SessionNotesPanel
			sessionId={data.session.id}
			notes={data.sessionNotes}
			draftText={readNotesDraft(form)}
			readerId={data.readerId}
		/>
	{/key}
</div>
