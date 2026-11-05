<script lang="ts">
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import DangerZone from '$lib/components/DangerZone.svelte';
	import Notice from '$lib/components/Notice.svelte';

	/*
		Named `OrganizationDangerZone` rather than `DangerZone` so that it does not
		collide with the shared component it uses, which draws the card with the
		red border. `ConferenceDangerZone.svelte` in `manage/[slug]/` is named the
		same way for the same reason.
	*/

	type Props = {
		/** The organisation this deletes. Its name is in the question. */
		organizationName: string;
		/** How many conferences it still runs. Any at all refuse the deletion. */
		conferenceCount: number;
		/** Only an owner may delete an organisation, so only an owner sees this. */
		isOwner: boolean;
	};

	// `$props()` takes the values the page passed in.
	let { organizationName, conferenceCount, isOwner }: Props = $props();

	/*
		Why the deletion is refused, in the same words the `deleteOrganization`
		action uses when somebody posts to it anyway, so the page and the server
		never say two different things. `$derived` writes it again whenever the
		count changes, which is after every action on this page.
	*/
	const refusalLine = $derived(
		conferenceCount === 1
			? 'One conference still belongs to this organisation. Delete or move its conferences first.'
			: `${conferenceCount} conferences still belong to this organisation. Delete or move its conferences first.`
	);
</script>

{#if isOwner}
	<!-- `DangerZone` is the card with the red border. Its children sit in a row,
		so everything here goes in one full-width column inside it. -->
	<DangerZone>
		<div class="flex w-full flex-col gap-3">
			<p class="text-body text-ink-600">
				This removes the organisation, its members and its Stripe connection. This cannot be undone.
			</p>

			{#if conferenceCount > 0}
				<Notice tone="warning">{refusalLine}</Notice>
			{:else}
				<ConfirmButton
					label="Delete organisation"
					confirmTitle="Delete {organizationName}?"
					confirmText="This removes the organisation, its members and its Stripe connection. This cannot be undone."
					formaction="?/deleteOrganization"
				/>
			{/if}
		</div>
	</DangerZone>
{/if}
