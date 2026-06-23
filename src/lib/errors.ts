export function readErrorDetails(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "details" in error &&
    Array.isArray(error.details)
  ) {
    return error.details
  }

  return []
}
