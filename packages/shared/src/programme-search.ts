/** Terms used for programme search in the worker and its regression harness. */
export function programmeSearchTerms(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 2)
}

/** Every query term must be a prefix of at least one programme term. */
export function programmeMatchesTerms(
  programmeTerms: readonly string[],
  query: string,
) {
  const queryTerms = programmeSearchTerms(query)
  return (
    queryTerms.length > 0 &&
    queryTerms.every((term) =>
      programmeTerms.some((programmeTerm) => programmeTerm.startsWith(term)),
    )
  )
}
