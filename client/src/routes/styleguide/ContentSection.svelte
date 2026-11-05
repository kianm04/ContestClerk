<script lang="ts">
	import ContentConferenceSection from './ContentConferenceSection.svelte';
	import ContentPeopleSection from './ContentPeopleSection.svelte';
	import ContentTextSection from './ContentTextSection.svelte';
	import Group from './Group.svelte';
</script>

<!--
	The content group holds fifteen components, which is far more than one file
	may show and stay under the size limit in `CLAUDE.md`, so it is split into
	three by subject.
-->
<Group id="content" title="Content">
	<ContentPeopleSection />
	<ContentConferenceSection />
	<ContentTextSection />
</Group>
