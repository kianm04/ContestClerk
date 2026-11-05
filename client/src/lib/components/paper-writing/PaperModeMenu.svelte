<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { buttonVariants } from '$lib/components/ui/button';
	import { setSuggesting } from '$lib/paper-suggesting';
	import { cn } from '$lib/utils';

	type Props = {
		/** The live editor the mode is for. */
		editor: Editor;
		/** Whether the author is suggesting now, read from the editor's state. */
		isSuggesting: boolean;
	};

	let { editor, isSuggesting }: Props = $props();

	const modeName = $derived(isSuggesting ? 'Suggesting' : 'Editing');

	// The radio group hands back the item chosen by its `value`.
	function handleModeChange(value: string) {
		setSuggesting(editor, value === 'suggesting');
		editor.commands.focus();
	}
</script>

<!--
	"Editing" or "Suggesting", as in Google Docs: each author picks for
	themselves, and while suggesting the button takes the chosen colours so it
	is plain which mode the typing is in.
-->
<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Mode: {modeName}"
		class={cn(
			buttonVariants({ variant: 'outline' }),
			'h-10 gap-1.5 border-input pr-2 pl-3 text-dense font-medium sm:h-9',
			isSuggesting && 'border-selected bg-selected text-primary hover:bg-selected'
		)}
	>
		{modeName}
		<ChevronDown size={16} aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-auto min-w-40">
		<!-- shadcn's radio items stay open when chosen; the mode menu closes, so the author types on. -->
		<DropdownMenu.RadioGroup
			value={isSuggesting ? 'suggesting' : 'editing'}
			onValueChange={handleModeChange}
		>
			<DropdownMenu.RadioItem value="editing" closeOnSelect>Editing</DropdownMenu.RadioItem>
			<DropdownMenu.RadioItem value="suggesting" closeOnSelect>Suggesting</DropdownMenu.RadioItem>
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
