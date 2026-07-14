"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon, WaypointsIcon } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { SettingsHeader } from "@/components/settings-header";
import { useAiSettings } from "@/hooks/use-ai-settings";

interface ModelInfo {
  id: string;
}

interface ModelsResponse {
  data?: ModelInfo[];
}

export default function LlmProviderSettingsPage() {
  const { settings, saveSettings, mounted, envBaseUrl, envApiKey } =
    useAiSettings();
  const [model, setModel] = React.useState("");
  const [overrideEnv, setOverrideEnv] = React.useState(false);
  const [customBaseUrl, setCustomBaseUrl] = React.useState("");
  const [customApiKey, setCustomApiKey] = React.useState("");
  const [reasoningEffort, setReasoningEffort] = React.useState<
    "none" | "low" | "medium" | "high" | "max"
  >("none");
  const [models, setModels] = React.useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);

  React.useEffect(() => {
    if (mounted) {
      queueMicrotask(() => {
        setModel(settings.model);
        setOverrideEnv(settings.overrideEnv ?? false);
        setCustomBaseUrl(settings.customBaseUrl ?? "");
        setCustomApiKey(settings.customApiKey ?? "");
        setReasoningEffort(settings.reasoningEffort ?? "none");
      });
    }
  }, [mounted, settings]);

  const fetchModels = React.useCallback(async (url?: string, key?: string) => {
    setFetchingModels(true);
    try {
      const res = await fetch("/api/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url ?? "", apiKey: key ?? "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: ModelsResponse = await res.json();
      const ids = (data.data ?? []).map((item) => item.id).filter(Boolean);
      setModels(ids);
      if (ids.length === 0) {
        toast.error("No models found at this endpoint.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch models";
      toast.error(message);
      setModels([]);
    } finally {
      setFetchingModels(false);
    }
  }, []);

  React.useEffect(() => {
    if (!overrideEnv) {
      if (envBaseUrl && envApiKey) {
        void Promise.resolve().then(() => fetchModels());
      }
    } else if (customBaseUrl.trim() && customApiKey.trim()) {
      void Promise.resolve().then(() =>
        fetchModels(customBaseUrl, customApiKey)
      );
    }
  }, [overrideEnv, customBaseUrl, customApiKey, envBaseUrl, envApiKey, fetchModels]);

  const normalizedModel = model ?? "";
  const envConfigured = envBaseUrl && envApiKey;
  const canSave =
    normalizedModel.trim().length > 0 &&
    (envConfigured ||
      (overrideEnv &&
        customBaseUrl.trim().length > 0 &&
        customApiKey.trim().length > 0));

  function handleSave() {
    saveSettings({
      model: normalizedModel.trim(),
      reasoningEffort,
      overrideEnv,
      customBaseUrl: overrideEnv ? customBaseUrl.trim() : "",
      customApiKey: overrideEnv ? customApiKey.trim() : "",
    });
    toast.success("LLM settings saved");
  }

  async function handleTest() {
    setIsTesting(true);
    const toastId = toast.loading("Testing LLM provider...");
    try {
      const response = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: overrideEnv ? customBaseUrl : "",
          apiKey: overrideEnv ? customApiKey : "",
          model: normalizedModel,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const timing = `${data.model} · ${(data.responseTimeMs / 1000).toFixed(2)}s`;
      if (data.jsonSupported) {
        toast.success("LLM provider is working", {
          id: toastId,
          description: `${timing} · JSON output supported`,
        });
      } else {
        // Enrichment sends response_format:{type:"json_object"} — a model
        // without it drops matches, so warn instead of a clean success.
        toast.warning("Model has no JSON output mode", {
          id: toastId,
          description: `${timing} · channel matching needs a model that supports JSON output`,
        });
      }
    } catch (error) {
      toast.error("LLM provider test failed", {
        id: toastId,
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        icon={WaypointsIcon}
        title="LLM Provider"
        description="Connect an OpenAI-compatible model to help sort your channels."
      />

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">What this powers</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Powers{" "}
          <span className="font-medium text-foreground">Auto-match guide</span>,
          which pairs your channels with the right guide data. It only steps in
          on the tricky names, so most of the matching is free. Any
          OpenAI-compatible endpoint works.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {overrideEnv ? (
          <>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-base-url">Base URL</Label>
                <Label
                  htmlFor="override-env"
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span>
                    Override <span className="font-mono">.env</span>
                  </span>
                  <Switch
                    id="override-env"
                    checked={overrideEnv}
                    onCheckedChange={setOverrideEnv}
                  />
                </Label>
              </div>
              <Input
                id="ai-base-url"
                type="url"
                placeholder="https://api.openai.com/v1"
                value={customBaseUrl}
                onChange={(event) => setCustomBaseUrl(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <Label htmlFor="ai-api-key">API Key</Label>
              <Input
                id="ai-api-key"
                type="password"
                placeholder="sk-..."
                value={customApiKey}
                onChange={(event) => setCustomApiKey(event.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <Label>Base URL</Label>
                <Label
                  htmlFor="override-env"
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span>
                    Override <span className="font-mono">.env</span>
                  </span>
                  <Switch
                    id="override-env"
                    checked={overrideEnv}
                    onCheckedChange={setOverrideEnv}
                  />
                </Label>
              </div>
              <div className="flex h-8 items-center text-sm text-muted-foreground">
                {envBaseUrl ?? "Not configured"}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Label>API Key</Label>
              <div className="flex h-8 items-center text-sm text-muted-foreground">
                {envApiKey ? "Using key from .env" : "Not configured"}
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col gap-2.5">
          <Label>Model</Label>
          {fetchingModels ? (
            <div className="flex h-8 items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              Fetching models...
            </div>
          ) : models.length === 0 ? (
            <div className="flex h-8 items-center text-sm text-muted-foreground">
              {overrideEnv
                ? "Enter base URL and API key first"
                : "Waiting for env configuration..."}
            </div>
          ) : (
            <Combobox
              items={models}
              value={normalizedModel}
              onValueChange={(value) => setModel((value as string | null) ?? "")}
            >
              <ComboboxInput
                placeholder="Select a model..."
                showTrigger
                showClear
              />
              <ComboboxContent>
                <ComboboxList>
                  {(item: string) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxList>
                <ComboboxEmpty>No models match your search</ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <Label>Reasoning Effort</Label>
          <Tabs
            value={reasoningEffort}
            onValueChange={(value) =>
              setReasoningEffort(
                value as "none" | "low" | "medium" | "high" | "max"
              )
            }
          >
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="none">None</TabsTrigger>
              <TabsTrigger value="low">Low</TabsTrigger>
              <TabsTrigger value="medium">Medium</TabsTrigger>
              <TabsTrigger value="high">High</TabsTrigger>
              <TabsTrigger value="max">Max</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={!canSave || isTesting}
          >
            {isTesting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            Test
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
            <CheckIcon className="size-3.5" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
