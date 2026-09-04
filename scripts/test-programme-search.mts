import {
  programmeMatchesTerms,
  programmeSearchTerms,
} from "../packages/shared/src/programme-search"

const cases = [
  {
    title: "2026 US Open Tennis",
    query: "us open",
    expected: true,
  },
  {
    title: "2026 US Open Tennis",
    query: "open us",
    expected: true,
  },
  {
    title: "College Football",
    query: "us open",
    expected: false,
  },
  {
    title: "MLB: Brewers @ Cubs",
    query: "brew cub",
    expected: true,
  },
]

for (const { title, query, expected } of cases) {
  const actual = programmeMatchesTerms(programmeSearchTerms(title), query)
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(query)} against ${JSON.stringify(title)} to be ${expected}.`,
    )
  }
}

console.log(`Programme search passed ${cases.length} representative cases.`)
