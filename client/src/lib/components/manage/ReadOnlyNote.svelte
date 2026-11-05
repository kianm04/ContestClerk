<script lang="ts">
	import { labelClasses } from '$lib/form-fields';

	type Props = {
		/** The same label the note's field carries for whoever may change it. */
		label: string;
		/** What is saved. */
		text: string;
	};

	let { label, text }: Props = $props();
</script>

<!--
	A saved note for a reader who may read it but not change it, such as a
	member of the team who reads applications without deciding them. A reader
	with nothing saved is shown nothing, rather than an empty box.
-->
{#if text.trim() !== ''}
	<div class="flex flex-col gap-1">
		<p class={labelClasses(true)}>{label}</p>
		<!-- `whitespace-pre-line` keeps the line breaks the note was typed with. -->
		<p class="max-w-prose text-dense whitespace-pre-line text-foreground">{text}</p>
	</div>
{/if}
