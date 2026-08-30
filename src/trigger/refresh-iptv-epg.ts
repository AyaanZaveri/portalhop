import { logger, queue, schedules, task } from "@trigger.dev/sdk"
import { HOSTED_EPG_COUNTRY_CODES } from "@portalhop/shared/epg-sources"

import { refreshIptvEpgCountry } from "@/lib/iptv-epg-cache"

// Publishing swaps one shared Redis catalogue and its country manifests.
// Serializing scheduled and on-demand refreshes prevents simultaneous runs
// from losing the publish lock after downloading an entire guide.
const iptvEpgRefreshQueue = queue({
  name: "iptv-epg-refresh",
  concurrencyLimit: 1,
})

const hostedCountryCodes = new Set<string>(HOSTED_EPG_COUNTRY_CODES)

async function refreshCountries(countries: string[]) {
  const results: Array<{
    country: string
    refreshed: boolean
    error?: string
  }> = []
  // IPTV-EPG country files use the same upstream hostname, so keep them
  // sequential. This deliberately honours the one-request-per-host policy.
  const allowedCountries = [
    ...new Set(
      countries.map((country) => {
        const code = country.toUpperCase()
        return code === "UK" ? "GB" : code
      }),
    ),
  ].filter((country) => hostedCountryCodes.has(country))

  for (const country of allowedCountries) {
    try {
      results.push({ country, refreshed: await refreshIptvEpgCountry(country) })
    } catch (error) {
      results.push({
        country,
        refreshed: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  logger.log("IPTV-EPG refresh finished", { results })
  return results
}

export const refreshActiveIptvEpgTask = schedules.task({
  id: "refresh-active-iptv-epg",
  cron: "7 * * * *",
  queue: iptvEpgRefreshQueue,
  maxDuration: 3_000,
  run: async () => refreshCountries([...HOSTED_EPG_COUNTRY_CODES]),
})

export const refreshIptvEpgCountryTask = task({
  id: "refresh-iptv-epg-country",
  queue: iptvEpgRefreshQueue,
  maxDuration: 1_200,
  run: async (payload: { country: string }) =>
    refreshCountries([payload.country]),
})
