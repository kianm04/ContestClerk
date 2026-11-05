<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import BackLink from '$lib/components/manage/BackLink.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import { roleCountLine } from '$lib/roles';
	import { manageDeleteRoleUrl, manageRolesUrl, manageRoleUrl } from '$lib/urls';
	import RoleForm from '../RoleForm.svelte';
	import DeleteRoleDialog from './DeleteRoleDialog.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned. `form` is what `save` or `delete`
	// answered when it refused; one that worked redirects instead.
	let { data, form }: PageProps = $props();

	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});
	const slug = $derived(data.conference.slug);
</script>

<svelte:head>
	<title>{data.role.name} · Roles · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="lg:mb-2">
	<BackLink href={manageRolesUrl(slug)} label="Roles" />
</div>

<ManageHeader
	title={data.role.name}
	summary={roleCountLine(data.role.memberCount, data.role.invitationCount)}
/>

<div class="flex flex-col gap-8">
	{#if form?.message}
		<Notice tone="error">{form.message}</Notice>
	{/if}

	<RoleForm
		{values}
		{errors}
		mine={data.mine}
		action="?/save"
		submitLabel="Save changes"
		deleteHref={manageDeleteRoleUrl(slug, data.role.id)}
		deleteRefusal={data.deleteRefusal}
	/>
</div>

{#if data.isDeleteOpen}
	<DeleteRoleDialog roleName={data.role.name} closeHref={manageRoleUrl(slug, data.role.id)} />
{/if}
