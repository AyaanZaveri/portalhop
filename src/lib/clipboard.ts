export async function readTextFromClipboard(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    throw new Error("Clipboard reading isn't supported in this browser.")
  }

  return navigator.clipboard.readText()
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (err) {
      console.warn("navigator.clipboard.writeText failed, trying fallback:", err)
    }
  }

  // Fallback for insecure contexts (e.g. HTTP access from a local network IP address)
  if (typeof document !== "undefined") {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.top = "0"
    textArea.style.left = "0"
    textArea.style.opacity = "0"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    try {
      const successful = document.execCommand("copy")
      if (!successful) {
        throw new Error("Copy command was unsuccessful")
      }
    } catch (err) {
      console.error("Fallback clipboard copy failed:", err)
      throw new Error("Unable to copy to clipboard")
    } finally {
      document.body.removeChild(textArea)
    }
  } else {
    throw new Error("Clipboard API not available")
  }
}
