/**
 * A catalogue of committees that Model United Nations conferences run again and
 * again (Trello fe3reN7Y).
 *
 * The "Create committee" dialog autocompletes from it and offers five of them as
 * quick templates, so an organiser who types "Security" gets the Security
 * Council's full name, abbreviation, two sensible topics, a short description
 * and a speaking time, and only has to change what is different at their
 * conference. Everything it fills in stays editable.
 *
 * It is a plain list in this file, not a table and not a web service, because
 * the bodies MUN simulates hardly ever change. A static list costs nothing to
 * search, works offline and in tests, and a teammate can correct an entry in a
 * pull request.
 *
 * How the search ranks a committee, best first:
 *   0. the query is its abbreviation ("who" finds WHO);
 *   1. its name or abbreviation starts with the query ("United Nations S");
 *   2. every word of the query starts a word of its name, abbreviation or one of
 *      its aliases ("security" finds the Security Council, "ga1" finds DISEC);
 *   3. the query appears anywhere in those ("rights" inside "Human Rights").
 * Inside one rank the catalogue's own order decides, so the result never jumps
 * about between keystrokes. Case, accents and punctuation are ignored.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

/**
 * The levels a committee can have. The database's `experience_level` also has
 * `none`, which describes delegates, never committees.
 */
export type CatalogueLevel = 'beginner' | 'intermediate' | 'advanced';

export type CatalogueCommittee = {
	/** "United Nations Security Council". */
	name: string;
	/** "UNSC". */
	abbreviation: string;
	level: CatalogueLevel;
	/** Two or three typical agenda topics, worded the way an agenda would put them. */
	topics: string[];
	/** Two or three plain sentences a delegate reads on the public page. */
	description: string;
	/** Common alternative names and spellings matched by the search: "Security Council", "SC". */
	aliases: string[];
	/** A sensible typical speaking time in seconds (60, 90 or 120). */
	defaultSpeakingTimeSeconds: number;
};

export const COMMITTEE_CATALOGUE: CatalogueCommittee[] = [
	// The Security Council comes first so that it wins every tie it is part of.
	{
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		level: 'advanced',
		topics: [
			'The situation in the Sahel',
			'The situation in Haiti',
			'Protection of civilians in armed conflict'
		],
		description:
			'The Security Council has primary responsibility for international peace and security. Its fifteen members can adopt binding resolutions, and the five permanent members hold a veto. Debate is fast and every word of a draft is negotiated.',
		aliases: ['Security Council', 'SC', 'UN Security Council'],
		defaultSpeakingTimeSeconds: 60
	},
	{
		name: 'United Nations Security Council (Historical)',
		abbreviation: 'HSC',
		level: 'advanced',
		topics: [
			'The Cuban Missile Crisis, 1962',
			'The situation in the Congo, 1960',
			'The Suez Crisis, 1956'
		],
		description:
			'The Historical Security Council meets on a fixed date in the past. Delegates may use only what their country knew at that moment, and history can take a different turn from the one in the books.',
		aliases: ['Historical Security Council', 'Historic Security Council', 'HUNSC'],
		defaultSpeakingTimeSeconds: 60
	},
	{
		name: 'General Assembly Plenary',
		abbreviation: 'UNGA',
		level: 'beginner',
		topics: [
			'Reform of the Security Council',
			'Progress towards the Sustainable Development Goals'
		],
		description:
			'The General Assembly brings together all 193 member states, each with one vote. Its resolutions are recommendations, so their weight comes from the number of states that support them.',
		aliases: ['General Assembly', 'GA', 'Plenary', 'United Nations General Assembly'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Disarmament and International Security Committee',
		abbreviation: 'DISEC',
		level: 'beginner',
		topics: [
			'Lethal autonomous weapons systems',
			'The illicit trade in small arms and light weapons',
			'Preventing an arms race in outer space'
		],
		description:
			'The First Committee of the General Assembly deals with disarmament and threats to international peace. Every member state has a seat, and its resolutions are recommendations to the Assembly.',
		aliases: ['GA1', 'First Committee', 'General Assembly First Committee'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Economic and Financial Committee',
		abbreviation: 'ECOFIN',
		level: 'beginner',
		topics: [
			'Sovereign debt in developing countries',
			'Financing for climate adaptation',
			'Illicit financial flows'
		],
		description:
			'The Second Committee of the General Assembly deals with economic growth, development and finance. Delegates look for ways to make the global economy work for poorer countries as well as richer ones.',
		aliases: ['GA2', 'Second Committee', 'General Assembly Second Committee', 'EcoFin'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Social, Humanitarian and Cultural Committee',
		abbreviation: 'SOCHUM',
		level: 'beginner',
		topics: [
			'The rights of indigenous peoples',
			'Freedom of expression online',
			'Ending child marriage'
		],
		description:
			'The Third Committee of the General Assembly deals with human rights, social questions and humanitarian affairs. Its debates often turn on how universal rights are applied in very different societies.',
		aliases: ['GA3', 'Third Committee', 'General Assembly Third Committee'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Special Political and Decolonisation Committee',
		abbreviation: 'SPECPOL',
		level: 'intermediate',
		topics: [
			'The question of Western Sahara',
			'The peaceful uses of outer space',
			'A review of peacekeeping operations'
		],
		description:
			'The Fourth Committee of the General Assembly deals with decolonisation, peacekeeping and a range of political questions that fall outside the other committees. Many of its topics have been on the agenda for decades.',
		aliases: ['GA4', 'Fourth Committee', 'Special Political and Decolonization Committee'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Legal Committee',
		abbreviation: 'LEGAL',
		level: 'intermediate',
		topics: [
			'Measures to eliminate international terrorism',
			'Crimes against humanity',
			'The scope of universal jurisdiction'
		],
		description:
			'The Sixth Committee of the General Assembly deals with international law. Delegates work on the precise wording of legal texts, so careful drafting matters more here than anywhere else in the Assembly.',
		aliases: ['GA6', 'Sixth Committee', 'General Assembly Sixth Committee'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Economic and Social Council',
		abbreviation: 'ECOSOC',
		level: 'intermediate',
		topics: ['Youth unemployment', 'Bridging the digital divide', 'Sustainable urbanisation'],
		description:
			'The Economic and Social Council coordinates the economic, social and environmental work of the United Nations. Its 54 members are elected by the General Assembly for three years.',
		aliases: ['Economic and Social Council', 'EcoSoc'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'United Nations Human Rights Council',
		abbreviation: 'UNHRC',
		level: 'intermediate',
		topics: [
			'The human rights situation in Myanmar',
			'Human rights and artificial intelligence',
			'Protecting human rights defenders'
		],
		description:
			'The Human Rights Council promotes and protects human rights around the world. Its 47 members are elected by the General Assembly, and it can examine the record of any member state.',
		aliases: ['Human Rights Council', 'HRC'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'World Health Organization',
		abbreviation: 'WHO',
		level: 'beginner',
		topics: [
			'Pandemic preparedness and response',
			'Antimicrobial resistance',
			'Access to essential medicines'
		],
		description:
			'The World Health Organization directs international work on health. Delegates sit as the World Health Assembly and set priorities for the organisation and its member states.',
		aliases: ['World Health Assembly', 'WHA', 'World Health Organisation'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'World Health Organization Executive Board',
		abbreviation: 'WHO EB',
		level: 'intermediate',
		topics: ['Health emergencies in conflict zones', 'Financing the World Health Organization'],
		description:
			'The Executive Board is a smaller body of 34 health experts that prepares the work of the World Health Assembly and acts on urgent matters between its sessions.',
		aliases: [
			'WHO Executive Board',
			'Executive Board',
			'WHOEB',
			'World Health Organisation Executive Board'
		],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: "United Nations Children's Fund",
		abbreviation: 'UNICEF',
		level: 'beginner',
		topics: [
			'Children in armed conflict',
			'Access to education in emergencies',
			'Child labour in supply chains'
		],
		description:
			"UNICEF works for the rights and wellbeing of children in more than 190 countries. Delegates decide how the fund should act where children's lives are most at risk.",
		aliases: ["Children's Fund", "United Nations International Children's Emergency Fund"],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'United Nations Educational, Scientific and Cultural Organization',
		abbreviation: 'UNESCO',
		level: 'beginner',
		topics: [
			'Protecting cultural heritage in conflict',
			'The ethics of artificial intelligence',
			"Girls' access to education"
		],
		description:
			'UNESCO promotes cooperation in education, science and culture. It keeps the World Heritage List and sets international standards on questions such as press freedom and scientific ethics.',
		aliases: ['United Nations Educational, Scientific and Cultural Organisation'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'United Nations Environment Programme',
		abbreviation: 'UNEP',
		level: 'beginner',
		topics: [
			'Plastic pollution in the oceans',
			'Protecting biodiversity',
			'Air quality in growing cities'
		],
		description:
			'The United Nations Environment Programme sets the global environmental agenda. Its member states meet as the United Nations Environment Assembly to agree on shared action.',
		aliases: [
			'UNEA',
			'United Nations Environment Assembly',
			'Environment Programme',
			'UN Environment'
		],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'United Nations Development Programme',
		abbreviation: 'UNDP',
		level: 'beginner',
		topics: [
			'Poverty reduction in least developed countries',
			'Governance and anti-corruption',
			'Recovery after natural disasters'
		],
		description:
			'The United Nations Development Programme helps countries reduce poverty and build institutions that last. Delegates weigh which kinds of help actually work and how they should be paid for.',
		aliases: ['Development Programme'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Office of the United Nations High Commissioner for Refugees',
		abbreviation: 'UNHCR',
		level: 'intermediate',
		topics: ['Climate-induced displacement', 'Protracted refugee situations', 'Statelessness'],
		description:
			'UNHCR protects refugees, people displaced inside their own countries and stateless people. Delegates balance the duty to protect with the pressure that large movements of people put on host countries.',
		aliases: ['UN Refugee Agency', 'Refugee Agency', 'High Commissioner for Refugees'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'United Nations Entity for Gender Equality and the Empowerment of Women',
		abbreviation: 'UN Women',
		level: 'beginner',
		topics: [
			"Women's participation in peace processes",
			'Ending gender-based violence',
			'The gender pay gap'
		],
		description:
			'UN Women supports member states in reaching equality between women and men. Delegates discuss how commitments on paper can become change in law, work and public life.',
		aliases: ['UNW', 'UNWomen'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Commission on the Status of Women',
		abbreviation: 'CSW',
		level: 'beginner',
		topics: ["Women's economic empowerment", 'Gender equality in digital technology'],
		description:
			'The Commission on the Status of Women is the main intergovernmental body for gender equality. Each year it reviews progress on one priority theme and agrees conclusions on what to do next.',
		aliases: ['Status of Women'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'United Nations Office on Drugs and Crime',
		abbreviation: 'UNODC',
		level: 'intermediate',
		topics: ['Human trafficking', 'The synthetic drug trade', 'Cybercrime'],
		description:
			'The United Nations Office on Drugs and Crime helps states fight illicit drugs, organised crime, corruption and terrorism. Its topics sit where public health, policing and human rights meet.',
		aliases: ['Office on Drugs and Crime', 'Drugs and Crime'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Food and Agriculture Organization',
		abbreviation: 'FAO',
		level: 'beginner',
		topics: [
			'Food security in a changing climate',
			'Sustainable fisheries',
			'Reducing food loss and waste'
		],
		description:
			'The Food and Agriculture Organization leads international efforts to end hunger. Delegates look at how food is grown, traded and shared, and who goes without.',
		aliases: ['Food and Agriculture Organisation'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'International Labour Organization',
		abbreviation: 'ILO',
		level: 'intermediate',
		topics: ['Rights of workers in the platform economy', 'Forced labour', 'Migrant workers'],
		description:
			'The International Labour Organization sets standards for work. It is unusual among United Nations bodies because governments, employers and workers each have a voice.',
		aliases: ['International Labour Organisation', 'International Labor Organization'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'International Atomic Energy Agency',
		abbreviation: 'IAEA',
		level: 'advanced',
		topics: [
			'Nuclear safety in conflict zones',
			'Safeguards and verification',
			'Access to nuclear technology for peaceful purposes'
		],
		description:
			'The International Atomic Energy Agency promotes the peaceful use of nuclear energy and checks that nuclear material is not diverted to weapons. Its debates are technical and closely tied to security.',
		aliases: ['Atomic Energy Agency', 'IAEA Board of Governors'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'World Trade Organization',
		abbreviation: 'WTO',
		level: 'intermediate',
		topics: ['Reform of dispute settlement', 'Agricultural subsidies', 'Trade and the environment'],
		description:
			'The World Trade Organization sets the rules for trade between nations. Decisions are taken by consensus, so a single member can hold up an agreement.',
		aliases: ['World Trade Organisation'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'International Monetary Fund',
		abbreviation: 'IMF',
		level: 'advanced',
		topics: [
			'Sovereign debt restructuring',
			'Conditionality of lending programmes',
			'Reform of quotas and voting shares'
		],
		description:
			"The International Monetary Fund works for global financial stability and lends to countries in difficulty. Voting follows each member's quota, so economic weight shapes every decision.",
		aliases: ['Monetary Fund'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'World Bank Group',
		abbreviation: 'WBG',
		level: 'intermediate',
		topics: [
			'Financing infrastructure in developing countries',
			'Debt relief for low-income countries'
		],
		description:
			'The World Bank lends to and advises developing countries. Delegates decide where money should go and on what terms, knowing that the largest shareholders carry the most votes.',
		aliases: ['World Bank', 'IBRD', 'International Bank for Reconstruction and Development'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'International Court of Justice',
		abbreviation: 'ICJ',
		level: 'advanced',
		topics: [
			'A contentious case between two states',
			'An advisory opinion on obligations of states in respect of climate change'
		],
		description:
			'The International Court of Justice settles legal disputes between states. Delegates act as judges and advocates, present evidence and argue from treaties and precedent rather than policy.',
		aliases: ['World Court', 'Court of Justice'],
		defaultSpeakingTimeSeconds: 120
	},
	{
		name: 'Peacebuilding Commission',
		abbreviation: 'PBC',
		level: 'intermediate',
		topics: [
			'Peacebuilding in the Central African Republic',
			'Transitional justice after conflict'
		],
		description:
			'The Peacebuilding Commission advises on how countries emerging from conflict can avoid sliding back into it. It brings together members of the Security Council, the General Assembly and the main funders.',
		aliases: ['UN Peacebuilding Commission'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'European Council',
		abbreviation: 'EUCO',
		level: 'intermediate',
		topics: [
			'Enlargement of the European Union',
			'Energy security',
			'A common approach to migration'
		],
		description:
			"The European Council brings together the heads of state or government of the European Union. It sets the Union's direction and priorities, usually by consensus.",
		aliases: ['EU summit', 'European Union'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'European Parliament',
		abbreviation: 'EP',
		level: 'intermediate',
		topics: [
			'Regulating artificial intelligence',
			'The European Green Deal',
			'Data protection and privacy'
		],
		description:
			'The European Parliament is the directly elected body of the European Union. Delegates sit as members of political groups rather than as countries, and amend legislation line by line.',
		aliases: ['EuroParl', 'EU Parliament'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'African Union',
		abbreviation: 'AU',
		level: 'intermediate',
		topics: [
			'The African Continental Free Trade Area',
			'Peace and security in the Horn of Africa',
			'Unconstitutional changes of government'
		],
		description:
			'The African Union brings together the 55 states of the continent. It works for integration and development and can act on conflicts through its Peace and Security Council.',
		aliases: ['AU Peace and Security Council'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'League of Arab States',
		abbreviation: 'LAS',
		level: 'intermediate',
		topics: ['Water security in the region', 'The situation in Yemen', 'Reconstruction in Syria'],
		description:
			'The League of Arab States works for cooperation among its 22 members. Decisions bind only the states that vote for them, which makes building consensus central.',
		aliases: ['Arab League'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Association of Southeast Asian Nations',
		abbreviation: 'ASEAN',
		level: 'intermediate',
		topics: ['The South China Sea', 'The crisis in Myanmar', 'Regional economic integration'],
		description:
			'ASEAN brings together ten states of Southeast Asia. It works by consultation and consensus and avoids interfering in the internal affairs of its members.',
		aliases: ['Association of South East Asian Nations'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'North Atlantic Treaty Organization',
		abbreviation: 'NATO',
		level: 'advanced',
		topics: ['Collective defence and cyber attacks', 'Security in the Arctic', 'Hybrid threats'],
		description:
			'NATO is a military alliance of states in Europe and North America. Delegates sit as the North Atlantic Council, where every decision is taken by consensus.',
		aliases: ['North Atlantic Council', 'NAC', 'North Atlantic Treaty Organisation'],
		defaultSpeakingTimeSeconds: 60
	},
	{
		name: 'Organization of American States',
		abbreviation: 'OAS',
		level: 'intermediate',
		topics: [
			'Democracy and electoral integrity',
			'Migration in the Americas',
			'Organised crime and drug trafficking'
		],
		description:
			'The Organization of American States brings together the 35 states of the Americas. It works for democracy, human rights and security across the hemisphere.',
		aliases: ['Organisation of American States'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Commonwealth Heads of Government Meeting',
		abbreviation: 'CHOGM',
		level: 'intermediate',
		topics: ['Climate resilience of small island states', 'Trade among Commonwealth members'],
		description:
			'The Commonwealth is a voluntary association of 56 states, most of them once part of the British Empire. Its heads of government meet to agree on shared values and common action.',
		aliases: ['Commonwealth', 'Commonwealth of Nations'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Group of Twenty',
		abbreviation: 'G20',
		level: 'intermediate',
		topics: [
			'Global debt architecture',
			'Taxation of multinational companies',
			'Financing the energy transition'
		],
		description:
			'The G20 brings together the largest economies of the world. It has no permanent staff and makes no binding decisions, but its agreements shape global economic policy.',
		aliases: ['Group of 20', 'G-20'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'International Criminal Police Organization',
		abbreviation: 'INTERPOL',
		level: 'intermediate',
		topics: ['Cross-border cybercrime', 'Trafficking in cultural property', 'Use of red notices'],
		description:
			'Interpol helps police forces in 196 countries work together. Delegates decide how information is shared across borders without it being misused for political ends.',
		aliases: ['ICPO', 'International Criminal Police Organisation'],
		defaultSpeakingTimeSeconds: 90
	},
	{
		name: 'Joint Crisis Committee',
		abbreviation: 'JCC',
		level: 'advanced',
		topics: ['The Berlin Crisis, 1961', 'The Korean War, 1950'],
		description:
			'In a joint crisis committee, two or more cabinets face each other in the same unfolding situation. Delegates act through directives, and the crisis team answers each move with the next development.',
		aliases: ['Joint Crisis', 'Crisis'],
		defaultSpeakingTimeSeconds: 60
	},
	{
		name: 'Historical Crisis Committee',
		abbreviation: 'HCC',
		level: 'advanced',
		topics: ['The Congress of Vienna, 1814', 'The July Crisis, 1914'],
		description:
			'A historical crisis committee puts delegates in the roles of real people at a turning point in history. They act through directives, and the outcome need not follow what happened.',
		aliases: ['Historical Crisis', 'Historic Crisis', 'Crisis'],
		defaultSpeakingTimeSeconds: 60
	},
	{
		name: 'International Press Corps',
		abbreviation: 'IPC',
		level: 'beginner',
		topics: ['Reporting on committee sessions', 'Interviews with delegates and chairs'],
		description:
			'The Press Corps reports on the conference as it happens. Journalists attend committee sessions, interview delegates and publish articles throughout the conference.',
		aliases: ['Press Corps', 'International Press', 'Press'],
		defaultSpeakingTimeSeconds: 60
	}
];

/** The abbreviations the "Create committee" dialog shows as one-press templates. */
export const QUICK_TEMPLATES: string[] = ['UNSC', 'WHO', 'UNHRC', 'ECOSOC', 'DISEC'];

/** How many committees the search returns when the caller does not say. */
const DEFAULT_SEARCH_LIMIT = 6;

/** A query shorter than this would match nearly everything, so it matches nothing. */
const SHORTEST_QUERY_LENGTH = 2;

/**
 * Lower case, accents removed, and anything that is not a letter or a digit
 * turned into a single space, so "Organisation", "organisation" and
 * "Organisátion" compare equal and "G-20" becomes "g 20".
 */
function normaliseForSearch(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * The rank of a committee for a normalised query, 0 being the best, or `null`
 * when it does not match at all. The file header explains the four ranks.
 */
function searchRank(committee: CatalogueCommittee, query: string): number | null {
	const name = normaliseForSearch(committee.name);
	const abbreviation = normaliseForSearch(committee.abbreviation);
	const aliases = committee.aliases.map(normaliseForSearch);

	if (abbreviation === query) {
		return 0;
	}

	if (name.startsWith(query) || abbreviation.startsWith(query)) {
		return 1;
	}

	const searchedTexts = [name, abbreviation, ...aliases];
	const queryWords = query.split(' ');
	const everyWordStartsAWord = (text: string) => {
		const words = text.split(' ');

		return queryWords.every((queryWord) => words.some((word) => word.startsWith(queryWord)));
	};

	if (searchedTexts.some(everyWordStartsAWord)) {
		return 2;
	}

	if (searchedTexts.some((text) => text.includes(query))) {
		return 3;
	}

	return null;
}

/**
 * The committees matching what the organiser has typed, best first, at most
 * `limit` of them. Fewer than two letters returns nothing.
 */
export function searchCatalogue(
	query: string,
	limit: number = DEFAULT_SEARCH_LIMIT
): CatalogueCommittee[] {
	const normalisedQuery = normaliseForSearch(query);

	if (normalisedQuery.length < SHORTEST_QUERY_LENGTH) {
		return [];
	}

	const matches: { committee: CatalogueCommittee; rank: number; position: number }[] = [];

	COMMITTEE_CATALOGUE.forEach((committee, position) => {
		const rank = searchRank(committee, normalisedQuery);

		if (rank !== null) {
			matches.push({ committee, rank, position });
		}
	});

	// Sorting by position as well as rank keeps the order the same on every run.
	matches.sort((first, second) => first.rank - second.rank || first.position - second.position);

	return matches.slice(0, limit).map((match) => match.committee);
}

/** The catalogue entry with this abbreviation, in any case, or `null`. */
export function findCatalogueCommittee(abbreviation: string): CatalogueCommittee | null {
	const wanted = normaliseForSearch(abbreviation);

	return (
		COMMITTEE_CATALOGUE.find(
			(committee) => normaliseForSearch(committee.abbreviation) === wanted
		) ?? null
	);
}

/** "United Nations Security Council (UNSC)". */
export function catalogueLabel(committee: CatalogueCommittee): string {
	return `${committee.name} (${committee.abbreviation})`;
}
