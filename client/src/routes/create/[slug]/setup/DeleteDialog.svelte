<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { ResolvedPathname } from '$app/types';
	import type { DeleteDialogContent } from '$lib/creation-setup-dialog';
	import DeleteActions from './DeleteActions.svelte';
	import DeleteCommitteeBody from './DeleteCommitteeBody.svelte';
	import DeleteFeeBody from './DeleteFeeBody.svelte';
	import DeleteQuestionBody from './DeleteQuestionBody.svelte';
	import DialogFrame from './DialogFrame.svelte';
	import DialogTitleIcon from './DialogTitleIcon.svelte';

	type Props = {
		/** The words and the action, from `readSetupDialog`. */
		content: DeleteDialogContent;
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { content, closeHref }: Props = $props();

	/*
		The three boards draw a delete three ways. Committee: 598 pixels, all
		centred under a bin. Question: 516, a warning circle at the left with the
		words beside it. Fee: 612, the circle and title on one line. These are
		each board's box, title, cross and buttons.
	*/
	const LAYOUTS = {
		deleteCommittee: {
			width: 598,
			class: 'px-7.75 pt-9 pb-4.75 max-lg:px-4',
			titleClass: 'mt-4.25',
			closeClass: 'top-5.5 right-5.5 size-6',
			iconClass: 'size-18 text-creation-red',
			glyphClass: 'size-8',
			actions: 'mt-4.75 gap-3',
			cancel: 'h-10.5 min-w-22.75 fs-17',
			submit: 'h-10.5 min-w-40.25 fs-17'
		},
		deleteQuestion: {
			width: 516,
			class: 'px-6.75 pt-6 pb-5.25 max-lg:px-4',
			titleClass: 'mt-1 mr-7.5 ml-20.75 fs-30 lh-36',
			closeClass: 'top-5.5 right-5.5 size-7.5 text-creation-ink-800 [&_svg]:size-5.5',
			iconClass: 'absolute top-6 left-6.75 size-15 text-creation-red max-lg:left-4',
			glyphClass: 'size-7',
			actions: 'mt-4.5 gap-3.25',
			cancel: 'h-10.5 px-5.5 fs-17',
			submit: 'h-10.5 px-6 fs-17'
		},
		deleteFee: {
			width: 612,
			class: 'pt-8.5 pr-10.5 pb-7.5 pl-10.25 max-lg:px-4',
			titleClass: 'my-3.5 ml-25.25 fs-36 lh-44',
			closeClass: 'top-6.5 right-7 size-8 text-creation-ink-800',
			iconClass: 'absolute top-8.5 left-10.25 size-18 text-creation-red max-lg:left-4',
			glyphClass: 'size-8',
			actions: 'mt-8.75 gap-4',
			cancel: 'h-12.5 px-9 fs-19',
			submit: 'h-12.5 px-8 fs-19'
		}
	};

	const layout = $derived(LAYOUTS[content.action]);
	const isCommittee = $derived(content.action === 'deleteCommittee');
</script>

<DialogFrame
	title={content.title}
	width={layout.width}
	class={layout.class}
	titleClass={layout.titleClass}
	closeClass={layout.closeClass}
	align={isCommittee ? 'center' : 'left'}
	{closeHref}
>
	<!-- A snippet is a piece of markup handed to `DialogFrame`, which draws it above the title. -->
	{#snippet above()}
		<DialogTitleIcon
			icon={isCommittee ? Trash2 : TriangleAlert}
			tone="danger"
			class={layout.iconClass}
			iconClass={layout.glyphClass}
		/>
	{/snippet}
	{#if content.action === 'deleteCommittee'}
		<DeleteCommitteeBody {content} />
	{:else if content.action === 'deleteQuestion'}
		<DeleteQuestionBody {content} />
	{:else}
		<DeleteFeeBody {content} />
	{/if}
	<DeleteActions
		{content}
		{closeHref}
		class={layout.actions}
		cancelClass={layout.cancel}
		submitClass={layout.submit}
	/>
</DialogFrame>
