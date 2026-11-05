<script lang="ts">
	import { buttonClasses, buttonIconSize } from '$lib/button-classes';
	// The props, each explained, are in `$lib/button-props.ts`.
	import type { ButtonProps } from '$lib/button-props';
	import ButtonContent from './ButtonContent.svelte';
	import Kbd from './Kbd.svelte';

	let {
		label,
		variant,
		type = 'submit',
		size = 'md',
		isFullWidth = false,
		href,
		icon: Icon,
		isIconAfterLabel = false,
		isLabelHidden = false,
		isDisabled = false,
		isLoading = false,
		formaction,
		form,
		skipsValidation = false,
		name,
		value,
		isPressed,
		hasAutofocus = false,
		keyShortcut,
		onclick
	}: ButtonProps = $props();

	// `$derived` works the value out again whenever one of these props changes.
	const classes = $derived(buttonClasses(variant, size, isFullWidth, keyShortcut !== undefined));
	const iconSize = $derived(buttonIconSize(size));

	// A button that is waiting for the server must not be pressed a second time.
	const isUnusable = $derived(isDisabled || isLoading);

	/*
		A press on a button that is waiting for the server is stopped here: it
		neither sends the form again nor runs the page's own `onclick`.
	*/
	function handleClick(event: MouseEvent) {
		if (isLoading) {
			event.preventDefault();
			return;
		}

		onclick?.(event);
	}
</script>

<!--
	The same button twice: once as a link, once as a real `<button>`. Svelte has
	no way to change which element it renders without `<svelte:element>`, which
	CLAUDE.md asks us to avoid, and two short blocks read better than one clever
	one.

	A link cannot be disabled, so a disabled one loses its `href`: without it the
	browser will not follow it and the Tab key skips it, which is what "disabled"
	should mean.
-->
{#if href}
	<a
		href={isUnusable ? undefined : href}
		aria-label={isLabelHidden ? label : undefined}
		aria-disabled={isUnusable ? 'true' : undefined}
		aria-keyshortcuts={keyShortcut}
		onclick={handleClick}
		class="{classes} {isUnusable ? 'cursor-not-allowed opacity-60' : ''}"
	>
		<ButtonContent {label} icon={Icon} {iconSize} {isIconAfterLabel} {isLabelHidden} />
		{#if keyShortcut}
			<Kbd keyName={keyShortcut} />
		{/if}
	</a>
{:else}
	<!-- `hasAutofocus` is off unless a page asks; its comment in `$lib/button-props.ts` says when. -->
	<!-- svelte-ignore a11y_autofocus -->
	<button
		{type}
		{formaction}
		{form}
		{name}
		{value}
		autofocus={hasAutofocus}
		aria-pressed={isPressed}
		formnovalidate={skipsValidation}
		aria-label={isLabelHidden ? label : undefined}
		onclick={handleClick}
		disabled={isDisabled && !isLoading}
		aria-disabled={isLoading ? 'true' : undefined}
		aria-busy={isLoading ? 'true' : undefined}
		aria-keyshortcuts={keyShortcut}
		class="{classes} disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-wait"
	>
		<ButtonContent {label} icon={Icon} {iconSize} {isIconAfterLabel} {isLabelHidden} {isLoading} />
		{#if keyShortcut}
			<Kbd keyName={keyShortcut} />
		{/if}
	</button>
{/if}
