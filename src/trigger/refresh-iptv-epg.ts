import { logger, schedules, task } from "@trigger.dev/sdk"

import {
  getActiveIptvEpgCountries,
  refreshIptvEpgCountry,
} from "@/lib/iptv-epg-cache"

async function refreshCountries(countries: string[]) {
  const results: Array<{ country: string; refreshed: boolean; error?: string }> = []
  // IPTV-EPG country files use the same upstream hostname, so keep them
  // sequential. This deliberately honours the one-request-per-host policy.
  for (const country of countries) {
    try {
      results.push({ country, refreshed: await refreshIptvEpgCountry(country) })
    } catch (error) {
      results.push({ country, refreshed: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  logger.log("IPTV-EPG refresh finished", { results })
  return results
}

export const refreshActiveIptvEpgTask = schedules.task({
  id: "refresh-active-iptv-epg",
  cron: "7 * * * *",
  maxDuration: 3_000,
  run: async () => refreshCountries(await getActiveIptvEpgCountries()),
})

export const refreshIptvEpgCountryTask = task({
  id: "refresh-iptv-epg-country",
  maxDuration: 1_200,
  run: async (payload: { country: string }) => refreshCountries([payload.country]),
})
