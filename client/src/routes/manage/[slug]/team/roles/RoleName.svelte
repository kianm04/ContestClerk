<script lang="ts">
	import type { RoleTableRow } from '$lib/roles';
	import { manageRoleUrl } from '$lib/urls';

	type Props = {
		role: RoleTableRow;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { role, conferenceSlug }: Props = $props();
</script>

<!--
	A role the reader may change links to its editor. One they may not is
	plain words with the reason beside it, such as "Above your role".
-->
{#if role.canEdit}
	<a href={manageRoleUrl(conferenceSlug, role.id)} class="font-medium text-link">{role.name}</a>
{:else}
	<span class="font-medium text-foreground">{role.name}</span>
	<span class="ml-2 text-small text-muted-foreground">{role.note}</span>
{/if}
