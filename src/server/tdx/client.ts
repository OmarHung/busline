import { z } from "zod";

const AUTH_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";
const API_BASE = "https://tdx.transportdata.tw/api/basic/v2";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
/** token 到期前多久就先換新 */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
/** TDX 會員每秒有呼叫上限，同時發出的請求數壓低一點 */
const MAX_CONCURRENT_REQUESTS = 4;
/** 排隊超過這個數量就直接拒絕，避免被大量請求拖垮 */
const MAX_QUEUED_REQUESTS = 100;

const TokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export class TdxError extends Error {
  override readonly name = "TdxError";

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface TdxClientOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** 單次請求逾時；產生資料的腳本抓整個縣市時要調長 */
  requestTimeoutMs?: number;
}

interface Token {
  value: string;
  expiresAt: number;
}

// 429 不重試：TDX 免費會員每把金鑰每分鐘只有 5 次，重試只會更快用完額度
const isRetryable = (status: number) => status >= 500;

/** 沒有可用的標頭時，假設要等到下一個一分鐘視窗 */
const DEFAULT_RATE_LIMIT_PAUSE_MS = 60_000;

/** 從 429 回應的 Retry-After 或 RateLimit-Reset（秒）算出要暫停多久 */
function rateLimitPauseMs(res: Response): number {
  for (const header of ["retry-after", "ratelimit-reset"]) {
    const seconds = Number(res.headers.get(header));
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, DEFAULT_RATE_LIMIT_PAUSE_MS);
  }
  return DEFAULT_RATE_LIMIT_PAUSE_MS;
}

const rateLimitError = () => new TdxError("TDX 呼叫次數已達上限（每分鐘額度用完）", 429);

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new TdxError("TDX 回應不是有效的 JSON");
  }
}

function buildUrl(path: string, query: Record<string, string>): string {
  const params = Object.entries({ $format: "JSON", ...query })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${API_BASE}/${path}?${params}`;
}

export class TdxClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly requestTimeoutMs: number;
  private token: Token | null = null;
  /** 被 TDX 限流時，到這個時間前所有呼叫直接失敗，不再送出 */
  private rateLimitedUntil = 0;
  private tokenRequest: Promise<Token> | null = null;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly options: TdxClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** 呼叫回傳陣列的 TDX API，逐筆驗證，不合格的資料直接略過 */
  async list<T>(path: string, schema: z.ZodType<T>, query: Record<string, string> = {}): Promise<T[]> {
    const data = await this.withSlot(() => this.request(buildUrl(path, query)));
    if (!Array.isArray(data)) throw new TdxError(`TDX 回應格式不符：${path}`);

    return data.flatMap((item) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private async request(url: string): Promise<unknown> {
    let refreshedToken = false;

    for (let attempt = 0; ; attempt++) {
      if (this.now() < this.rateLimitedUntil) throw rateLimitError();
      const token = await this.getToken();
      const canRetry = attempt < MAX_RETRIES;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          headers: { authorization: `Bearer ${token.value}`, accept: "application/json" },
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch (error) {
        // 連線失敗或逾時
        if (canRetry) {
          await this.backoff(attempt);
          continue;
        }
        throw new TdxError(`無法連線到 TDX：${errorMessage(error)}`);
      }

      if (res.ok) return readJson(res);

      if (res.status === 429) {
        this.rateLimitedUntil = this.now() + rateLimitPauseMs(res);
        throw rateLimitError();
      }

      if (res.status === 401 && !refreshedToken) {
        refreshedToken = true;
        // 只丟掉這個請求用的 token；其他請求可能已經換到新的
        if (this.token === token) this.token = null;
        continue;
      }
      if (isRetryable(res.status) && canRetry) {
        await this.backoff(attempt);
        continue;
      }
      throw new TdxError(`TDX 請求失敗（HTTP ${res.status}）`, res.status);
    }
  }

  private backoff(attempt: number): Promise<void> {
    return this.sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  private async getToken(): Promise<Token> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) return this.token;

    this.tokenRequest ??= this.fetchToken().finally(() => {
      this.tokenRequest = null;
    });
    this.token = await this.tokenRequest;
    return this.token;
  }

  private async fetchToken(): Promise<Token> {
    let res: Response;
    try {
      res = await this.fetchImpl(AUTH_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
        }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      throw new TdxError(`無法連線到 TDX 認證服務：${errorMessage(error)}`);
    }
    if (!res.ok) throw new TdxError(`TDX 認證失敗（HTTP ${res.status}），請檢查金鑰設定`, res.status);

    const parsed = TokenSchema.safeParse(await readJson(res));
    if (!parsed.success) throw new TdxError("TDX 認證回應格式不符");

    return {
      value: parsed.data.access_token,
      expiresAt: this.now() + parsed.data.expires_in * 1000,
    };
  }

  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < MAX_CONCURRENT_REQUESTS) {
      this.active++;
    } else {
      if (this.waiting.length >= MAX_QUEUED_REQUESTS) throw new TdxError("TDX 請求過多，請稍後再試", 503);
      // 等前一個請求直接把名額交過來，active 不變
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
