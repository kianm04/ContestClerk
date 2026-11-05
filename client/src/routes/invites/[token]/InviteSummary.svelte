<script lang="ts">
	import { invitationSentence, type InviteView } from '$lib/invites';

	type Props = {
		/**
		 * An open invitation, as `get_invite` answers one. The page draws this
		 * only while the status is `pending`, which is the one time the names and
		 * the address are there to show.
		 */
		invite: InviteView;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { invite }: Props = $props();
</script>

<p class="text-body text-ink-900">{invitationSentence(invite)}</p>

{#if invite.committeeName}
	<p class="mt-1 text-body text-ink-600">Committee: {invite.committeeName}</p>
{/if}

<!-- Only somebody signed in reaches this page, so the address is shown to the
	person it may belong to and never to a visitor holding the link. -->
{#if invite.email}
	<p class="mt-1 text-small text-ink-600">Invite sent to {invite.email}</p>
{/if}
