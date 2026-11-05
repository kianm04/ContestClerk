<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from '$lib/legal-text';
</script>

<!-- `PageMeta` writes the `<title>` and the sharing tags, and adds "· MUNMeet". -->
<PageMeta title="Privacy" description="What MUNMeet collects about you, why, and who can see it." />

<!--
	There is no `+page.server.ts` and no `load` here. The words live in
	`$lib/legal-text.ts`, so the page is static markup with nothing to fetch.
-->
<LegalPage title="Privacy policy" lastUpdated={PRIVACY_LAST_UPDATED} sections={PRIVACY_SECTIONS} />
