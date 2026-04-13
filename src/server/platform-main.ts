import { createPlatformApp } from "./platform-app.js";

export function bootstrapMessage(port: number): string {
  return `Themis Platform bootstrap server listening on http://127.0.0.1:${port}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = normalizePort(process.env.PORT, 3200);
  const server = createPlatformApp();
  server.listen(port, "127.0.0.1", () => {
    console.log(bootstrapMessage(port));
  });
}

function normalizePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
