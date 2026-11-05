<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { firstErrorFieldName } from '$lib/applications';
	import { fieldId } from '$lib/form-fields';
	import ApplyForm from './ApplyForm.svelte';
	import ConferenceSummary from './ConferenceSummary.svelte';
	import RefusalNotice from './RefusalNotice.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder.
	// `data` is whatever `load` in `+page.server.ts` returned, and `load` runs
	// again after every action on this page, so nothing below is ever stale.
	// `form` is what the last action returned. Both actions redirect when they
	// work, so `form` is only ever a refusal, and it is `null` until one fails.
	let { data, form }: PageProps = $props();

	// `$derived` works each of these out again after every submit. A refused
	// post sends back everything that was typed, so nothing is lost; otherwise
	// the form shows what `load` read.
	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});

	const title = $derived(`Apply to ${data.conference.name}`);
	const subtitle = $derived(
		data.closesOn === null ? undefined : `Applications close ${data.closesOn}`
	);

	/*
		Take the reader to the first thing that needs fixing, which
		`05-pages/delegate/apply.md` asks a refused submit to do. A submit is an
		ordinary browser post, so the page comes back drawn from the top while the
		message they need can be five cards down.

		This is the kind of work `CLAUDE.md` keeps `$effect` for: it moves the page
		and the keyboard focus, which is talking to the browser rather than to
		Svelte and is not something a `$derived` could express. It runs whenever
		the errors change, which is after a refused submit and at no other time.
		With JavaScript switched off nothing moves and every message is still on
		the page, which is all the "works without JavaScript" criterion asks of it.
	*/
	$effect(() => {
		const fieldName = firstErrorFieldName(errors, data.questions);

		if (fieldName === null) {
			return;
		}

		const field = document.getElementById(fieldId(fieldName));

		// A multiple-choice question carries the field id on the `<fieldset>`
		// around its tick boxes, and a `<fieldset>` cannot hold the keyboard
		// focus, so the first box inside it is what the reader lands on instead.
		const toFocus = field instanceof HTMLFieldSetElement ? field.querySelector('input') : field;

		// `block: 'center'` puts the field in the middle of the screen rather than
		// against the top, where the sticky action bar could sit over it. Focusing
		// afterwards must not start a second scroll.
		field?.scrollIntoView({ block: 'center' });
		toFocus?.focus({ preventScroll: true });
	});
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Apply · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="mx-auto flex max-w-[1080px] flex-col gap-6 lg:flex-row lg:items-start">
	<!-- A column rather than plain blocks, because a preview shows the banner and
		the form one above the other and they need the gap between them. -->
	<div class="flex w-full flex-col gap-6 lg:max-w-[720px]">
		<PageHeader eyebrow={data.conference.name} {title} {subtitle} />

		{#if data.isPreview}
			<!-- An organiser reading their own unpublished form. The form is drawn
				so that they can see what they have built; both actions ask `canApply`
				again and refuse, so nothing can be applied for from here.
				`05-pages/organiser/application-form.md` asks for this banner by name. -->
			<Notice tone="info" title="Preview">
				<p>
					This is what delegates will see. Publish {data.conference.name} to take real applications.
				</p>
			</Notice>
		{:else if data.refusal}
			<RefusalNotice
				refusal={data.refusal}
				conferenceSlug={data.conference.slug}
				acceptsDelegations={data.conference.acceptsDelegations}
				existingApplicationId={data.existingApplicationId}
				existingDelegationId={data.existingDelegationId}
			/>
		{/if}

		{#if data.refusal === null || data.isPreview}
			<ApplyForm
				{values}
				{errors}
				committees={data.committees}
				preferenceCount={data.preferenceCount}
				asksMotivation={data.asksMotivation}
				questions={data.questions}
				profile={data.profile}
				missingProfileFields={data.missingProfileFields}
				ageNotice={data.ageNotice}
			/>
		{/if}
	</div>

	<ConferenceSummary
		conference={data.conference}
		fee={data.fee}
		feeCount={data.feeCount}
		closesOn={data.closesOn}
	/>
</div>
