export const CONNECTED_BUILDER_RELAY_ORIGIN = "https://cv-builder-relay.flodirka.workers.dev";
export const connectedBuilderStorageKey = "cv-builder.connected-builder.v1";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;
type LocationLike = Pick<Location, "hash" | "pathname" | "search">;
type HistoryLike = Pick<History, "replaceState">;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RelayConnection = {
  capability: string;
  claimNonce: string;
  phase: "claim" | "ack";
};

export type RelayClaimResult =
  | { kind: "ready"; markdown: string }
  | { kind: "expired" }
  | { kind: "network" }
  | { kind: "error" };

export type RelayAcknowledgementResult = "complete" | "network" | "error";

export const isRelayCapability = (value: string | null): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);

export const isRelayClaimNonce = (value: string | null): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{22}$/u.test(value);

export const takeRelayCapabilityFromFragment = (
  location: LocationLike,
  history: HistoryLike
): string | undefined => {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const parameters = new URLSearchParams(fragment);
  if (!parameters.has("connect")) return undefined;

  history.replaceState(null, "", `${location.pathname}${location.search}`);
  const capability = parameters.get("connect");
  return isRelayCapability(capability) ? capability : undefined;
};

export const createRelayClaimNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

export const readRelayConnection = (storage: StorageLike): RelayConnection | undefined => {
  try {
    const serialized = storage.getItem(connectedBuilderStorageKey);
    if (!serialized) return undefined;
    const value = JSON.parse(serialized) as Partial<RelayConnection>;
    const capability = value.capability ?? null;
    const claimNonce = value.claimNonce ?? null;
    if (
      !isRelayCapability(capability) ||
      !isRelayClaimNonce(claimNonce) ||
      (value.phase !== "claim" && value.phase !== "ack")
    ) {
      storage.removeItem(connectedBuilderStorageKey);
      return undefined;
    }
    return { capability, claimNonce, phase: value.phase };
  } catch {
    return undefined;
  }
};

export const writeRelayConnection = (storage: StorageLike, connection: RelayConnection) => {
  storage.setItem(connectedBuilderStorageKey, JSON.stringify(connection));
};

export const clearRelayConnection = (storage: StorageLike) => {
  storage.removeItem(connectedBuilderStorageKey);
};

const relayRequest = (connection: RelayConnection, body: string) => ({
  method: "POST",
  credentials: "omit" as const,
  referrerPolicy: "no-referrer" as const,
  headers: {
    Authorization: `Bearer ${connection.capability}`,
    "Content-Type": "application/json",
    "X-CV-Builder-Claim": connection.claimNonce
  },
  body
});

export const claimRelayMarkdown = async (
  connection: RelayConnection,
  fetcher: FetchLike = fetch
): Promise<RelayClaimResult> => {
  try {
    const response = await fetcher(
      `${CONNECTED_BUILDER_RELAY_ORIGIN}/relay/v1/claim`,
      relayRequest(connection, "{}")
    );
    if (response.status === 410) return { kind: "expired" };
    if (!response.ok) return { kind: "error" };
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/markdown")) {
      return { kind: "error" };
    }
    return { kind: "ready", markdown: await response.text() };
  } catch {
    return { kind: "network" };
  }
};

export const acknowledgeRelayImport = async (
  connection: RelayConnection,
  fetcher: FetchLike = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds))
): Promise<RelayAcknowledgementResult> => {
  for (const delay of [0, 250, 1_000]) {
    if (delay) await wait(delay);
    try {
      const response = await fetcher(
        `${CONNECTED_BUILDER_RELAY_ORIGIN}/relay/v1/ack`,
        relayRequest(connection, '{"status":"imported"}')
      );
      if (response.status === 204 || response.status === 410) return "complete";
      return "error";
    } catch {
      // A same-nonce acknowledgement is safe to retry after a lost response.
    }
  }
  return "network";
};
