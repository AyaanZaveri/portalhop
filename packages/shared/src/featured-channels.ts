import { normalizeXmltvId } from "./xmltv-id"

/**
 * The first channels in an otherwise enormous catalogue should make the app
 * immediately useful: familiar services with reliable guide data, not whatever
 * order a portal happened to return. These are IPTV-EPG directory IDs, checked
 * against https://iptv-org.github.io/api/channels.json on 2026-09-01.
 *
 * The country order is intentional (Canada, US, UK), then each market's own
 * familiar channel order. A missing channel simply occupies no space.
 */
export const FEATURED_XMLTV_IDS = [
  // Canada
  "CBCTelevision.ca",
  "CBCNewsNetwork.ca",
  "CTV.ca",
  "CTVNewsChannel.ca",
  "GlobalTelevisionNetwork.ca",
  "Citytv.ca",
  "CP24.ca",
  "BNNBloomberg.ca",
  "TSN1.ca",
  "TSN2.ca",
  "TSN3.ca",
  "TSN4.ca",
  "TSN5.ca",
  "Sportsnet.ca",
  "SportsnetOne.ca",
  "Sportsnet360.ca",
  "ReseauDesSports-RDS.ca",
  "TVASports.ca",
  "WeatherNetwork.ca",
  "FoodNetwork.ca",
  "HGTV.ca",
  "DiscoveryChannel.ca",
  "History.ca",
  "YTV.ca",
  "TreehouseTV.ca",

  // United States
  "ABC.us",
  "CBS.us",
  "NBC.us",
  "Fox.us",
  "PBS.us",
  "CW.us",
  "CNN.us",
  "FoxNewsChannel.us",
  "CNBC.us",
  "ESPN.us",
  "ESPN2.us",
  "FoxSports1.us",
  "NFLNetwork.us",
  "NBATV.us",
  "MLBNetwork.us",
  "NHLNetwork.us",
  "TNT.us",
  "TBS.us",
  "USANetwork.us",
  "AMC.us",
  "FX.us",
  "FXX.us",
  "ComedyCentral.us",
  "FoodNetwork.us",
  "HGTV.us",
  "DiscoveryChannel.us",
  "NationalGeographic.us",
  "History.us",
  "AE.us",
  "Bravo.us",
  "TLC.us",
  "MTV.us",
  "Nickelodeon.us",
  "CartoonNetwork.us",
  "DisneyChannel.us",
  "TheWeatherChannel.us",

  // United Kingdom
  "BBCOne.uk",
  "BBCTwo.uk",
  "BBCThree.uk",
  "BBCFour.uk",
  "BBCNews.uk",
  "CBBC.uk",
  "CBeebies.uk",
  "ITV1London.uk",
  "ITV2.uk",
  "ITV3.uk",
  "ITV4.uk",
  "Channel4.uk",
  "E4.uk",
  "More4.uk",
  "Film4.uk",
  "Channel5.uk",
  "5USA.uk",
  "5STAR.uk",
  "SkyNews.uk",
  "SkyAtlantic.uk",
  "SkySportsMainEvent.uk",
  "SkySportsPremierLeague.uk",
  "SkySportsFootball.uk",
  "SkySportsCricket.uk",
  "SkySportsF1.uk",
  "SkySportsGolf.uk",
  "SkySportsNews.uk",
  "TNTSports1.uk",
  "TNTSports2.uk",
  "DiscoveryChannel.uk",
  "NationalGeographic.uk",
] as const

const featuredRankByXmltvId = new Map(
  FEATURED_XMLTV_IDS.map((id, index) => [normalizeXmltvId(id), index]),
)

/** `undefined` means this is a normal catalogue channel, not a promoted one. */
export function featuredChannelRank(xmltvId: string | null | undefined) {
  return featuredRankByXmltvId.get(normalizeXmltvId(xmltvId))
}
