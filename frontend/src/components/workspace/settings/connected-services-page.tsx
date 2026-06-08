"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  KeyIcon,
  Link2Icon,
  Link2OffIcon,
  Loader2Icon,
  PlugIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { useI18n } from "@/core/i18n/hooks";
import {
  listAvailableServers,
  listUserCredentials,
  saveCredential,
  deleteCredential,
  type ServerMetadata,
} from "@/core/mcp/credentials-api";
import { cn } from "@/lib/utils";

import { SettingsSection } from "./settings-section";

export function ConnectedServicesPage() {
  const { t } = useI18n();

  const { data: serversData, isLoading: serversLoading, error: serversError } = useQuery({
    queryKey: ["mcpAvailableServers"],
    queryFn: () => listAvailableServers(),
  });

  const { data: credsData, isLoading: credsLoading, error: credsError } = useQuery({
    queryKey: ["mcpCredentials"],
    queryFn: () => listUserCredentials(),
  });

  const isLoading = serversLoading || credsLoading;
  const error = serversError || credsError;

  // Build a map of server_name -> connected status
  const connectedMap = new Map<string, boolean>();
  if (credsData?.credentials) {
    for (const entry of credsData.credentials) {
      connectedMap.set(entry.server_name, entry.status === "connected");
    }
  }

  return (
    <SettingsSection
      title="Connected Services"
      description="Connect your personal accounts to give your agent access to Notion, Google Workspace, Figma, and more."
    >
      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2Icon className="size-4 animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <div className="text-destructive text-sm">Error: {error.message}</div>
      ) : (
        <div className="flex w-full flex-col gap-4">
          {serversData?.servers &&
            Object.entries(serversData.servers).map(([serverName, meta]) => (
              <ConnectedServiceCard
                key={serverName}
                serverName={serverName}
                meta={meta}
                isConnected={connectedMap.get(serverName) ?? false}
              />
            ))}
        </div>
      )}

      {!isLoading && serversData?.servers && Object.keys(serversData.servers).length === 0 && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          No services available to connect.
        </div>
      )}
    </SettingsSection>
  );
}

function ConnectedServiceCard({
  serverName,
  meta,
  isConnected,
}: {
  serverName: string;
  meta: ServerMetadata;
  isConnected: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [credValues, setCredValues] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => saveCredential(serverName, credValues),
    onSuccess: () => {
      setShowForm(false);
      setCredValues({});
      queryClient.invalidateQueries({ queryKey: ["mcpCredentials"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => deleteCredential(serverName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcpCredentials"] });
    },
  });

  const serviceIcons = {
    notion: "📝",
    figma: "🎨",
    "google-workspace": "🔧",
  };

  const icon = serviceIcons[serverName as keyof typeof serviceIcons] || "🔌";

  return (
    <Item className="w-full" variant="outline" key={serverName}>
      <ItemContent>
        <ItemTitle>
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span>{meta.name}</span>
            {isConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2Icon className="size-3" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <XCircleIcon className="size-3" />
                Disconnected
              </span>
            )}
          </div>
        </ItemTitle>
        <ItemDescription className="line-clamp-2">{meta.description}</ItemDescription>
        {meta.services.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {meta.services.map((svc) => (
              <span
                key={svc}
                className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {svc}
              </span>
            ))}
          </div>
        )}
      </ItemContent>
      <ItemActions>
        <div className="flex flex-col items-end gap-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive gap-1.5"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <Link2OffIcon className="size-3.5" />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowForm(!showForm)}
            >
              <PlugIcon className="size-3.5" />
              Connect
            </Button>
          )}
        </div>
      </ItemActions>

      {/* Connection form — shown when "Connect" is clicked */}
      {!isConnected && showForm && (
        <div className="col-span-full mt-3 rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 space-y-3">
            {meta.credential_fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {field.label}
                </label>
                <Input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={credValues[field.key] || ""}
                  onChange={(e) =>
                    setCredValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full"
                />
              </div>
            ))}
          </div>

          {meta.help_url && (
            <a
              href={meta.help_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              <ExternalLinkIcon className="size-3" />
              {meta.help_text}
            </a>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-1.5"
            >
              {saveMutation.isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <KeyIcon className="size-3.5" />
              )}
              Save & Connect
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setCredValues({});
              }}
            >
              Cancel
            </Button>
          </div>

          {saveMutation.isError && (
            <p className="mt-2 text-xs text-red-500">
              Failed to save: {(saveMutation.error as Error).message}
            </p>
          )}
        </div>
      )}
    </Item>
  );
}
