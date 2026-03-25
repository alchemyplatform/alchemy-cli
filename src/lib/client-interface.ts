export interface AlchemyClient {
  readonly network: string;
  call(method: string, params?: unknown[] | Record<string, unknown>): Promise<unknown>;
  callEnhanced(path: string, params: Record<string, string>): Promise<unknown>;
}
