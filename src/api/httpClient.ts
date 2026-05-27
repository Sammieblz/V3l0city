export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly recoverable: boolean
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  timeoutMs?: number;
};

export class HttpClient {
  constructor(private readonly baseUrl: string) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 8000
    );

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body == null ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token == null
            ? {}
            : { Authorization: `Bearer ${options.token}` }),
        },
        body: options.body == null ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const text = await response.text();
      const payload = text.length > 0 ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new ApiError(
          payload?.message ?? `Request failed with ${response.status}`,
          response.status,
          response.status >= 500 || response.status === 408 || response.status === 429
        );
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Network request failed',
        0,
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestWithRetry<T>(
    path: string,
    options: RequestOptions = {},
    attempts = 2
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.request<T>(path, options);
      } catch (error) {
        lastError = error;
        if (error instanceof ApiError && !error.recoverable) {
          throw error;
        }
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }
}
