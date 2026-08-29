import { logger, task } from "@trigger.dev/sdk";

/**
 * A small development task that proves the PortalHop worker is connected.
 *
 * This intentionally has no side effects. The upcoming EPG cache refresh task
 * will live beside it and use the same Trigger.dev worker.
 */
export const portalhopReadyTask = task({
  id: "portalhop-ready",
  maxDuration: 30,
  run: async (payload: { requestedAt?: string }) => {
    const readyAt = new Date().toISOString();

    logger.log("PortalHop background worker is ready", {
      requestedAt: payload.requestedAt ?? null,
      readyAt,
    });

    return { readyAt };
  },
});
