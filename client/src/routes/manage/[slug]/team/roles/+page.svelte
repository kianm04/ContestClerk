<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import BackLink from '$lib/components/manage/BackLink.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { manageNewRoleUrl, manageTeamUrl } from '$lib/urls';
	import RolesTable from './RolesTable.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned, with what the layout
	// above loaded. `form` is what `move` answered when it refused, and `null`
	// otherwise: a move that worked redirects instead.
	let { data, form }: PageProps = $props();

	const summary = $derived(data.roles.length === 1 ? '1 role' : `${data.roles.length} roles`);
</script>

<svelte:head>
	<title>Roles · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="lg:mb-2">
	<BackLink href={manageTeamUrl(data.conference.slug)} label="Team" />
</div>

<ManageHeader title="Roles" {summary}>
	<Button href={manageNewRoleUrl(data.conference.slug)} size="lg" class="max-lg:h-11">
		New role
	</Button>
</ManageHeader>

{#if form?.message}
	<Notice tone="error">{form.message}</Notice>
{/if}

<RolesTable roles={data.roles} conferenceSlug={data.conference.slug} />

<p class="mt-4 max-w-2xl text-small text-muted-foreground">
	A role higher in the list outranks those below it. Each person can give, change and order only the
	roles below their own highest one.
</p>
