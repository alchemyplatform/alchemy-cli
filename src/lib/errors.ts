export const ErrorCode = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_API_KEY: "INVALID_API_KEY",
  INVALID_ACCESS_KEY: "INVALID_ACCESS_KEY",
  ACCESS_KEY_REQUIRED: "ACCESS_KEY_REQUIRED",
  APP_REQUIRED: "APP_REQUIRED",
  ADMIN_API_ERROR: "ADMIN_API_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  RPC_ERROR: "RPC_ERROR",
  INVALID_ARGS: "INVALID_ARGS",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export const EXIT_CODES: Record<ErrorCodeType, number> = {
  AUTH_REQUIRED: 3,
  INVALID_API_KEY: 3,
  INVALID_ACCESS_KEY: 3,
  ACCESS_KEY_REQUIRED: 3,
  APP_REQUIRED: 3,
  INVALID_ARGS: 2,
  NOT_FOUND: 4,
  RATE_LIMITED: 5,
  NETWORK_ERROR: 6,
  RPC_ERROR: 7,
  ADMIN_API_ERROR: 8,
  INTERNAL_ERROR: 1,
};

export class CLIError extends Error {
  code: ErrorCodeType;
  hint?: string;

  constructor(code: ErrorCodeType, message: string, hint?: string) {
    super(message);
    this.name = "CLIError";
    this.code = code;
    this.hint = hint;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.hint && { hint: this.hint }),
      },
    };
  }

  format(): string {
    let out = `${this.code}: ${this.message}`;
    if (this.hint) out += `\nHint: ${this.hint}`;
    return out;
  }
}

export function errAuthRequired(): CLIError {
  return new CLIError(
    ErrorCode.AUTH_REQUIRED,
    "Not authenticated. Set ALCHEMY_API_KEY or run 'alchemy config set api-key <key>'.",
    "alchemy config set api-key <your-key>",
  );
}

export function errAccessKeyRequired(): CLIError {
  return new CLIError(
    ErrorCode.ACCESS_KEY_REQUIRED,
    "Access key required. Set ALCHEMY_ACCESS_KEY or run 'alchemy config set access-key <key>'.",
    "Get an access key: https://www.alchemy.com/docs/reference/admin-api/overview",
  );
}

export function errInvalidAPIKey(): CLIError {
  return new CLIError(
    ErrorCode.INVALID_API_KEY,
    "Invalid API key. Check your key and try again.",
    "alchemy config set api-key <your-key>",
  );
}

export function errNetwork(detail: string): CLIError {
  return new CLIError(
    ErrorCode.NETWORK_ERROR,
    `Network error: ${detail}`,
    "Check your internet connection and try again.",
  );
}

export function errRPC(code: number, message: string): CLIError {
  return new CLIError(ErrorCode.RPC_ERROR, `RPC error ${code}: ${message}`);
}

export function errInvalidArgs(detail: string): CLIError {
  return new CLIError(ErrorCode.INVALID_ARGS, detail);
}

export function errNotFound(resource: string): CLIError {
  return new CLIError(ErrorCode.NOT_FOUND, `Not found: ${resource}`);
}

export function errRateLimited(): CLIError {
  return new CLIError(
    ErrorCode.RATE_LIMITED,
    "Rate limited. Please wait and try again.",
    "Consider upgrading your Alchemy plan for higher rate limits.",
  );
}

export function errInvalidAccessKey(): CLIError {
  return new CLIError(
    ErrorCode.INVALID_ACCESS_KEY,
    "Invalid access key. Check your key and try again.",
    "Get an access key: https://www.alchemy.com/docs/reference/admin-api/overview",
  );
}

export function errAppRequired(): CLIError {
  return new CLIError(
    ErrorCode.APP_REQUIRED,
    "No app selected. Set an app to resolve the API key automatically.",
    "alchemy config set app <app-id>",
  );
}

export function errAdminAPI(status: number, message: string): CLIError {
  return new CLIError(
    ErrorCode.ADMIN_API_ERROR,
    `Admin API error (HTTP ${status}): ${message}`,
  );
}
