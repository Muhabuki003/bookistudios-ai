import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

export interface CredentialEntry {
  server_name: string;
  status: "connected" | "disconnected";
  services: string[];
  updated_at: string | null;
}

export interface CredentialListResponse {
  credentials: CredentialEntry[];
}

export interface ServerMetadata {
  name: string;
  description: string;
  services: string[];
  credential_fields: {
    key: string;
    label: string;
    type: "text" | "password";
    placeholder: string;
  }[];
  help_url: string;
  help_text: string;
}

export interface AvailableServersResponse {
  servers: Record<string, ServerMetadata>;
}

export interface SaveCredentialRequest {
  credentials: Record<string, string>;
}

export interface SaveCredentialResponse {
  server_name: string;
  status: string;
  message: string;
}

export interface DeleteCredentialResponse {
  server_name: string;
  status: string;
  message: string;
}

/** Get the current user's connected MCP services */
export async function listUserCredentials() {
  const response = await fetch(`${getBackendBaseURL()}/api/mcp/credentials`, {
    credentials: "include",
  });
  return response.json() as Promise<CredentialListResponse>;
}

/** Get metadata about all available MCP servers */
export async function listAvailableServers() {
  const response = await fetch(`${getBackendBaseURL()}/api/mcp/credentials/servers`, {
    credentials: "include",
  });
  return response.json() as Promise<AvailableServersResponse>;
}

/** Save credentials for a server */
export async function saveCredential(serverName: string, credentials: Record<string, string>) {
  const csrfToken = getCookie("csrf_token");

  const response = await fetch(
    `${getBackendBaseURL()}/api/mcp/credentials/${encodeURIComponent(serverName)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ credentials } as SaveCredentialRequest),
    },
  );
  return response.json() as Promise<SaveCredentialResponse>;
}

/** Disconnect a server (remove credentials) */
export async function deleteCredential(serverName: string) {
  const csrfToken = getCookie("csrf_token");

  const response = await fetch(
    `${getBackendBaseURL()}/api/mcp/credentials/${encodeURIComponent(serverName)}`,
    {
      method: "DELETE",
      headers: {
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      credentials: "include",
    },
  );
  return response.json() as Promise<DeleteCredentialResponse>;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}
