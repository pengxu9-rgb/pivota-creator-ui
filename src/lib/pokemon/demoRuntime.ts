import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Conversation, Workspace } from "./types";

const { createCollectorClient } = require("./vendor/collectorClient.cjs");
const { CATALOG_CALL_MS } = require("./requestBudgets.cjs");
const { catalogFetch } = require("./catalogReadAdmission.cjs");
const {
  createPrivateCollectorWorkspace,
  createLocalDecisionStore,
} = require("./vendor/privateCollector.cjs");
const { fixtureEnabled, cloudTestScope } = require("./cloudTestScope.cjs");
const { createDurableState, stateConfiguration } = require("./googleState.cjs");
const { betaScope } = require("./betaScope.cjs");
const {
  createConversationService,
  createConversationFileStore,
} = require("./conversations.cjs");
export const { previewOrigin, requestAllowed } = require("./demoGuard.cjs") as {
  previewOrigin: (env?: NodeJS.ProcessEnv) => string | null;
  requestAllowed: (headers: Headers, env?: NodeJS.ProcessEnv) => boolean;
};
export const demoCookieName = () =>
  betaScope() ? "pokemon_pot_beta_session" : cloudTestScope()
    ? "pokemon_creator_ui_test_session"
    : "pokemon_creator_chat_session";
type Context = { demoSession: string };
type Service = {
  start: (
    ctx: Context,
    payload: unknown,
    opts: { signal: AbortSignal },
  ) => Promise<Workspace>;
  advance: (
    ctx: Context,
    payload: unknown,
    opts: { signal: AbortSignal },
  ) => Promise<Workspace>;
  save: (
    ctx: Context,
    payload: unknown,
    opts: { signal: AbortSignal },
  ) => Promise<Workspace>;
  get: (ctx: Context, id: string) => Promise<Workspace>;
  list: (ctx: Context) => Promise<Workspace[]>;
  cancel: (ctx: Context, id: string) => Promise<unknown>;
  delete: (ctx: Context, id: string) => Promise<unknown>;
};
type ChatService = Record<
  string,
  (
    context: Context,
    payload: unknown,
    options?: { signal: AbortSignal; deadline?: number },
  ) => Promise<unknown>
> & {
  withLocalFixture: <T>(
    context: Context,
    payload: { id: string },
    callback: (chat: Conversation, signal: AbortSignal) => Promise<T>,
  ) => Promise<T>;
};
type Runtime = {
  workspace: Service;
  chats: ChatService;
  personal: Record<
    string,
    (
      context: Context,
      payload: unknown,
      options?: { signal: AbortSignal; deadline?: number },
    ) => Promise<unknown>
  >;
  directory: string;
  telemetry: AsyncLocalStorage<{
    requestId: string;
    browserRequestId?: string;
  }>;
};
declare global {
  var pokemonCreatorDemoRuntime: Runtime | undefined;
  var pokemonCreatorGoogleState: any;
}

export function demoRuntime(): Runtime {
  if (!previewOrigin()) throw new Error("demo_not_enabled");
  const { syntheticEnabled, manualResearchEnabled } = require("./syntheticDemo.cjs");
  if (syntheticEnabled() || manualResearchEnabled()) {
    const directory = process.env.POKEMON_CREATOR_DEMO_STORAGE;
    if (!directory || !path.isAbsolute(directory)) throw new Error("invalid_demo_configuration");
    const unsupported = async () => { throw new Error("synthetic_demo_operation_unavailable"); };
    return {
      directory, telemetry: new AsyncLocalStorage(), workspace: {} as Service,
      chats: { list: async () => [], bookmarkList: async () => [] } as unknown as ChatService,
      personal: { collectionList: async () => [], alertList: async () => [],
        collectionAdd: unsupported, alertAdd: unsupported },
    };
  }
  if (globalThis.pokemonCreatorDemoRuntime)
    return globalThis.pokemonCreatorDemoRuntime;
  const configuration = stateConfiguration();
  const telemetry = new AsyncLocalStorage<{
    requestId: string;
    browserRequestId?: string;
  }>();
  const durable = configuration
    ? createDurableState({
        config: configuration,
        onStorageFailure: (failure: object) => {
          void recordDemoEvent({
            kind: "storage_failure",
            ...telemetry.getStore(),
            ...failure,
          });
        },
      })
    : null;
  const directory = durable
    ? "google-object-state"
    : process.env.POKEMON_CREATOR_DEMO_STORAGE;
  const {
    configuration: liveConfiguration,
    identityToken,
  } = require("./liveCatalog.cjs");
  const config = liveConfiguration();
  if (!directory || (!durable && !path.isAbsolute(directory)))
    throw new Error("invalid_demo_configuration");
  if (durable) globalThis.pokemonCreatorGoogleState = durable;
  const client = createCollectorClient({
    baseUrl: config.baseUrl,
    fetchImpl: (input: string, options: RequestInit) =>
      catalogFetch(config.baseUrl, input, options),
    getIdToken: (_audience: string, options: { signal: AbortSignal }) =>
      identityToken()(config.audience, options),
    timeoutMs: CATALOG_CALL_MS,
    // A lost response must not replay a logical turn behind the user's message.
    maxAttempts: 1,
    onAttempt: (attempt: object) => {
      const binding = telemetry.getStore();
      void recordDemoEvent({ kind: "catalog_attempt", ...binding, ...attempt });
    },
  });
  const admitPresentation = (value: unknown) => {
    const { liveCatalog } = require("./liveCatalog.cjs");
    const { currentOperation } = require("./sourceFamilyAdvisory.cjs");
    const operation = currentOperation();
    return liveCatalog().validateFamilyPresentation(value, operation?.signal, operation?.deadline);
  };
  const workspace = createPrivateCollectorWorkspace({
    ...(configuration?.scope==="beta"?{retentionMs:configuration.retentionMs}:{}),
    admitPresentation,
    client,
    authenticate: async (ctx: Context) => {
      if (!(await validDemoSession(directory, ctx?.demoSession))) return null;
      return { id: "owner-local-demo:" + ctx.demoSession };
    },
    store:
      durable?.workspaceStore ||
      createLocalDecisionStore({
        directory: path.join(directory, "workspaces"),
      }),
  }) as Service;
  const rawChats = createConversationService({
    ...(configuration?.scope==="beta"?{retentionMs:configuration.retentionMs}:{}),
    workspace,
    admitPresentation,
    localFixtureGuard: false,
    authenticate: async (ctx: Context) =>
      (await validDemoSession(directory, ctx?.demoSession))
        ? { id: "owner-local-demo:" + ctx.demoSession }
        : null,
    store:
      durable?.conversationStore ||
      createConversationFileStore({
        directory: path.join(directory, "conversation-data"),
      }),
  }) as ChatService;
  const chats = durable ? (durable.wrap(rawChats) as ChatService) : rawChats;
  const {
    createPersonalService,
    createPersonalFileStore,
  } = require("./personalRecords.cjs");
  const { liveCatalog } = require("./liveCatalog.cjs");
  const rawPersonal = createPersonalService({
    ...(configuration?.scope==="beta"?{retentionMs:configuration.retentionMs}:{}),
    authenticate: async (ctx: Context) =>
      (await validDemoSession(directory, ctx?.demoSession))
        ? { id: "owner-local-demo:" + ctx.demoSession }
        : null,
    store:
      durable?.conversationStore ||
      createPersonalFileStore({
        directory: path.join(directory, "personal-records"),
      }),
    getCard: (id: string, signal: AbortSignal) =>
      liveCatalog().card(id, signal),
  });
  const personal = durable
    ? Object.fromEntries(
        Object.entries(rawPersonal).map(([name, method]) => [
          name,
          async (
            ctx: Context,
            payload: unknown,
            options: { signal?: AbortSignal; deadline?: number } = {},
          ) => {
            if (
              !(await durable.validSession(ctx.demoSession, options.deadline))
            )
              throw new Error("collector_caller_denied");
            return durable.run(
              durable.ownerFor(ctx.demoSession),
              null,
              (signal: AbortSignal) =>
                (method as Function)(ctx, payload, { ...options, signal }),
              options.signal,
              options.deadline,
            );
          },
        ]),
      )
    : rawPersonal;
  return (globalThis.pokemonCreatorDemoRuntime = {
    workspace,
    chats,
    personal,
    directory,
    telemetry,
  });
}

export async function validDemoSession(
  directory: string,
  id: string,
  deadline?: number,
): Promise<boolean> {
  if (directory === "google-object-state")
    return globalThis.pokemonCreatorGoogleState.validSession(id, deadline);
  if (
    typeof id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      id,
    )
  )
    return false;
  try {
    const record = JSON.parse(
      await readFile(
        path.join(directory, "browser-sessions", id + ".json"),
        "utf8",
      ),
    );
    return record.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function createDemoSession(
  directory: string,
  deadline?: number,
  accountSession?: string,
): Promise<string> {
  if (directory === "google-object-state")
    return globalThis.pokemonCreatorGoogleState.createSession(deadline, accountSession);
  if(accountSession!==undefined)throw new Error("collector_caller_denied");
  const root = path.join(directory, "browser-sessions");
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (((await stat(root)).mode & 0o077) !== 0)
    throw new Error("unsafe_demo_storage");
  const id = randomUUID();
  await writeFile(
    path.join(root, id + ".json"),
    JSON.stringify({ expiresAt: Date.now() + 86400000 }),
    { flag: "wx", mode: 0o600 },
  );
  return id;
}

export async function recordDemoEvent(event: object): Promise<void> {
  if (process.env.POKEMON_CREATOR_STATE_DRIVER === "gcs") {
    const allowed = new Set([
      "kind",
      "utc",
      "requestId",
      "browserRequestId",
      "operation",
      "status",
      "code",
      "duration_ms",
      "attempt",
      "elapsed_ms",
      "body_ms",
      "fetch_ms",
      "cancel_ms",
      "outcome",
      "schema",
      "phase",
      "auth_ms",
      "headers_ms",
      "http_status",
      "request_id",
      "error_class",
      "retryable",
      "retry_delay_ms",
      "abort_requested",
      "cleanup_state",
    ]);
    const sanitized = Object.fromEntries(
      Object.entries(event).filter(
        ([key, value]) =>
          allowed.has(key) &&
          (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"),
      ),
    );
    const timings = (event as Record<string, unknown>).server_timing_ms;
    if (timings && typeof timings === "object")
      sanitized.server_timing_ms = Object.fromEntries(
        Object.entries(timings).filter(
          ([key, value]) =>
            ["receive", "queue", "compute"].includes(key) &&
            typeof value === "number" &&
            Number.isFinite(value),
        ),
      );
    process.stdout.write(
      JSON.stringify({ utc: new Date().toISOString(), ...sanitized }) + "\n",
    );
    return;
  }
  const destination = process.env.POKEMON_CREATOR_DEMO_JOURNAL;
  if (!destination || !path.isAbsolute(destination)) return;
  // Events contain fixed codes, timings and correlation IDs, never headers or credentials.
  try {
    await appendFile(
      destination,
      JSON.stringify({ utc: new Date().toISOString(), ...event }) + "\n",
      { mode: 0o600 },
    );
  } catch {
    /* Telemetry never changes a logical result. */
  }
}
