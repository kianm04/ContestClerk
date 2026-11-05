<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import {
		EMPTY_INVITE_MEMBER,
		isOrganizationAdmin,
		type OrganizationDetailsValues,
		type OrganizationSettings
	} from '$lib/organizations';
	import { organizationUrl } from '$lib/urls';
	import MembersTable from './MembersTable.svelte';
	import OrganizationDangerZone from './OrganizationDangerZone.svelte';
	import OrganizationDetailsForm from './OrganizationDetailsForm.svelte';
	import StripeCard from './StripeCard.svelte';
	// `./$types` holds the types SvelteKit generates for this one route, so
	// `data` and `form` below are exactly what this page's own server file deals
	// in.
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is read again
	// after every action on this page, so the lists below are never stale.
	//
	// `form` is what the last action returned. Most of them redirect when they
	// work, so `form` is usually a refusal — but `invite` stays on the page to
	// hand back the link it just made.
	let { data, form }: PageProps = $props();

	/**
	 * The saved organisation as the details form holds it: every field is text,
	 * because text is all an `<input>` can carry, and a column holding nothing
	 * becomes an empty box rather than the word "null".
	 */
	function savedDetails(organization: OrganizationSettings): OrganizationDetailsValues {
		return {
			name: organization.name,
			description: organization.description ?? '',
			countryCode: organization.countryCode ?? '',
			websiteUrl: organization.websiteUrl ?? ''
		};
	}

	// `$derived` works each of these out again whenever `data` or `form` changes.
	const isAdmin = $derived(isOrganizationAdmin(data.myRole));
	const failureMessage = $derived(form?.message ?? form?.inviteMessage ?? null);

	// A refused save sends back everything that was typed, so nothing is lost;
	// an action about something else sends back `null`, and the boxes go back to
	// what is saved.
	const detailsValues = $derived(form?.detailsValues ?? savedDetails(data.organization));
	const inviteValues = $derived(form?.inviteValues ?? EMPTY_INVITE_MEMBER);

	/*
		`organization-settings.md`: on a phone the two columns stack with Payments
		first while Stripe is not connected, because connecting it is the one
		thing that still needs doing. Tailwind's `order-*` moves the card on the
		screen without moving it in the HTML, so the source still reads details
		first, and `lg:order-none` puts it back beside the details on a wide one.
	*/
	const paymentsOrder = $derived(
		data.organization.stripeState === 'connected' ? '' : 'order-first lg:order-none'
	);
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>{data.organization.name} · MUNMeet</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader eyebrow="Organisation" title={data.organization.name}>
		<Button
			label="View public page"
			variant="secondary"
			href={organizationUrl(data.organization.slug)}
		/>
	</PageHeader>

	{#if failureMessage}
		<Notice tone="error">{failureMessage}</Notice>
	{/if}

	<!-- Email delivery is Phase 2, so a new invitation hands the admin its link
		to send on by hand. The same link is in the pending list below. -->
	{#if form?.createdInvite}
		<Notice tone="success" title="Copy this link and send it to {form.createdInvite.email}">
			<p class="mt-1 font-mono text-small break-all">{form.createdInvite.link}</p>
		</Notice>
	{/if}

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="lg:col-span-2">
			<OrganizationDetailsForm
				organization={data.organization}
				values={detailsValues}
				errors={form?.detailsErrors ?? {}}
				{isAdmin}
			/>
		</div>

		<div class={paymentsOrder}>
			<StripeCard
				stripeState={data.organization.stripeState}
				{isAdmin}
				isStripeConfigured={data.isStripeConfigured}
			/>
		</div>
	</div>

	<MembersTable
		members={data.members}
		pendingInvites={data.pendingInvites}
		organizationName={data.organization.name}
		myRole={data.myRole}
		now={data.now}
		origin={data.origin}
		{inviteValues}
		inviteErrors={form?.inviteErrors ?? {}}
	/>

	<OrganizationDangerZone
		organizationName={data.organization.name}
		conferenceCount={data.conferenceCount}
		isOwner={data.myRole === 'owner'}
	/>
</div>
