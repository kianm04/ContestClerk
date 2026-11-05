<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PersonRow from '$lib/components/PersonRow.svelte';
	import {
		NO_MEMBERS_YET_NOTICE,
		memberMetaItems,
		memberSeatSentence
	} from '$lib/delegation-review';
	import type { DelegationMember } from '$lib/delegations';
	import type { PrivateDetailsAccess } from '$lib/private-details';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		/** Everybody in the delegation, heads first. */
		members: DelegationMember[];
		/**
		 * What "now" is, for working out each member's age.
		 *
		 * It comes from `load` rather than from `new Date()` here so that the
		 * server and the browser draw the same number, and so that a test can fix
		 * the day it runs on.
		 */
		now: Date;
		/** Which of the private details the reader may see. */
		access: PrivateDetailsAccess;
	};

	let { members, now, access }: Props = $props();

	// The head is a member too, so a delegation nobody has joined still has one row.
	const hasOnlyTheHead = $derived(members.length <= 1);
</script>

<div class="flex flex-col gap-3">
	{#if hasOnlyTheHead}
		<Notice tone="info">{NO_MEMBERS_YET_NOTICE}</Notice>
	{/if}

	<ul class="flex flex-col gap-4">
		<!-- The `(member.userId)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each members as member (member.userId)}
			<li class="border-b border-line pb-4 last:border-b-0">
				<PersonRow
					name={member.fullName}
					subtitle={memberSeatSentence(member)}
					imagePath={member.avatarPath}
				>
					<Badge
						tone={statusBadgeTone('delegation_role', member.role)}
						label={statusLabel('delegation_role', member.role)}
					/>
				</PersonRow>

				<div class="mt-2">
					<KeyValueList items={memberMetaItems(member, now, access)} />
				</div>
			</li>
		{/each}
	</ul>
</div>
