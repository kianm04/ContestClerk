<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import AvatarForm from './AvatarForm.svelte';
	import PrivateDetailsForm from './PrivateDetailsForm.svelte';
	import PublicFieldsForm from './PublicFieldsForm.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder.
	// `data` is whatever `load` in `+page.server.ts` returned, and it is read
	// again after every action on this page. `form` is what the last action
	// returned, and is `null` until one of them has failed.
	let { data, form }: PageProps = $props();

	// The three forms are on the one page and share the one `form` result, so
	// each of these asks whether that result belongs to its own form first.
	// Without the question a failed "Save profile" would put its messages under
	// the details form as well and blank everything typed into it; `/settings`
	// does the same thing with its `card` field. A form that did not fail simply
	// keeps what `load` gave it. `$derived` works all five out again after
	// every submit.
	const values = $derived(form?.form === 'public' ? form.values : data.values);
	const errors = $derived(form?.form === 'public' ? form.errors : {});
	const detailsValues = $derived(
		form?.form === 'private' ? form.detailsValues : data.detailsValues
	);
	const detailsErrors = $derived(form?.form === 'private' ? form.detailsErrors : {});
	// The avatar form has no values of its own to keep: it shows what `load`
	// read, and a file box cannot be filled in again from here.
	const avatarErrors = $derived(form?.form === 'avatar' ? form.avatarErrors : {});
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Edit profile · MUNMeet</title>
</svelte:head>

<div class="mx-auto max-w-[640px]">
	<div class="mb-6">
		<PageHeader title="Edit profile" />
	</div>

	<!--
		The three forms the page spec draws, stacked: the photo, then the public
		fields, then the private details. Each is its own `<form>` posting to its
		own action, so any one of them can be saved on its own.
	-->
	<div class="flex flex-col gap-6">
		<Card>
			<AvatarForm
				fullName={data.avatar.fullName}
				avatarPath={data.avatar.avatarPath}
				errors={avatarErrors}
			/>
		</Card>

		<Card>
			<PublicFieldsForm {values} {errors} />
		</Card>

		<Card>
			<PrivateDetailsForm values={detailsValues} errors={detailsErrors} />
		</Card>
	</div>
</div>
