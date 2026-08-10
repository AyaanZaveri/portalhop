/**
 * The channels this page is argued from.
 *
 * Real logos out of the catalogue, not specimens drawn to make a point. Every
 * rule below was written because one of these broke the rule before it, and the
 * page runs the actual pass on them in the browser rather than showing pictures
 * of what it did once.
 *
 * Served from public/tiles rather than fetched from the hosts they came from.
 * Those hosts are portals and logo packs: they go down, they change a file
 * under its own URL, and several of them answer over plain HTTP. A page
 * explaining an algorithm should not produce different results next month
 * because somebody re-exported a PNG. It also means the canvas reads them
 * same-origin, so nothing here depends on a proxy returning the right CORS
 * header before a single number can be measured.
 */
export const LOGOS = {
  tsn: "/tiles/tsn-1.png",
  cp24: "/tiles/cp24.png",
  gameShow: "/tiles/game-show-network.png",
  foodNetwork: "/tiles/food-network.png",
  cnn: "/tiles/cnn.png",
  espn: "/tiles/espn.png",
  hgtv: "/tiles/hgtv.png",
  /** A peacock beside black type, which is what the light tile exists for. */
  kfor: "/tiles/nbc-kfor.png",
  /**
   * A small filled box on a large canvas, so the artwork nearly doubles once
   * the tile fits it rather than fitting the file.
   */
  fs1: "/tiles/fox-sports-1.png",
  /** Silver ink, no hue in it, and dark enough to vanish against the tile. */
  nhl: "/tiles/nhl-network.png",
  skyF1: "/tiles/sky-sports-f1.png",
  cityNews: "/tiles/citynews.png",
  tennis: "/tiles/tennis-channel.png",
} as const

/** The line-up at the top, chosen so every branch of the pass appears once. */
export const ROSTER: { name: string; url: string }[] = [
  { name: "TSN 1", url: LOGOS.tsn },
  { name: "Tennis Channel", url: LOGOS.tennis },
  { name: "Food Network", url: LOGOS.foodNetwork },
  { name: "CNN", url: LOGOS.cnn },
  { name: "ESPN", url: LOGOS.espn },
  { name: "HGTV", url: LOGOS.hgtv },
  { name: "Sky Sports F1", url: LOGOS.skyF1 },
  { name: "FOX Sports 1", url: LOGOS.fs1 },
  { name: "NHL Network", url: LOGOS.nhl },
  { name: "CityNews", url: LOGOS.cityNews },
  { name: "Game Show Network", url: LOGOS.gameShow },
  { name: "CP24", url: LOGOS.cp24 },
]
