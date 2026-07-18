// Maps IPTV category names to a circle flag (https://hatscripts.github.io/circle-flags/)
// or a semantic Lucide icon.
//
// Category names are messy and mix signals: country codes ("GR | SPORTS"),
// country names ("CYPRUS"), languages ("URDU"), demonyms ("PAKISTANI"),
// ethnicities, and genres ("SPORTS", "KIDS"). We resolve them in priority order:
//   1. A leading country code before a delimiter ("GR | ...", "US: ...").
//   2. A country/place-name keyword anywhere in the name (highest-confidence signal).
//   3. A demonym or language keyword anywhere in the name (lower confidence, e.g.
//      "English" alone could describe several countries, so this only wins when
//      no actual country name is present in the string, per #2).
//   4. A genre keyword ("sports", "movies") → Lucide icon.
//   5. Nothing → caller renders a neutral fallback icon.
//
// The country-first ordering matters: a name like "English Canada" must resolve
// to Canada (a real place name), not the UK (from "English", a language/demonym
// that happens to appear in the string too).
//
// Many keywords intentionally point at one flag (Urdu + Pakistan + Pakistani → pk).
// Keep each keyword unique across FLAG_ALIASES; the last write would otherwise win.

import { COUNTRY_NAME_CODES } from "@/lib/country-codes"

export type CategoryIcon =
  | "sports"
  | "movies"
  | "kids"
  | "music"
  | "radio"
  | "news"
  | "documentary"
  | "entertainment"
  | "religious"
  | "adult"
  | "vip"
  | "region"
  | "unknown"

export type CategoryVisual =
  | { kind: "flag"; code: string }
  | { kind: "icon"; icon: CategoryIcon }

type CountryAliases = {
  // Actual place names / abbreviations for the country itself. Checked first.
  primary: string[]
  // Demonyms, languages, and informal terms. Only checked if no primary
  // keyword (for this or any other country) matched anywhere in the string.
  secondary: string[]
}

// ISO 3166-1 alpha-2 code -> place-name keywords (primary) and demonym/language
// keywords (secondary).
const FLAG_ALIASES: Record<string, CountryAliases> = {
  af: { primary: ["afghanistan"], secondary: ["afghan", "afghani", "pashto", "dari"] },
  al: { primary: ["albania"], secondary: ["albanian", "shqip", "shqiptar"] },
  sa: { primary: ["saudi", "arabia"], secondary: ["arabic", "arab"] },
  dz: { primary: ["algeria"], secondary: ["algerian"] },
  eg: { primary: ["egypt"], secondary: ["egyptian"] },
  ma: { primary: ["morocco"], secondary: ["moroccan", "maghreb"] },
  tn: { primary: ["tunisia"], secondary: ["tunisian"] },
  ly: { primary: ["libya"], secondary: ["libyan"] },
  iq: { primary: ["iraq"], secondary: ["iraqi", "kurdish", "kurdistan"] },
  sy: { primary: ["syria"], secondary: ["syrian"] },
  jo: { primary: ["jordan"], secondary: ["jordanian"] },
  lb: { primary: ["lebanon"], secondary: ["lebanese"] },
  ae: { primary: ["emirates", "uae", "dubai", "abudhabi"], secondary: [] },
  qa: { primary: ["qatar"], secondary: ["qatari"] },
  kw: { primary: ["kuwait"], secondary: ["kuwaiti"] },
  om: { primary: ["oman"], secondary: ["omani"] },
  ye: { primary: ["yemen"], secondary: ["yemeni"] },
  bh: { primary: ["bahrain"], secondary: ["bahraini"] },
  ps: { primary: ["palestine"], secondary: ["palestinian"] },
  il: { primary: ["israel"], secondary: ["israeli", "hebrew"] },
  ir: { primary: ["iran"], secondary: ["iranian", "persian", "farsi"] },
  tr: { primary: ["turkey", "turkiye"], secondary: ["turkish", "turk"] },
  pk: { primary: ["pakistan"], secondary: ["pakistani", "urdu"] },
  in: {
    primary: ["india"],
    secondary: [
      "indian",
      "hindi",
      "gujarati",
      "kannada",
      "malayalam",
      "marathi",
      "odia",
      "oriya",
      "bhojpuri",
      "punjabi",
      "tamil",
      "telugu",
      "bollywood",
      "desi",
      "assamese",
    ],
  },
  bd: { primary: ["bangladesh"], secondary: ["bangladeshi", "bengali", "bangla"] },
  lk: {
    primary: ["srilanka", "sri lanka", "ceylon"],
    secondary: ["sinhala", "sinhalese", "lankan"],
  },
  np: { primary: ["nepal"], secondary: ["nepali", "nepalese"] },
  bt: { primary: ["bhutan"], secondary: ["bhutanese"] },
  mm: { primary: ["myanmar", "burma"], secondary: ["burmese"] },
  th: { primary: ["thailand"], secondary: ["thai"] },
  vn: { primary: ["vietnam"], secondary: ["vietnamese"] },
  kh: { primary: ["cambodia"], secondary: ["khmer"] },
  ph: { primary: ["philippines"], secondary: ["filipino", "tagalog", "pinoy"] },
  id: { primary: ["indonesia"], secondary: ["indonesian"] },
  my: { primary: ["malaysia"], secondary: ["malay", "malaysian"] },
  sg: { primary: ["singapore"], secondary: ["singaporean"] },
  cn: { primary: ["china"], secondary: ["chinese", "mandarin", "cantonese"] },
  hk: { primary: ["hongkong", "hong kong"], secondary: [] },
  tw: { primary: ["taiwan"], secondary: ["taiwanese"] },
  jp: { primary: ["japan", "nippon"], secondary: ["japanese"] },
  kr: { primary: ["korea", "south korea"], secondary: ["korean", "kdrama"] },
  mn: { primary: ["mongolia"], secondary: ["mongolian"] },
  gb: {
    primary: ["uk", "united kingdom", "britain", "england", "wales", "scotland"],
    secondary: ["british", "english", "welsh", "scottish"],
  },
  ie: { primary: ["ireland"], secondary: ["irish"] },
  fr: { primary: ["france"], secondary: ["french", "francais"] },
  de: { primary: ["germany", "deutschland"], secondary: ["german", "deutsch", "bundesliga"] },
  nl: { primary: ["netherlands", "holland", "nederland"], secondary: ["dutch"] },
  be: { primary: ["belgium"], secondary: ["belgian"] },
  ch: { primary: ["switzerland"], secondary: ["swiss"] },
  at: { primary: ["austria"], secondary: ["austrian"] },
  it: { primary: ["italy", "italia"], secondary: ["italian", "calcio"] },
  es: {
    primary: ["spain", "espana"],
    secondary: ["spanish", "espanol", "castellano", "laliga"],
  },
  pt: { primary: ["portugal"], secondary: ["portuguese", "portugues"] },
  gr: { primary: ["greece", "hellas"], secondary: ["greek", "hellenic"] },
  cy: { primary: ["cyprus"], secondary: ["cypriot"] },
  mt: { primary: ["malta"], secondary: ["maltese"] },
  pl: { primary: ["poland", "polski"], secondary: ["polish"] },
  cz: { primary: ["czech", "czechia"], secondary: [] },
  sk: { primary: ["slovakia"], secondary: ["slovak"] },
  hu: { primary: ["hungary", "magyar"], secondary: ["hungarian"] },
  ro: { primary: ["romania", "romana"], secondary: ["romanian"] },
  bg: { primary: ["bulgaria"], secondary: ["bulgarian"] },
  rs: {
    primary: ["serbia", "yugoslavia", "exyu", "ex yu", "xyu"],
    secondary: ["serbian"],
  },
  hr: { primary: ["croatia", "hrvatska"], secondary: ["croatian"] },
  si: { primary: ["slovenia"], secondary: ["slovenian"] },
  ba: { primary: ["bosnia"], secondary: ["bosnian"] },
  mk: { primary: ["macedonia"], secondary: ["macedonian"] },
  me: { primary: ["montenegro"], secondary: [] },
  ru: { primary: ["russia", "russkiy"], secondary: ["russian"] },
  ua: { primary: ["ukraine"], secondary: ["ukrainian"] },
  by: { primary: ["belarus"], secondary: ["belarusian"] },
  lt: { primary: ["lithuania"], secondary: ["lithuanian"] },
  lv: { primary: ["latvia"], secondary: ["latvian"] },
  ee: { primary: ["estonia"], secondary: ["estonian"] },
  fi: { primary: ["finland", "suomi"], secondary: ["finnish"] },
  se: { primary: ["sweden", "sverige"], secondary: ["swedish"] },
  no: { primary: ["norway", "norge"], secondary: ["norwegian"] },
  dk: { primary: ["denmark", "dansk"], secondary: ["danish"] },
  is: { primary: ["iceland"], secondary: ["icelandic"] },
  us: { primary: ["usa", "america", "united states"], secondary: ["american"] },
  ca: { primary: ["canada"], secondary: ["canadian"] },
  mx: { primary: ["mexico", "mexicano"], secondary: ["mexican"] },
  br: { primary: ["brazil", "brasil"], secondary: ["brazilian", "brasileiro"] },
  ar: { primary: ["argentina", "argentine"], secondary: ["argentinian"] },
  cl: { primary: ["chile"], secondary: ["chilean"] },
  co: { primary: ["colombia"], secondary: ["colombian"] },
  pe: { primary: ["peru"], secondary: ["peruvian"] },
  ve: { primary: ["venezuela"], secondary: ["venezuelan"] },
  za: { primary: ["south africa"], secondary: ["south african", "afrikaans", "zulu"] },
  ng: {
    primary: ["nigeria"],
    secondary: ["nigerian", "nollywood", "yoruba", "igbo", "hausa"],
  },
  gh: { primary: ["ghana"], secondary: ["ghanaian"] },
  ke: { primary: ["kenya"], secondary: ["kenyan", "swahili"] },
  et: { primary: ["ethiopia"], secondary: ["ethiopian", "amharic"] },
  so: { primary: ["somalia"], secondary: ["somali"] },
  au: { primary: ["australia"], secondary: ["australian", "aussie"] },
  nz: { primary: ["new zealand"], secondary: ["kiwi"] },
}

// Non-ISO leading prefixes providers use ("UK | ...", "GER | ...").
const LEADING_OVERRIDES: Record<string, string> = {
  uk: "gb",
  eng: "gb",
  en: "gb",
  ger: "de",
  ita: "it",
  esp: "es",
  spa: "es",
  por: "pt",
  fra: "fr",
  ned: "nl",
  gre: "gr",
  rus: "ru",
  ukr: "ua",
  tur: "tr",
  ara: "sa",
  ind: "in",
}

// Genre / type keywords -> icon. Checked only after flags fail to match.
const ICON_ALIASES: Record<CategoryIcon, string[]> = {
  sports: [
    "sport",
    "sports",
    "football",
    "soccer",
    "futbol",
    "cricket",
    "tennis",
    "basketball",
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "ufc",
    "mma",
    "boxing",
    "wwe",
    "wrestling",
    "rugby",
    "golf",
    "f1",
    "formula",
    "motogp",
    "ppv",
    "fifa",
    "world cup",
    "champions league",
    "premier league",
  ],
  movies: ["movie", "movies", "cinema", "film", "films", "vod", "hollywood"],
  kids: ["kid", "kids", "children", "cartoon", "cartoons", "baby", "junior"],
  music: ["music", "musik", "musica", "songs", "hits"],
  radio: ["radio"],
  news: ["news", "noticias"],
  documentary: [
    "documentary",
    "documentaries",
    "docu",
    "docs",
    "discovery",
    "history",
  ],
  entertainment: ["entertainment", "general", "variety", "lifestyle", "reality"],
  religious: [
    "religious",
    "religion",
    "islam",
    "islamic",
    "muslim",
    "quran",
    "christian",
    "church",
    "gospel",
    "spiritual",
    "hindu",
    "sikh",
    "gurbani",
    "bhakti",
    "catholic",
  ],
  adult: ["adult", "xxx", "porn"],
  vip: ["vip", "premium", "exclusive"],
  region: [
    "international",
    "africa",
    "african",
    "caribbean",
    "latino",
    "latin",
    "balkan",
    "balkans",
    "nordic",
    "scandinavia",
    "europe",
    "european",
    "asia",
    "asian",
  ],
  unknown: ["undefined", "uncategorized"],
}

const FLAG_CODES = new Set(Object.keys(FLAG_ALIASES))

// Split single-word from multi-word aliases so single words can match on token
// boundaries (avoiding "us" inside "plus") while phrases match as substrings.
// Kept as two separate tiers (primary place names vs. secondary demonyms/
// languages) so a real country name always outranks a language/demonym.
function buildKeywordMaps(pick: (aliases: CountryAliases) => string[]) {
  const single = new Map<string, string>()
  const multi: Array<[string, string]> = []
  for (const [code, aliases] of Object.entries(FLAG_ALIASES)) {
    for (const alias of pick(aliases)) {
      if (alias.includes(" ")) {
        multi.push([alias, code])
      } else {
        single.set(alias, code)
      }
    }
  }
  return { single, multi }
}

const FLAG_PRIMARY = buildKeywordMaps((a) => a.primary)
const FLAG_SECONDARY = buildKeywordMaps((a) => a.secondary)

const ICON_KEYWORDS_SINGLE = new Map<string, CategoryIcon>()
const ICON_KEYWORDS_MULTI: Array<[string, CategoryIcon]> = []
for (const [icon, aliases] of Object.entries(ICON_ALIASES) as Array<
  [CategoryIcon, string[]]
>) {
  for (const alias of aliases) {
    if (alias.includes(" ")) {
      ICON_KEYWORDS_MULTI.push([alias, icon])
    } else {
      ICON_KEYWORDS_SINGLE.set(alias, icon)
    }
  }
}

export function resolveCategoryVisual(category: string): CategoryVisual | null {
  const raw = category.toLowerCase().trim()
  if (!raw) return null

  const spaced = raw.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
  const tokens = spaced.split(" ").filter(Boolean)

  // 0. Exact country name (the iptv-org country playlist groups by these).
  const exactCountry = COUNTRY_NAME_CODES[spaced]
  if (exactCountry) return { kind: "flag", code: exactCountry }

  // 1. Leading country code before a delimiter: "gr | ...", "us: ...".
  const prefix = raw.match(/^([a-z]{2,4})\s*[|:/>•\-–—]/)?.[1]
  if (prefix) {
    if (FLAG_CODES.has(prefix)) return { kind: "flag", code: prefix }
    const override = LEADING_OVERRIDES[prefix]
    if (override) return { kind: "flag", code: override }
  }

  // 2. Country/place-name keyword, checked in full across the whole string
  // before ever considering a demonym/language, so e.g. "English Canada"
  // resolves to Canada (a real place), not the UK (from "English").
  for (const [alias, code] of FLAG_PRIMARY.multi) {
    if (spaced.includes(alias)) return { kind: "flag", code }
  }
  for (const token of tokens) {
    const code = FLAG_PRIMARY.single.get(token)
    if (code) return { kind: "flag", code }
  }

  // 3. Demonym / language keyword (lower confidence than an actual place name).
  for (const [alias, code] of FLAG_SECONDARY.multi) {
    if (spaced.includes(alias)) return { kind: "flag", code }
  }
  for (const token of tokens) {
    const code = FLAG_SECONDARY.single.get(token)
    if (code) return { kind: "flag", code }
  }

  // 4. Genre keyword.
  for (const [alias, icon] of ICON_KEYWORDS_MULTI) {
    if (spaced.includes(alias)) return { kind: "icon", icon }
  }
  for (const token of tokens) {
    const icon = ICON_KEYWORDS_SINGLE.get(token)
    if (icon) return { kind: "icon", icon }
  }

  return null
}

export function circleFlagUrl(code: string): string {
  return `https://hatscripts.github.io/circle-flags/flags/${code}.svg`
}
