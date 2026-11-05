<script lang="ts">
	import type { CommitteeSession } from '$lib/chair-room';
	import { chairMotionsSessionUrl } from '$lib/urls';

	type Props = {
		/** The committee's ended sessions, newest first. */
		sessions: CommitteeSession[];
		conferenceSlug: string;
		committeeSlug: string;
		/** The session on screen, which is not linked to itself. */
		shownSessionId: string | null;
	};

	let { sessions, conferenceSlug, committeeSlug, shownSessionId }: Props = $props();

	const linkedSessions = $derived(sessions.filter((session) => session.id !== shownSessionId));
</script>

<!-- Only the session record draws this: a link to every other ended session's record. -->
{#if linkedSessions.length > 0}
	<nav aria-labelledby="earlier-sessions-heading" class="flex flex-col gap-2">
		<h2 id="earlier-sessions-heading" class="text-h3">Earlier sessions</h2>
		<ul class="flex flex-wrap gap-x-4 gap-y-1">
			<!-- The `(session.id)` key lets Svelte reuse links instead of rebuilding them. -->
			{#each linkedSessions as session (session.id)}
				<li>
					<a
						href={chairMotionsSessionUrl(conferenceSlug, committeeSlug, session.id)}
						class="font-medium text-brand-700 underline"
					>
						{session.name}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
