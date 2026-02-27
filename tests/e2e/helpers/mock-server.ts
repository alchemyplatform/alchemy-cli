import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingMessage["headers"];
  bodyText: string;
  bodyJSON: unknown;
}

export interface MockResponse {
  status: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export interface MockServer {
  baseURL: string;
  requests: MockRequest[];
  close: () => Promise<void>;
}

export type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

function parseJSONSafe(raw: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function startMockServer(handler: MockHandler): Promise<MockServer> {
  const requests: MockRequest[] = [];
  let server: Server;

  const onRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const bodyText = Buffer.concat(chunks).toString("utf8");
    const requestURL = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const request: MockRequest = {
      method: req.method ?? "GET",
      path: requestURL.pathname,
      query: requestURL.searchParams,
      headers: req.headers,
      bodyText,
      bodyJSON: parseJSONSafe(bodyText),
    };
    requests.push(request);

    const response = await handler(request);
    res.writeHead(response.status, {
      ...(response.json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...response.headers,
    });

    if (response.json !== undefined) {
      res.end(JSON.stringify(response.json));
      return;
    }

    res.end(response.text ?? "");
  };

  const baseURL = await new Promise<string>((resolve) => {
    server = createServer((req, res) => {
      void onRequest(req, res);
    });
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === "object" && address) {
        resolve(`http://127.0.0.1:${address.port}`);
      }
    });
  });

  return {
    baseURL,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
