<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Editor } from '@tiptap/core';
	import Bold from '@lucide/svelte/icons/bold';
	import Italic from '@lucide/svelte/icons/italic';
	import Link from '@lucide/svelte/icons/link';
	import List from '@lucide/svelte/icons/list';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import Underline from '@lucide/svelte/icons/underline';
	import {
		applyMarkdownCommand,
		applyMarkdownTextStyle,
		type MarkdownCommand,
		type MarkdownFormatting,
		type MarkdownTextStyle
	} from '$lib/markdown-editor';
	import LinkPopover from './LinkPopover.svelte';
	import ToolbarButton from './ToolbarButton.svelte';

	type Props = {
		/** The editor the toolbar formats. */
		editor: Editor;
		/** The id of the writing area the toolbar formats. */
		controls: string;
		/** Which formatting the text at the cursor has, so its button shows as pressed. */
		formatting: MarkdownFormatting;
		/** True while the raw Markdown is shown, when the formatting buttons have nothing to do. */
		isMarkdownShown: boolean;
		/** Leaves out the heading menu, for short notes. */
		isCompact?: boolean;
		/** True while the box for a link's address shows under the toolbar. */
		isLinkOpen: boolean;
		onLinkClick: () => void;
		onLinkClose: () => void;
		/** Swaps to the Markdown and back. */
		onMarkdownToggle: () => void;
	};

	let {
		editor,
		controls,
		formatting,
		isMarkdownShown,
		isCompact = false,
		isLinkOpen,
		onLinkClick,
		onLinkClose,
		onMarkdownToggle
	}: Props = $props();

	type Tool = { command: MarkdownCommand; label: string; icon: LucideIcon };

	// Two groups, as in the mockup: text marks, then lists.
	const MARK_TOOLS: Tool[] = [
		{ command: 'bold', label: 'Bold', icon: Bold },
		{ command: 'italic', label: 'Italic', icon: Italic },
		{ command: 'underline', label: 'Underline', icon: Underline }
	];
	const LIST_TOOLS: Tool[] = [
		{ command: 'bulletList', label: 'Bulleted list', icon: List },
		{ command: 'orderedList', label: 'Numbered list', icon: ListOrdered }
	];

	const STYLE_MENU_CLASSES =
		'min-h-11 rounded-control border-0 bg-surface py-2 pr-8 pl-3 text-body text-ink-900 disabled:opacity-40';
	const DIVIDER_CLASSES = 'mx-1 h-6 w-px bg-line';
	const SWITCH_CLASSES =
		'ml-auto min-h-11 rounded-control px-3 text-small text-ink-600 hover:bg-neutral-100 aria-pressed:bg-brand-100 aria-pressed:text-brand-900';

	function handleStyleChange(event: Event & { currentTarget: HTMLSelectElement }) {
		applyMarkdownTextStyle(editor, event.currentTarget.value as MarkdownTextStyle);
	}
</script>

<!-- The link box opens just under the toolbar, over the text. -->
<div class="relative">
	<!-- `role="toolbar"` tells a screen reader these buttons all work on the writing area below. -->
	<div
		role="toolbar"
		aria-label="Formatting"
		aria-controls={controls}
		class="flex flex-wrap items-center gap-1 border-b border-line p-2"
	>
		{#if !isCompact}
			<select
				aria-label="Text style"
				value={formatting.textStyle}
				disabled={isMarkdownShown}
				class={STYLE_MENU_CLASSES}
				onchange={handleStyleChange}
			>
				<option value="paragraph">Normal text</option>
				<option value="heading">Heading</option>
			</select>
			<span class={DIVIDER_CLASSES} aria-hidden="true"></span>
		{/if}

		<!-- The `(tool.command)` key lets Svelte reuse each button instead of rebuilding it. -->
		{#each MARK_TOOLS as tool (tool.command)}
			<ToolbarButton
				label={tool.label}
				icon={tool.icon}
				isPressed={formatting[tool.command]}
				isDisabled={isMarkdownShown}
				onclick={() => applyMarkdownCommand(editor, tool.command)}
			/>
		{/each}

		<span class={DIVIDER_CLASSES} aria-hidden="true"></span>
		{#each LIST_TOOLS as tool (tool.command)}
			<ToolbarButton
				label={tool.label}
				icon={tool.icon}
				isPressed={formatting[tool.command]}
				isDisabled={isMarkdownShown}
				onclick={() => applyMarkdownCommand(editor, tool.command)}
			/>
		{/each}

		<span class={DIVIDER_CLASSES} aria-hidden="true"></span>
		<ToolbarButton
			label="Link"
			icon={Link}
			isPressed={formatting.link}
			isDisabled={isMarkdownShown}
			onclick={onLinkClick}
		/>

		<!-- A switch between the formatted text and the Markdown it is stored as. -->
		<button
			type="button"
			aria-pressed={isMarkdownShown}
			class={SWITCH_CLASSES}
			onclick={onMarkdownToggle}
		>
			Markdown
		</button>
	</div>
	{#if isLinkOpen}
		<LinkPopover {editor} onClose={onLinkClose} />
	{/if}
</div>
