import { Readable } from "stream";
import zlib from "zlib";
import readline from "readline";
import type { EpgProgramme } from "@/lib/stalker-types";

export interface EpgChannel {
  id: string;
  name: string;
  logoUrl?: string;
}

type XmltvProgramme = Omit<EpgProgramme, "source">;

/**
 * Fetches a gzipped XMLTV file from the given URL and parses it on the fly.
 * Uses a highly optimized line-by-line reading strategy: because the XMLTV DTD
 * requires all `<channel>` elements to precede all `<programme>` elements,
 * we can stop downloading and parsing as soon as we hit the first `<programme>`
 * tag. This saves massive amounts of memory and network bandwidth.
 */
// Fetches an XMLTV file and returns a decompressed line source, auto-detecting
// gzip vs plain XML. The iptv-epg.org files are raw `.xml.gz` (no
// Content-Encoding, so `fetch` won't unzip them), while custom EPG endpoints
// (e.g. xmltv.php) are usually plain XML. This handles both by peeking the
// first bytes for the gzip magic number (0x1f 0x8b) without consuming them.
async function fetchXmltvStream(
  url: string
): Promise<{ stream: Readable; cleanup: () => void }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch EPG from ${url}: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error(`Empty response body from ${url}`);
  }

  const source = Readable.fromWeb(
    response.body as unknown as import("stream/web").ReadableStream
  );

  const head = await new Promise<Buffer>((resolve, reject) => {
    const onReadable = () => {
      const chunk = source.read();
      if (chunk === null) return;
      source.off("readable", onReadable);
      source.off("end", onEnd);
      source.off("error", reject);
      resolve(chunk as Buffer);
    };
    const onEnd = () => {
      source.off("readable", onReadable);
      resolve(Buffer.alloc(0));
    };
    source.on("readable", onReadable);
    source.once("end", onEnd);
    source.once("error", reject);
  });

  if (head.length) {
    source.unshift(head);
  }

  const isGzip = head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;

  if (!isGzip) {
    return { stream: source, cleanup: () => source.destroy() };
  }

  const gunzip = zlib.createGunzip();
  source.on("error", (err) => gunzip.destroy(err));

  return {
    stream: source.pipe(gunzip),
    cleanup: () => {
      gunzip.destroy();
      source.destroy();
    },
  };
}

export async function fetchAndParseEpg(url: string): Promise<EpgChannel[]> {
  const { stream, cleanup: closeStream } = await fetchXmltvStream(url);

  return new Promise<EpgChannel[]>((resolve, reject) => {
    const channels: EpgChannel[] = [];
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let inChannel = false;
    let currentId = "";
    let currentName = "";
    let currentLogoUrl = "";

    const cleanup = () => {
      rl.close();
      closeStream();
    };

    rl.on("line", (line) => {
      const trimmed = line.trim();

      // Stop downloading and parsing immediately if we see programme tags
      if (trimmed.startsWith("<programme") || trimmed.includes("<programme")) {
        cleanup();
        return;
      }

      // If we see a channel tag start
      if (trimmed.startsWith('<channel id="') || trimmed.includes('<channel id="')) {
        inChannel = true;
        const idMatch = trimmed.match(/id="([^"]+)"/);
        currentId = idMatch ? idMatch[1] : "";
        currentName = "";
        currentLogoUrl = "";
      }

      if (inChannel) {
        if (trimmed.includes("<display-name")) {
          // Match text inside <display-name...>...</display-name>
          const nameMatch = trimmed.match(/>([^<]+)<\/display-name>/);
          if (nameMatch) {
            currentName = nameMatch[1];
          }
        }

        if (trimmed.includes('<icon src="') || trimmed.includes("<icon")) {
          const srcMatch = trimmed.match(/src="([^"]+)"/);
          if (srcMatch) {
            currentLogoUrl = srcMatch[1];
          }
        }

        if (trimmed.includes("</channel>")) {
          if (currentId && currentName) {
            channels.push({
              id: currentId,
              name: currentName,
              logoUrl: currentLogoUrl || undefined,
            });
          }
          inChannel = false;
          currentId = "";
          currentName = "";
          currentLogoUrl = "";
        }
      }
    });

    rl.on("close", () => {
      resolve(channels);
    });

    rl.on("error", (err) => {
      cleanup();
      reject(err);
    });

    stream.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

export async function fetchAndParseEpgProgrammes(
  url: string,
  channelIds: string[],
  options: { from?: Date; to?: Date; limit?: number } = {}
): Promise<XmltvProgramme[]> {
  const wantedIds = new Set(channelIds.map((id) => id.trim()).filter(Boolean));

  if (!wantedIds.size) {
    return [];
  }

  const from = options.from ?? new Date(Date.now() - 30 * 60 * 1000);
  const to = options.to ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const limit = options.limit ?? 12;
  const { stream, cleanup: closeStream } = await fetchXmltvStream(url);

  return new Promise<XmltvProgramme[]>((resolve, reject) => {
    const programmes: XmltvProgramme[] = [];
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });
    let current: XmltvProgramme | null = null;

    const cleanup = () => {
      rl.close();
      closeStream();
    };

    rl.on("line", (line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("<programme")) {
        const attrs = readXmlAttributes(trimmed);
        const channelId = attrs.channel ?? "";
        const startAt = parseXmltvDate(attrs.start ?? "");
        const stopAt = parseXmltvDate(attrs.stop ?? "");

        if (
          wantedIds.has(channelId) &&
          startAt &&
          stopAt &&
          stopAt > from &&
          startAt < to
        ) {
          current = {
            id: `${channelId}:${startAt.toISOString()}`,
            channelId,
            title: "",
            description: "",
            category: "",
            startAt: startAt.toISOString(),
            stopAt: stopAt.toISOString(),
          };
        } else {
          current = null;
        }
      }

      if (current) {
        const title = readXmlText(trimmed, "title");
        const description = readXmlText(trimmed, "desc");
        const category = readXmlText(trimmed, "category");

        if (title) {
          current.title = title;
        }

        if (description) {
          current.description = description;
        }

        if (category) {
          current.category = category;
        }
      }

      if (trimmed.includes("</programme>") && current) {
        if (current.title) {
          programmes.push(current);
        }
        current = null;

        if (programmes.length >= limit) {
          cleanup();
        }
      }
    });

    rl.on("close", () => {
      resolve(
        programmes.sort(
          (a, b) =>
            new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        )
      );
    });

    rl.on("error", (err) => {
      cleanup();
      reject(err);
    });

    stream.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

function readXmlAttributes(value: string) {
  const attrs: Record<string, string> = {};
  const attrPattern = /([:\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(value))) {
    attrs[match[1]] = decodeXmlText(match[2]);
  }

  return attrs;
}

function readXmlText(value: string, tagName: string) {
  const match = value.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? decodeXmlText(match[1]).trim() : "";
}

function parseXmltvDate(value: string) {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, sign, offsetHour, offsetMinute] =
    match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  const offsetMs =
    sign && offsetHour && offsetMinute
      ? (Number(offsetHour) * 60 + Number(offsetMinute)) * 60 * 1000
      : 0;

  return new Date(sign === "-" ? timestamp + offsetMs : timestamp - offsetMs);
}

function decodeXmlText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
