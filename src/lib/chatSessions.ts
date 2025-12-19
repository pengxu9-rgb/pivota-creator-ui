import type { ChatMessage } from "@/types/chat";

export type SessionStatus =
  | "NO_SESSION"
  | "CREATED"
  | "ACTIVE"
  | "SUSPENDED"
  | "ARCHIVED"
  | "LOCKED_CONFLICT";

export type TaskState =
  | "IDLE"
  | "INTENT_IDENTIFIED"
  | "CLARIFYING"
  | "EXECUTING"
  | "DECISION_SUPPORT"
  | "TRANSACTION"
  | "TASK_COMPLETED";

export type EntrySource =
  | "HOME"
  | "PROFILE"
  | "HISTORY"
  | "DEEPLINK"
  | "CHECKOUT"
  | "SUPPORT";

export type TaskType =
  | "DISCOVERY"
  | "ORDER_TRACKING"
  | "AFTER_SALES"
  | "GENERAL_QA";

export interface SessionMeta {
  id: string;
  userId: string | null;
  deviceId: string;
  creatorId: string;
  status: SessionStatus;
  taskState: TaskState;
  taskType: TaskType;
  createdAt: string;
  lastActiveAt: string;
  completedAt?: string;
  archivedAt?: string;
  hasOrder: boolean;
  lastOrderId?: string;
  lastOrderStatus?: string;
  lastOrderCompletedAt?: string;
  lastSummary?: string;
  lastUserQuery?: string;
  messageCount: number;
  entrySource: EntrySource;
}

export interface EntryContext {
  entrySource: EntrySource;
  userId: string | null;
  deviceId: string;
  creatorId: string;
  requestedSessionId?: string;
  currentSessionId?: string;
}

export interface Config {
  AUTO_RESUME_WINDOW_MINUTES: number;
  OFFER_CHOICE_AFTER_HOURS: number;
  ARCHIVE_AFTER_DAYS: number;
}

export type EntryAction =
  | "CREATE_NEW"
  | "AUTO_RESUME"
  | "OPEN_SPECIFIC"
  | "OFFER_CHOICE";

export interface DecisionUIHints {
  showResumeCard?: boolean;
  defaultChoice?: "NEW" | "CONTINUE";
  banner?: string;
}

export interface DecisionResult {
  action: EntryAction;
  sessionId?: string;
  ui: DecisionUIHints;
}

export const DEFAULT_CONFIG: Config = {
  AUTO_RESUME_WINDOW_MINUTES: 30,
  OFFER_CHOICE_AFTER_HOURS: 24,
  ARCHIVE_AFTER_DAYS: 30,
};

function isSessionCompleted(s: SessionMeta): boolean {
  return (
    s.status === "ARCHIVED" ||
    s.taskState === "TASK_COMPLETED" ||
    Boolean(s.completedAt)
  );
}

function minutesDiff(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 60000;
}

function hoursDiff(a: Date, b: Date): number {
  return minutesDiff(a, b) / 60;
}

export function decideEntryBehavior(
  ctx: EntryContext,
  sessions: SessionMeta[],
  now: Date,
  config: Config = DEFAULT_CONFIG,
): DecisionResult {
  const uiBase: DecisionUIHints = {};

  // HISTORY / DEEPLINK 强制打开指定会话
  if (
    (ctx.entrySource === "HISTORY" || ctx.entrySource === "DEEPLINK") &&
    ctx.requestedSessionId
  ) {
    const target = sessions.find((s) => s.id === ctx.requestedSessionId);
    if (target) {
      return {
        action: "OPEN_SPECIFIC",
        sessionId: target.id,
        ui: uiBase,
      };
    }
  }

  const nonArchived = sessions.filter((s) => s.status !== "ARCHIVED");
  if (nonArchived.length === 0) {
    return { action: "CREATE_NEW", ui: uiBase };
  }

  const lastSession = [...nonArchived].sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )[0];

  const lastActiveTime = new Date(lastSession.lastActiveAt);
  const minutesSinceLast = minutesDiff(now, lastActiveTime);
  const hoursSinceLast = hoursDiff(now, lastActiveTime);
  const completed = isSessionCompleted(lastSession);

  if (completed && lastSession.hasOrder) {
    return {
      action: "OFFER_CHOICE",
      sessionId: lastSession.id,
      ui: {
        showResumeCard: true,
        defaultChoice: "NEW",
        banner:
          "Your last shopping task is complete. You can start a new request or continue reviewing the previous chat.",
      },
    };
  }

  if (!completed && minutesSinceLast <= config.AUTO_RESUME_WINDOW_MINUTES) {
    return {
      action: "AUTO_RESUME",
      sessionId: lastSession.id,
      ui: {
        banner:
          "We’ve continued from your last chat. You can start a new conversation at any time.",
      },
    };
  }

  if (!completed && hoursSinceLast >= config.OFFER_CHOICE_AFTER_HOURS) {
    return {
      action: "OFFER_CHOICE",
      sessionId: lastSession.id,
      ui: {
        showResumeCard: true,
        defaultChoice: "NEW",
        banner:
          "It’s been a while since your last task. You can continue that chat or start a new one.",
      },
    };
  }

  if (!completed) {
    return {
      action: "OFFER_CHOICE",
      sessionId: lastSession.id,
      ui: {
        showResumeCard: true,
        defaultChoice: "CONTINUE",
        banner:
          "You still have an unfinished task from last time. Do you want to continue?",
      },
    };
  }

  return {
    action: "OFFER_CHOICE",
    sessionId: lastSession.id,
    ui: {
      showResumeCard: true,
      defaultChoice: "CONTINUE",
      banner:
        "Your previous recommendations are ready. You can ask follow-up questions or start a new conversation.",
    },
  };
}

// 简单的本地持久化工具，用于 MVP。
export function loadSessionIndex(
  key: string,
): { sessions: SessionMeta[]; currentSessionId: string | null } {
  if (typeof window === "undefined") {
    return { sessions: [], currentSessionId: null };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { sessions: [], currentSessionId: null };
    const parsed = JSON.parse(raw) as {
      sessions?: SessionMeta[];
      currentSessionId?: string;
    };
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      currentSessionId: parsed.currentSessionId ?? null,
    };
  } catch {
    return { sessions: [], currentSessionId: null };
  }
}

export function saveSessionIndex(
  key: string,
  payload: { sessions: SessionMeta[]; currentSessionId: string | null },
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function createInitialSession(
  ctx: EntryContext,
  now: Date,
): SessionMeta {
  return {
    id: `sess_${now.getTime()}`,
    userId: ctx.userId,
    deviceId: ctx.deviceId,
    creatorId: ctx.creatorId,
    status: "ACTIVE",
    taskState: "IDLE",
    taskType: "DISCOVERY",
    createdAt: now.toISOString(),
    lastActiveAt: now.toISOString(),
    hasOrder: false,
    messageCount: 0,
    entrySource: ctx.entrySource,
  };
}

export function updateSessionOnMessages(
  session: SessionMeta,
  messages: ChatMessage[],
  now: Date,
): SessionMeta {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  return {
    ...session,
    lastActiveAt: now.toISOString(),
    lastUserQuery: lastUser?.content ?? session.lastUserQuery,
    messageCount: messages.length,
  };
}
