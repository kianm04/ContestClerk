<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import type { CommitteeSession } from '$lib/chair-room';
	import { statusLabel } from '$lib/status';
	import { chairSessionNotesUrl } from '$lib/urls';

	type Props = {
		/** Every session of the committee, newest first, ended ones too. */
		sessions: CommitteeSession[];
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { sessions, conferenceSlug, committeeSlug }: Props = $props();
</script>

<!-- The Chair Notes written in the room, one page for each session (T130). -->
<section aria-labelledby="session-notes-heading">
	<h2 id="session-notes-heading" class="mb-2 text-h3 font-semibold">Session notes</h2>

	{#if sessions.length === 0}
		<p class="text-body text-ink-600">Chair Notes appear here once a session has started.</p>
	{:else}
		<ul class="flex flex-wrap gap-2">
			<!-- The `(session.id)` key lets Svelte reuse list items instead of rebuilding them. -->
			{#each sessions as session (session.id)}
				<li>
					<a
						href={chairSessionNotesUrl(conferenceSlug, committeeSlug, session.id)}
						class="flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 text-body hover:bg-neutral-100"
					>
						<FileText size={18} strokeWidth={1.75} aria-hidden="true" />
						{session.name}
						<span class="text-small text-ink-600">
							{statusLabel('session_status', session.status)}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
