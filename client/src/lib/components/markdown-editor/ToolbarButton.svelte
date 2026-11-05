<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	type Props = {
		/** What the button does, read out by a screen reader and shown on hover. */
		label: string;
		icon: LucideIcon;
		/** True when the text at the cursor already has this formatting. */
		isPressed: boolean;
		isDisabled?: boolean;
		onclick: () => void;
	};

	let { label, icon: Icon, isPressed, isDisabled = false, onclick }: Props = $props();

	/*
		`aria-pressed:` is Tailwind for "while `aria-pressed` is true", so a
		pressed button looks pressed from the same attribute a screen reader reads.
	*/
	const TOOL_CLASSES = [
		'flex size-11 items-center justify-center rounded-control text-ink-600',
		'hover:bg-neutral-100 hover:text-ink-900 disabled:opacity-40',
		'aria-pressed:bg-brand-100 aria-pressed:text-brand-900'
	].join(' ');
</script>

<button
	type="button"
	aria-label={label}
	title={label}
	aria-pressed={isPressed}
	disabled={isDisabled}
	class={TOOL_CLASSES}
	{onclick}
>
	<Icon size={18} strokeWidth={1.75} aria-hidden="true" />
</button>
