<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import X from '@lucide/svelte/icons/x';
	import Button from '$lib/components/Button.svelte';
	import { buttonClasses } from '$lib/button-classes';
	import { formatFileSize, type BackgroundGuide } from '$lib/documents';

	type Props = {
		/** The committee's saved guide. */
		guide: BackgroundGuide;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { guide }: Props = $props();

	/** The Download link looks like the ghost buttons beside it. */
	const DOWNLOAD_LINK_CLASSES = buttonClasses('ghost', 'dense-sm', false);
</script>

<!--
	The saved guide as one row: its name and size, the Download link and the
	cross that removes it. The row sits inside `BackgroundGuidePanel`'s form, so
	the cross is one of that form's buttons, sent to `?/removeGuide`.
-->
<div
	class="flex min-h-13 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-1 py-2"
>
	<p class="flex min-w-0 items-center gap-2 text-dense break-all text-foreground">
		<FileText size={16} class="shrink-0 text-muted-foreground" aria-hidden="true" />
		<span>
			<span class="font-medium">{guide.fileName}</span>
			<span class="text-muted-foreground">· {formatFileSize(guide.fileSizeBytes)}</span>
		</span>
	</p>

	<div class="flex shrink-0 items-center gap-1">
		<!--
			The address is a signed one made in `load` and good for a minute, so
			it points at Supabase Storage rather than at a page of ours. That is
			why the rule about building every link with `resolve()` is switched
			off around it, the way `lib/components/shell/AppFooter.svelte`
			switches it off for an email address: there is no route of ours for
			`resolve()` to check this against. It is the surrounding pair rather
			than the one-line form, because Prettier puts `href` on a line of its
			own and `eslint-disable-next-line` would then land on the `<a` above it.

			It opens in a new tab so that a half-filled form on this page is not
			thrown away, which is why `routes/register/Register.svelte` opens the
			legal pages the same way.
		-->
		{#if guide.downloadUrl}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a href={guide.downloadUrl} target="_blank" rel="noreferrer" class={DOWNLOAD_LINK_CLASSES}>
				Download
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}

		<!-- `isLabelHidden` draws the cross alone and keeps the words as its name. -->
		<Button
			label="Remove guide"
			variant="ghost"
			size="dense-sm"
			icon={X}
			isLabelHidden
			formaction="?/removeGuide"
		/>
	</div>
</div>
