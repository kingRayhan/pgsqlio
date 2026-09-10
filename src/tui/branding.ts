import {
  ASCIIFontRenderable,
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";

export const SHELL_ID = "app-shell";
export const CONTENT_ID = "app-content";
const VERSION = "0.1.0";

function createHeader(renderer: CliRenderer): BoxRenderable {
  const header = new BoxRenderable(renderer, {
    id: "app-header",
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
  });

  const logo = new BoxRenderable(renderer, {
    id: "branding-logo",
    position: "relative",
    marginBottom: 0,
  });

  logo.add(
    new ASCIIFontRenderable(renderer, {
      id: "branding-shadow",
      text: "pgsqlio",
      font: "block",
      color: "#1A2228",
      position: "absolute",
      left: 1,
      top: 1,
      zIndex: 0,
    }),
  );

  logo.add(
    new ASCIIFontRenderable(renderer, {
      id: "branding-wordmark",
      text: "pgsqlio",
      font: "block",
      color: ["#2DD4BF", "#67E8F9", "#E0F2FE"],
      zIndex: 1,
    }),
  );

  header.add(logo);
  header.add(
    new TextRenderable(renderer, {
      id: "branding-tagline",
      content: `PostgreSQL dump · restore · cleanup  ·  v${VERSION}`,
      fg: "#3F3F46",
      marginTop: 1,
    }),
  );

  return header;
}

/** Mount sticky branding + content region. Call once at app start. */
export function mountShell(renderer: CliRenderer): BoxRenderable {
  for (const child of renderer.root.getChildren()) {
    renderer.root.remove(child.id);
  }

  const shell = new BoxRenderable(renderer, {
    id: SHELL_ID,
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: "#0C0C0C",
    padding: 1,
  });

  shell.add(createHeader(renderer));

  const content = new BoxRenderable(renderer, {
    id: CONTENT_ID,
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "column",
    marginTop: 1,
  });
  shell.add(content);
  renderer.root.add(shell);
  return content;
}

export function getContent(renderer: CliRenderer): BoxRenderable {
  const shell = renderer.root.getChildren().find((c) => c.id === SHELL_ID) as
    | BoxRenderable
    | undefined;
  if (!shell) {
    return mountShell(renderer);
  }
  const content = shell.getChildren().find((c) => c.id === CONTENT_ID) as
    | BoxRenderable
    | undefined;
  if (!content) {
    return mountShell(renderer);
  }
  return content;
}
