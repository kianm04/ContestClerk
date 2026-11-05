<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import BackLink from '$lib/components/manage/BackLink.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import { manageRolesUrl } from '$lib/urls';
	import RoleForm from '../RoleForm.svelte';
	import StartFromForm from './StartFromForm.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned. `form` is what `create` answered when it
	// refused, holding what was typed; a role that was created redirects.
	let { data, form }: PageProps = $props();

	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});
</script>

<svelte:head>
	<title>New role · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="lg:mb-2">
	<BackLink href={manageRolesUrl(data.conference.slug)} label="Roles" />
</div>

<ManageHeader title="New role" />

<div class="flex flex-col gap-8">
	{#if form?.message}
		<Notice tone="error">{form.message}</Notice>
	{/if}

	<StartFromForm roles={data.startFromRoles} fromRoleId={data.fromRoleId} />

	<RoleForm {values} {errors} mine={data.mine} action="?/create" submitLabel="Create role" />
</div>
