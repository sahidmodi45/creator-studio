import { workspaceFontsHref, workspaceThemeCss } from "@/lib/theme";

/** Dresses every page inside a workspace in that client's brand colours and fonts. */
export function WorkspaceTheme({ colors, fonts }: { colors: string[]; fonts: string[] }) {
  const css = workspaceThemeCss(colors, fonts);
  const href = workspaceFontsHref(fonts);
  return (
    <>
      {href && <link rel="stylesheet" href={href} precedence="default" />}
      {css && <style>{css}</style>}
    </>
  );
}
