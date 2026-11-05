<script lang="ts">
	type Props = {
		/** The page's name. "· MUNMeet" is added here so every page ends the same way. */
		title: string;
		/** One or two sentences for search results and for the card a shared link shows. */
		description: string;
		/** A full web address for that card's picture, usually the conference banner. */
		imageUrl?: string;
	};

	let { title, description, imageUrl }: Props = $props();
</script>

<!--
	`<svelte:head>` puts these tags in the page's `<head>` instead of where the
	component sits. The `og:` tags are what Slack, WhatsApp and the rest read
	when somebody shares the link.
-->
<svelte:head>
	<title>{title} · MUNMeet</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />

	{#if imageUrl}
		<meta property="og:image" content={imageUrl} />
	{/if}
</svelte:head>
