import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core";
import { SpinnerRenderable } from "opentui-spinner";
import { getContent } from "./branding.js";
import { normalizeConnUrl } from "../utils.js";

export type FlowResult = "ok" | "fail" | "back";
export const BACK = "__back__" as const;

/** Clear only the content region — sticky branding stays. */
export function clearContent(renderer: CliRenderer): BoxRenderable {
  const content = getContent(renderer);
  for (const child of content.getChildren()) {
    content.remove(child.id);
  }
  return content;
}

/** @deprecated use clearContent — kept as alias for call sites */
export const clearRoot = clearContent;

export function looksLikePgUrl(value: string): boolean {
  return /^(postgres(ql)?:\/\/)/i.test(value.trim());
}

/** Checkbox multi-select with ← Back. Returns BACK or selected item ids. */
export function promptMultiSelect(
  renderer: CliRenderer,
  options: {
    title: string;
    items: string[];
    emptyMessage?: string;
  },
): Promise<string[] | typeof BACK> {
  return new Promise((resolve) => {
    const { items } = options;
    if (items.length === 0) {
      resolve([]);
      return;
    }

    const content = clearContent(renderer);
    const choices = [BACK, ...items];
    const checked = new Set<string>();
    let cursor = 1;

    const panel = new BoxRenderable(renderer, {
      id: "pick-panel",
      border: true,
      borderColor: "#555555",
      title: ` ${options.title} `,
      flexDirection: "column",
      padding: 1,
      width: "100%",
      flexGrow: 1,
    });

    panel.add(
      new TextRenderable(renderer, {
        id: "pick-hint",
        content: "Space toggle · a all · Enter confirm · Esc back",
        fg: "#888888",
        marginBottom: 1,
      }),
    );

    const list = new BoxRenderable(renderer, {
      id: "pick-list",
      flexDirection: "column",
      flexGrow: 1,
      width: "100%",
    });

    const lines: TextRenderable[] = choices.map((_, i) => {
      const line = new TextRenderable(renderer, {
        id: `pick-line-${i}`,
        content: "",
        fg: "#CCCCCC",
      });
      list.add(line);
      return line;
    });

    panel.add(list);
    content.add(panel);

    const redraw = () => {
      for (let i = 0; i < choices.length; i++) {
        const id = choices[i]!;
        const isBack = id === BACK;
        const marker = isBack ? "   " : checked.has(id) ? "[x]" : "[ ]";
        const pointer = i === cursor ? "▶" : " ";
        const label = isBack ? "← Back" : id;
        lines[i]!.content = `${pointer} ${marker} ${label}`;
        lines[i]!.fg = i === cursor ? "#FFFF66" : isBack ? "#88AADD" : "#CCCCCC";
      }
    };

    redraw();

    const onKey = (key: KeyEvent) => {
      if (key.name === "up" || key.name === "k") {
        cursor = Math.max(0, cursor - 1);
        redraw();
        return;
      }
      if (key.name === "down" || key.name === "j") {
        cursor = Math.min(choices.length - 1, cursor + 1);
        redraw();
        return;
      }
      if (key.name === "space") {
        const id = choices[cursor]!;
        if (id === BACK) {
          cleanup();
          resolve(BACK);
          return;
        }
        if (checked.has(id)) checked.delete(id);
        else checked.add(id);
        redraw();
        return;
      }
      if (key.name === "a") {
        if (checked.size === items.length) checked.clear();
        else items.forEach((item) => checked.add(item));
        redraw();
        return;
      }
      if (key.name === "escape") {
        cleanup();
        resolve(BACK);
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const id = choices[cursor]!;
        if (id === BACK) {
          cleanup();
          resolve(BACK);
          return;
        }
        if (checked.size === 0) return;
        cleanup();
        resolve([...checked]);
      }
    };

    const cleanup = () => {
      renderer.keyInput.off("keypress", onKey);
    };

    renderer.keyInput.on("keypress", onKey);
  });
}

export function promptSelect<T extends string>(
  renderer: CliRenderer,
  options: {
    title: string;
    message: string;
    hint?: string;
    choices: Array<{ name: string; description: string; value: T }>;
    allowBack?: boolean;
  },
): Promise<T | typeof BACK> {
  return new Promise((resolve, reject) => {
    const content = clearContent(renderer);

    const panel = new BoxRenderable(renderer, {
      id: "select-panel",
      border: true,
      borderColor: "#555555",
      title: ` ${options.title} `,
      flexDirection: "column",
      padding: 1,
      width: "100%",
      flexGrow: 1,
    });

    panel.add(
      new TextRenderable(renderer, {
        id: "select-message",
        content: options.message,
        fg: "#FFFFFF",
        marginBottom: 1,
      }),
    );

    const menu = new SelectRenderable(renderer, {
      id: "select-menu",
      width: "100%",
      height: Math.max(4, options.choices.length * 2 + 1),
      showDescription: true,
      showScrollIndicator: false,
      options: options.choices.map(
        (c): SelectOption => ({
          name: c.name,
          description: c.description,
          value: c.value,
        }),
      ),
    });

    panel.add(menu);
    panel.add(
      new TextRenderable(renderer, {
        id: "select-hint",
        content:
          options.hint ??
          (options.allowBack
            ? "↑/↓ move · Enter confirm · Esc back"
            : "↑/↓ move · Enter confirm · Ctrl+C quit"),
        fg: "#888888",
        marginTop: 1,
      }),
    );

    content.add(panel);
    menu.focus();

    const onSelect = (_index: number, option: SelectOption) => {
      cleanup();
      resolve(option.value as T);
    };

    const onKey = (key: KeyEvent) => {
      if (key.name === "escape") {
        cleanup();
        if (options.allowBack) resolve(BACK);
        else reject(new Error("cancelled"));
      }
    };

    const cleanup = () => {
      menu.off(SelectRenderableEvents.ITEM_SELECTED, onSelect);
      renderer.keyInput.off("keypress", onKey);
    };

    menu.on(SelectRenderableEvents.ITEM_SELECTED, onSelect);
    renderer.keyInput.on("keypress", onKey);
  });
}

export function promptText(
  renderer: CliRenderer,
  options: {
    title: string;
    label: string;
    placeholder?: string;
    initial?: string;
    hint?: string;
    maxLength?: number;
    validate?: (value: string) => string | null;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const content = clearContent(renderer);

    const panel = new BoxRenderable(renderer, {
      id: "text-panel",
      border: true,
      borderColor: "#555555",
      title: ` ${options.title} `,
      flexDirection: "column",
      padding: 1,
      width: "100%",
      flexGrow: 1,
      gap: 1,
    });

    panel.add(
      new TextRenderable(renderer, {
        id: "text-label",
        content: options.label,
        fg: "#FFFFFF",
      }),
    );

    const error = new TextRenderable(renderer, {
      id: "text-error",
      content: "",
      fg: "#FF6666",
      height: 1,
    });

    const input = new InputRenderable(renderer, {
      id: "text-input",
      width: "100%",
      height: 1,
      placeholder: options.placeholder ?? "",
      value: options.initial?.trim() ?? "",
      maxLength: options.maxLength ?? 2000,
      backgroundColor: "#1A1A1A",
      focusedBackgroundColor: "#2A2A2A",
      textColor: "#FFFFFF",
      cursorColor: "#88CCFF",
    });

    panel.add(input);
    panel.add(error);
    panel.add(
      new TextRenderable(renderer, {
        id: "text-hint",
        content: options.hint ?? "Enter confirm · Esc back",
        fg: "#888888",
      }),
    );

    content.add(panel);
    input.focus();

    const submit = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        error.content = "Value is required";
        return;
      }
      if (options.validate) {
        const msg = options.validate(trimmed);
        if (msg) {
          error.content = msg;
          return;
        }
      }
      cleanup();
      resolve(trimmed);
    };

    const onEnter = (value: string) => submit(value);
    const onKey = (key: KeyEvent) => {
      if (key.name === "escape") {
        cleanup();
        reject(new Error("cancelled"));
      }
    };

    const cleanup = () => {
      input.off(InputRenderableEvents.ENTER, onEnter);
      renderer.keyInput.off("keypress", onKey);
    };

    input.on(InputRenderableEvents.ENTER, onEnter);
    renderer.keyInput.on("keypress", onKey);
  });
}

export function promptDbUrl(
  renderer: CliRenderer,
  title: string,
  initial?: string,
): Promise<string> {
  return promptText(renderer, {
    title,
    label: "PostgreSQL connection URL",
    placeholder: "postgresql://user:password@host:5432",
    initial,
    hint: "Enter confirm · Esc back · database name optional (you can pick next)",
    validate: (value) =>
      looksLikePgUrl(value)
        ? null
        : "URL must start with postgresql:// or postgres://",
  }).then(normalizeConnUrl);
}

export async function waitForEnter(
  renderer: CliRenderer,
  message = "Press Enter to continue",
): Promise<void> {
  const content = getContent(renderer);
  const hint = new TextRenderable(renderer, {
    id: `wait-enter-${Date.now()}`,
    content: message,
    fg: "#888888",
    marginTop: 1,
  });

  const children = content.getChildren();
  const last = children[children.length - 1];
  if (last) {
    try {
      (last as BoxRenderable).add(hint);
    } catch {
      content.add(hint);
    }
  } else {
    content.add(hint);
  }

  await new Promise<void>((resolve) => {
    const onKey = (key: KeyEvent) => {
      if (key.name === "return" || key.name === "enter" || key.name === "q") {
        renderer.keyInput.off("keypress", onKey);
        resolve();
      }
    };
    renderer.keyInput.on("keypress", onKey);
  });
}

export async function showStatus(
  renderer: CliRenderer,
  options: {
    title: string;
    message: string;
    ok: boolean;
    detail?: string;
  },
): Promise<void> {
  const content = clearContent(renderer);
  const panel = new BoxRenderable(renderer, {
    id: "status-panel",
    border: true,
    borderColor: "#555555",
    title: ` ${options.title} `,
    flexDirection: "column",
    padding: 1,
    width: "100%",
    flexGrow: 1,
  });
  panel.add(
    new TextRenderable(renderer, {
      content: options.message,
      fg: options.ok ? "#66DD88" : "#FF6666",
      marginBottom: options.detail ? 1 : 0,
    }),
  );
  if (options.detail) {
    const lines = options.detail.split("\n").filter(Boolean).slice(-8);
    for (const [i, line] of lines.entries()) {
      panel.add(
        new TextRenderable(renderer, {
          id: `status-detail-${i}`,
          content: line.length > 100 ? `${line.slice(0, 97)}…` : line,
          fg: "#A1A1AA",
        }),
      );
    }
  }
  content.add(panel);
  await waitForEnter(renderer);
}

export async function withSpinner<T>(
  renderer: CliRenderer,
  title: string,
  label: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const content = clearContent(renderer);
  const panel = new BoxRenderable(renderer, {
    id: "spinner-panel",
    border: true,
    borderColor: "#555555",
    title: ` ${title} `,
    flexDirection: "row",
    alignItems: "center",
    padding: 1,
    width: "100%",
    flexGrow: 1,
  });
  const spin = new SpinnerRenderable(renderer, {
    id: "work-spin",
    name: "dots",
    color: "#88CCFF",
  });
  panel.add(spin);
  panel.add(
    new TextRenderable(renderer, {
      content: ` ${label}`,
      fg: "#CCCCCC",
      marginLeft: 1,
    }),
  );
  content.add(panel);
  try {
    return await work();
  } finally {
    spin.stop();
  }
}
