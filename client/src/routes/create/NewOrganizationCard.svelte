<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import ChoiceMark from './ChoiceMark.svelte';

	type Props = {
		/** `/create?organization=new`. */
		href: string;
		isChosen: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { href, isChosen }: Props = $props();
</script>

<!--
	The last card of the row: a 2 pixel dashed outline, because it is not an
	organisation yet but the way to add one. Chosen, it turns solid blue like
	the other cards, and its fields appear.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -- built by createWithOrganizationUrl(), which starts from resolve('/create') and adds the query -->
<a
	{href}
	data-sveltekit-noscroll
	data-sveltekit-replacestate
	aria-current={isChosen ? 'true' : undefined}
	class={[
		'relative flex h-56.75 flex-col items-center justify-center rounded-lg border-2 p-5 text-center transition-colors duration-150',
		isChosen
			? 'border-creation-blue-border bg-creation-selected'
			: 'border-dashed border-creation-radio-border bg-white hover:border-creation-blue-focus'
	]}
>
	{#if isChosen}<ChoiceMark isChosen />{/if}
	<IconCircle icon={Plus} class="size-16" iconClass="size-7.5" />
	<span class="mt-4.5 block fs-18 lh-24 font-semibold text-creation-ink-950">New organisation</span>
	<span class="mt-2 block fs-15 lh-22 text-creation-ink-375">
		Add another organisation<br />if it's not in the list.
	</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
