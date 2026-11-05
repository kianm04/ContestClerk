<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Badge from '$lib/components/Badge.svelte';
	import { dayInTimezone, formatDateRange } from '$lib/dates';
	import { CONTROL_CLASSES } from '$lib/form-fields';
	import {
		isOrganizationInviteExpired,
		type OrganizationRole,
		type PendingOrganizationInvite
	} from '$lib/organizations';
	import { inviteUrl } from '$lib/urls';
	import RevokeInviteForm from './RevokeInviteForm.svelte';

	type Props = {
		/** The invitations nobody has accepted yet, newest first. */
		invites: PendingOrganizationInvite[];
		/**
		 * "Owner", "Admin", "Member": the words for each role. They are passed in
		 * rather than written out again here, so that a pending invitation and the
		 * member it becomes are never described in two different ways.
		 */
		roleLabels: Record<OrganizationRole, string>;
		/**
		 * The moment the page was built, as an ISO string. It comes from `load`
		 * rather than from `new Date()` here, because a component that asked the
		 * clock itself would say one thing on the server and another in the
		 * browser, which Svelte reports as a hydration mismatch.
		 */
		now: string;
		/**
		 * Where this site lives, such as `https://munmeet.app`. It comes from
		 * `load`, which reads it off the request, because each box below holds an
		 * address an admin copies into an email and a path on its own would be no
		 * use there.
		 */
		origin: string;
		/** The members table's instant form, handed to each row's "Revoke". */
		onRevoke: SubmitFunction;
	};

	// `$props()` takes the values the members table passed in.
	let { invites, roleLabels, now, origin, onRevoke }: Props = $props();

	/**
	 * "Admin · expires 3 Oct 2026", or "Admin · expired".
	 *
	 * The day is taken in UTC rather than in anybody's timezone, because an
	 * invitation belongs to no conference's clock: it simply runs out fourteen
	 * days after it was written. Handing `formatDateRange` the same day twice
	 * writes it as a single date, which is what `PendingInvites` on the team page
	 * does.
	 */
	function detailLine(invite: PendingOrganizationInvite, isExpired: boolean): string {
		const role = roleLabels[invite.role];

		if (isExpired) {
			return `${role} · expired`;
		}

		const day = dayInTimezone(new Date(invite.expiresAt), 'UTC');

		return `${role} · expires ${formatDateRange(day, day)}`;
	}

	/*
		Everything each row shows, worked out once per invitation rather than
		three times over inside the markup. `$derived` builds the list again
		whenever the invitations or the moment change, which is on every fresh
		load of the page.
	*/
	const rows = $derived(
		invites.map((invite) => {
			const isExpired = isOrganizationInviteExpired(invite, new Date(now));

			return {
				invite,
				isExpired,
				detail: detailLine(invite, isExpired),
				link: `${origin}${inviteUrl(invite.token)}`
			};
		})
	);
</script>

<div>
	<h3 class="text-h3">Pending invitations</h3>

	<!-- The empty line is a block beside the list rather than its `{:else}`,
		because an `{#if}` around the list would nest every row one level deeper
		for no gain; `StaffTable.svelte` is built the same way. -->
	{#if rows.length === 0}
		<p class="mt-2 text-body text-ink-600">No pending invitations.</p>
	{/if}

	<ul class="divide-y divide-line">
		<!-- The `(row.invite.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.invite.id)}
			<li class="flex flex-wrap items-center gap-3 py-3">
				<div class="min-w-0 flex-1 basis-48">
					<!-- `break-all` because an email address is one long word with
						nowhere to wrap, and without it the row is wider than a phone. -->
					<p class="text-body break-all">{row.invite.email}</p>
					<p class="text-small text-ink-600">{row.detail}</p>
				</div>

				{#if row.isExpired}
					<Badge tone="warning" label="Expired" />
				{/if}

				<!-- A wrapping `<label>` names the box without an `id`, which matters
					here because every row would otherwise want the same one. Email
					delivery is Phase 2, so the admin copies this address by hand. -->
				<label class="min-w-56 flex-1">
					<span class="sr-only">Invitation link for {row.invite.email}</span>
					<input readonly value={row.link} class={CONTROL_CLASSES} />
				</label>

				<RevokeInviteForm inviteId={row.invite.id} onSubmit={onRevoke} />
			</li>
		{/each}
	</ul>
</div>
