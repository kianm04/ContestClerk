<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import { controlClasses, labelClasses } from '$lib/form-fields';
	import { absolutePath } from '$lib/urls';

	type Props = {
		/** The conference's public page, from `conferenceUrl` in `$lib/urls.ts`. */
		publicPath: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { publicPath }: Props = $props();

	/*
		The whole address to share, such as
		`https://munmeet.app/conferences/northbridge-mun-2027`. `page` from
		`$app/state` is the request being drawn, so `page.url.origin` is the site
		this page came from. `resolve()` gives a relative address while the page
		is built on the server, which `absolutePath` in `$lib/urls.ts` turns
		back into one starting with `/` before the origin goes in front.
	*/
	const shareLink = $derived(`${page.url.origin}${absolutePath(publicPath, page.url.pathname)}`);

	// `$state` makes Svelte redraw when this changes, which is what puts the
	// "Link copied." line on the screen.
	let hasCopied = $state(false);

	/**
	 * Put the link on the clipboard. `navigator.clipboard` only exists with
	 * JavaScript on a secure page; without it nothing is claimed, and the link
	 * can still be selected and copied out of the box by hand.
	 */
	async function handleCopyLink() {
		if (!navigator.clipboard) {
			return;
		}

		try {
			await navigator.clipboard.writeText(shareLink);
			hasCopied = true;
		} catch {
			hasCopied = false;
		}
	}
</script>

<div class="flex flex-col">
	<label for="share-link" class="mb-1.5 {labelClasses(true)}">Link to share</label>

	<div class="flex flex-wrap gap-2">
		<!-- Read-only, so the link can be selected and copied but not changed. -->
		<input
			id="share-link"
			type="text"
			readonly
			value={shareLink}
			class="min-w-0 flex-1 basis-65 {controlClasses(true)}"
		/>
		<!-- The two buttons wrap under the box together rather than one at a time. -->
		<div class="flex gap-2">
			<Button
				label="Copy link"
				variant="primary"
				type="button"
				icon={Copy}
				onclick={handleCopyLink}
			/>
			<Button
				label="View page"
				variant="secondary"
				href={publicPath}
				icon={ExternalLink}
				isIconAfterLabel
			/>
		</div>
	</div>

	<!--
		`aria-live` makes a screen reader read this out when it changes, without
		moving the reader away from the button. It is on the page from the start,
		because a live region only announces changes to itself.
	-->
	<p class="mt-1 min-h-5 text-small text-muted-foreground" aria-live="polite">
		{hasCopied ? 'Link copied.' : ''}
	</p>
</div>
