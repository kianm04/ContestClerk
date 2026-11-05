<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import {
		describePendingInviteFailure,
		expectPendingInviteRowChange
	} from '$lib/pending-invite-presses';
	import { pendingInviteDetailLine } from '$lib/pending-invite-line';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import { isInviteExpired, type PendingStaffInvite } from '$lib/team';
	import { inviteUrl } from '$lib/urls';
	import PendingInviteRow from './PendingInviteRow.svelte';

	type Props = {
		/** The invitations nobody has accepted yet. */
		invites: PendingStaffInvite[];
		/** The ones the reader may send again or revoke, from `mayChangeInvite`. */
		changeableInviteIds: string[];
		/**
		 * The moment the page was built, as an ISO string. It comes from `load`
		 * rather than from `new Date()` here, because a component that asked the
		 * clock itself would say one thing on the server and another in the
		 * browser, which Svelte reports as a hydration mismatch.
		 */
		now: string;
		/**
		 * Where this site lives, such as `https://munmeet.app`. It comes from
		 * `load`, which reads it off the request, because the box below holds an
		 * address an organiser copies into an email and a path on its own would be
		 * no use there.
		 */
		origin: string;
	};

	let { invites, changeableInviteIds, now, origin }: Props = $props();

	/*
		Revoking an invitation is fully worked out in the browser
		(`$lib/pending-invite-presses.ts`), so the row disappears at once instead
		of waiting for the server (T142). "Send again" changes nothing the reader
		can see, so it keeps its own in-place spinner below.
	*/
	const revokeChangesForm = createInstantForm<RowChange<PendingStaffInvite>[]>({
		describeFailure: describePendingInviteFailure
	});
	const submitRevokePress = revokeChangesForm.submitExpecting(expectPendingInviteRowChange);
	const shownInvites = $derived(rowsAfterPresses(invites, revokeChangesForm.presses));

	/*
		Everything each row shows, worked out once per invitation rather than three
		times over inside the markup. `$derived` builds the list again whenever the
		invitations or the moment change, which is on every fresh load of the page.
	*/
	const rows = $derived(
		shownInvites.map((invite) => {
			const isExpired = isInviteExpired(invite, new Date(now));

			return {
				invite,
				isExpired,
				mayChange: changeableInviteIds.includes(invite.id),
				detail: pendingInviteDetailLine(invite, isExpired),
				link: `${origin}${inviteUrl(invite.token)}`
			};
		})
	);

	/**
	 * Put one invitation link on the clipboard.
	 *
	 * `navigator.clipboard` is a browser API, so this only ever runs from a
	 * click and never while the page is being built on the server. With
	 * JavaScript switched off the button does nothing, which is why the box
	 * beside it is a real one the link can be selected and copied out of by hand.
	 */
	function handleCopyLink(link: string) {
		navigator.clipboard.writeText(link);
	}

	/*
		Sends whichever row's "Send again" was pressed in the background and
		redraws the page without reloading it (`$lib/in-place-form.svelte.ts`);
		without JavaScript the form still posts and reloads the page as before.
		Every row shares this one instance, because only one form on the page can
		ever be mid-submit at a time, the way `ChairsPanel.svelte`'s per-chair
		remove forms share one instance.
	*/
	const resendForm = createInPlaceForm();
</script>

<ManageSection title="Waiting to accept">
	<ul>
		<!-- The `(row.invite.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.invite.id)}
			<PendingInviteRow
				invite={row.invite}
				isExpired={row.isExpired}
				mayChange={row.mayChange}
				detail={row.detail}
				link={row.link}
				onCopyLink={handleCopyLink}
				{resendForm}
				onRevoke={submitRevokePress}
			/>
		{/each}
	</ul>
</ManageSection>
