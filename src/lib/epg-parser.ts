import { Readable } from "stream";
import zlib from "zlib";
import readline from "readline";

export interface EpgChannel {
  id: string;
  name: string;
  logoUrl?: string;
}

/**
 * Fetches a gzipped XMLTV file from the given URL and parses it on the fly.
 * Uses a highly optimized line-by-line reading strategy: because the XMLTV DTD
 * requires all `<channel>` elements to precede all `<programme>` elements,
 * we can stop downloading and parsing as soon as we hit the first `<programme>`
 * tag. This saves massive amounts of memory and network bandwidth.
 */
export async function fetchAndParseEpg(url: string): Promise<EpgChannel[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch EPG from ${url}: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`Empty response body from ${url}`);
  }

  // Convert Web ReadableStream to Node Readable
  const nodeReadable = Readable.fromWeb(response.body as unknown as import("stream/web").ReadableStream);
  
  // Gunzip the stream
  const gunzip = zlib.createGunzip();
  const unzippedStream = nodeReadable.pipe(gunzip);

  return new Promise<EpgChannel[]>((resolve, reject) => {
    const channels: EpgChannel[] = [];
    const rl = readline.createInterface({
      input: unzippedStream,
      crlfDelay: Infinity,
    });

    let inChannel = false;
    let currentId = "";
    let currentName = "";
    let currentLogoUrl = "";

    const cleanup = () => {
      rl.close();
      gunzip.destroy();
      nodeReadable.destroy();
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

    gunzip.on("error", (err) => {
      cleanup();
      reject(err);
    });

    nodeReadable.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}
