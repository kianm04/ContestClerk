<script lang="ts">
	import type { RoleTableRow } from '$lib/roles';
	import { roleScopeWords } from '$lib/team-access';
	import RoleMoveForm from './RoleMoveForm.svelte';
	import RoleName from './RoleName.svelte';

	type Props = {
		role: RoleTableRow;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { role, conferenceSlug }: Props = $props();

	/** The meta line: scope, how many hold it, and whether it is public. */
	const metaLine = $derived(
		[
			roleScopeWords(role.scope),
			role.memberCount === 1 ? '1 member' : `${role.memberCount} members`,
			role.isPublic ? 'Shown on team page' : ''
		]
			.filter((part) => part !== '')
			.join(' · ')
	);
</script>

<!-- One role as a stacked row on a phone, where the table's columns do not fit. -->
<div class="flex min-h-11 items-center justify-between gap-3 border-b border-border py-3">
	<div class="min-w-0">
		<p class="text-body"><RoleName {role} {conferenceSlug} /></p>
		<p class="text-small text-muted-foreground">{metaLine}</p>
	</div>

	{#if role.canEdit}
		<RoleMoveForm {role} />
	{/if}
</div>
