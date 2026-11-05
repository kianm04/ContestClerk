<script lang="ts">
	import type { CommitteeSession } from '$lib/chair-room';
	import EarlierSessions from './EarlierSessions.svelte';
	import SessionNotice from './SessionNotice.svelte';

	type Props = {
		/** The committee's ended sessions, newest first. */
		earlierSessions: CommitteeSession[];
		/** The ended session on screen. */
		shownSessionId: string;
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { earlierSessions, shownSessionId, conferenceSlug, committeeSlug }: Props = $props();
</script>

<!--
	The left column of an ended session's record (`?session=`): read-only, so
	no motion to decide and no composer; the notice, and the other ended
	sessions' records. Its motions are the lists in the right column.
-->
<div class="flex flex-col gap-6">
	<SessionNotice state="ended" {conferenceSlug} {committeeSlug} />
	<EarlierSessions sessions={earlierSessions} {conferenceSlug} {committeeSlug} {shownSessionId} />
</div>
