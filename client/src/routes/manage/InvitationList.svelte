<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { PendingInvite } from '$lib/manage';
	import InvitationRow from './InvitationRow.svelte';

	type Props = {
		/** Invitations waiting for the reader. Never empty: the page leaves the section out. */
		invites: PendingInvite[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { invites }: Props = $props();
</script>

<ManageSection title="Invitations">
	<ul>
		<!-- The row's id tells one invitation from another. The key lets Svelte
			reuse the rows. -->
		{#each invites as invite (invite.id)}
			<InvitationRow {invite} />
		{/each}
	</ul>
</ManageSection>
