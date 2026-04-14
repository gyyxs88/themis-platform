import { stdin as input, stdout as output } from "node:process";

export async function readHiddenLinePair(firstPrompt: string, secondPrompt: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    return parseNonTtyHiddenLinePair(await readInputText());
  }

  const first = await readHiddenLineFromTty(firstPrompt);
  const second = await readHiddenLineFromTty(secondPrompt);

  if (!first.trim() || !second.trim()) {
    throw new Error("口令不能为空。");
  }

  if (first !== second) {
    throw new Error("两次输入的口令不一致。");
  }

  return first;
}

async function readInputText(): Promise<string> {
  let content = "";

  for await (const chunk of input) {
    content += chunk.toString();
  }

  return content;
}

function parseNonTtyHiddenLinePair(text: string): string {
  const lines = text.split(/\r?\n/);
  const [first = "", second = "", ...rest] = lines;

  if (!first.trim() || !second.trim()) {
    throw new Error("口令不能为空。");
  }

  if (first !== second) {
    throw new Error("两次输入的口令不一致。");
  }

  if (rest.some((line) => line.trim().length > 0)) {
    throw new Error("stdin 只允许恰好两行口令输入，不能包含额外内容。");
  }

  return first;
}

async function readHiddenLineFromTty(prompt: string): Promise<string> {
  if (typeof input.setRawMode !== "function") {
    throw new Error("当前终端不支持隐藏输入。");
  }

  const wasRaw = input.isRaw === true;
  const restoreRawMode = (): void => {
    if (!wasRaw && input.isTTY) {
      input.setRawMode(false);
    }
  };

  input.resume();

  if (!wasRaw) {
    input.setRawMode(true);
  }

  output.write(prompt);

  try {
    return await new Promise<string>((resolve, reject) => {
      let value = "";
      let settled = false;

      const cleanup = (): void => {
        input.off("data", onData);
        input.off("error", onError);
        input.off("end", onEnd);
        input.off("close", onClose);
      };

      const finish = (result: string): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        restoreRawMode();
        output.write("\n");
        resolve(result);
      };

      const fail = (message: string, error?: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        restoreRawMode();
        output.write("\n");
        reject(error ?? new Error(message));
      };

      const onData = (chunk: Buffer | string): void => {
        const text = chunk.toString("utf8");

        for (const char of text) {
          if (char === "\r" || char === "\n") {
            finish(value);
            return;
          }

          if (char === "\u0003") {
            fail("输入已取消：收到中断信号。");
            return;
          }

          if (char === "\u0004") {
            fail("输入已取消：收到 EOF。");
            return;
          }

          if (char === "\u007f" || char === "\b") {
            value = value.slice(0, -1);
            continue;
          }

          value += char;
        }
      };

      const onError = (error: Error): void => {
        fail("输入已取消：读取失败。", error);
      };

      const onEnd = (): void => {
        fail("输入已取消：收到 EOF。");
      };

      const onClose = (): void => {
        fail("输入已取消：输入流已关闭。");
      };

      input.on("data", onData);
      input.once("error", onError);
      input.once("end", onEnd);
      input.once("close", onClose);
    });
  } finally {
    restoreRawMode();
  }
}
