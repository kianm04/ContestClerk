<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import CommitteeCell from './CommitteeCell.svelte';
	import CommitteeRowLink from './CommitteeRowLink.svelte';

	type Props = {
		/** The names of the committee's chairs, in the order the server sent them. */
		chairNames: string[];
		/** The committee's full name, for the "Invite" link's name on a screen reader. */
		committeeName: string;
		/** The committee's editor, where its Chairs section invites chairs. */
		editorUrl: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { chairNames, committeeName, editorUrl }: Props = $props();
</script>

<!-- The chairs of one committee row, or an "Invite" link to the editor when it has none yet. -->
<CommitteeCell label="Chairs:">
	{#if chairNames.length > 0}
		{chairNames.join(', ')}
	{:else}
		<span class="text-muted-foreground">None yet ·</span>
		<CommitteeRowLink
			href={editorUrl}
			label="Invite"
			accessibleName="Invite a chair to {committeeName}"
		/>
	{/if}
</CommitteeCell>
