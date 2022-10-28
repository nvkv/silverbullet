import { editor, markdown, space } from "$sb/silverbullet-syscall/mod.ts";
import { extractMeta } from "../directive/data.ts";
import { renderToText } from "$sb/lib/tree.ts";
import { niceDate } from "$sb/lib/dates.ts";
import { readSettings } from "$sb/lib/settings_page.ts";

export async function instantiateTemplateCommand() {
  const allPages = await space.listPages();
  const { pageTemplatePrefix } = await readSettings({
    pageTemplatePrefix: "template/page/",
  });

  const selectedTemplate = await editor.filterBox(
    "Template",
    allPages
      .filter((pageMeta) => pageMeta.name.startsWith(pageTemplatePrefix))
      .map((pageMeta) => ({
        ...pageMeta,
        name: pageMeta.name.slice(pageTemplatePrefix.length),
      })),
    `Select the template to create a new page from (listing any page starting with <tt>${pageTemplatePrefix}</tt>)`,
  );

  if (!selectedTemplate) {
    return;
  }
  console.log("Selected template", selectedTemplate);

  const text = await space.readPage(
    `${pageTemplatePrefix}${selectedTemplate.name}`,
  );

  const parseTree = await markdown.parseMarkdown(text);
  const additionalPageMeta = extractMeta(parseTree, [
    "$name",
    "$disableDirectives",
  ]);

  const pageName = await editor.prompt(
    "Name of new page",
    additionalPageMeta.$name,
  );
  if (!pageName) {
    return;
  }
  const pageText = replaceTemplateVars(renderToText(parseTree), pageName);
  await space.writePage(pageName, pageText);
  await editor.navigate(pageName);
}

export async function insertSnippet() {
  const allPages = await space.listPages();
  const { snippetPrefix } = await readSettings({
    snippetPrefix: "snippet/",
  });
  const cursorPos = await editor.getCursor();
  const page = await editor.getCurrentPage();
  const allSnippets = allPages
    .filter((pageMeta) => pageMeta.name.startsWith(snippetPrefix))
    .map((pageMeta) => ({
      ...pageMeta,
      name: pageMeta.name.slice(snippetPrefix.length),
    }));

  const selectedSnippet = await editor.filterBox(
    "Snippet",
    allSnippets,
    `Select the snippet to insert (listing any page starting with <tt>${snippetPrefix}</tt>)`,
  );

  if (!selectedSnippet) {
    return;
  }

  const text = await space.readPage(`${snippetPrefix}${selectedSnippet.name}`);
  let templateText = replaceTemplateVars(text, page);
  const carretPos = templateText.indexOf("|^|");
  templateText = templateText.replace("|^|", "");
  templateText = replaceTemplateVars(templateText, page);
  await editor.insertAtCursor(templateText);
  if (carretPos !== -1) {
    await editor.moveCursor(cursorPos + carretPos);
  }
}

// TODO: This should probably be replaced with handlebards somehow?
export function replaceTemplateVars(s: string, pageName: string): string {
  return s.replaceAll(/\{\{([^\}]+)\}\}/g, (match, v) => {
    switch (v) {
      case "today":
        return niceDate(new Date());
      case "tomorrow": {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return niceDate(tomorrow);
      }

      case "yesterday": {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return niceDate(yesterday);
      }
      case "lastWeek": {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        return niceDate(lastWeek);
      }
      case "page":
        return pageName;
    }
    return match;
  });
}

export async function quickNoteCommand() {
  const { quickNotePrefix } = await readSettings({
    quickNotePrefix: "📥 ",
  });
  const isoDate = new Date().toISOString();
  let [date, time] = isoDate.split("T");
  time = time.split(".")[0];
  const pageName = `${quickNotePrefix}${date} ${time}`;
  await editor.navigate(pageName);
}

export async function dailyNoteCommand() {
  const { dailyNoteTemplate, dailyNotePrefix } = await readSettings({
    dailyNoteTemplate: "template/page/Daily Note",
    dailyNotePrefix: "📅 ",
  });
  let dailyNoteTemplateText = "";
  try {
    dailyNoteTemplateText = await space.readPage(dailyNoteTemplate);
  } catch {
    console.warn(`No daily note template found at ${dailyNoteTemplate}`);
  }
  const date = niceDate(new Date());
  const pageName = `${dailyNotePrefix}${date}`;
  if (dailyNoteTemplateText) {
    try {
      await space.getPageMeta(pageName);
    } catch {
      // Doesn't exist, let's create
      await space.writePage(
        pageName,
        replaceTemplateVars(dailyNoteTemplateText, pageName),
      );
    }
    await editor.navigate(pageName);
  } else {
    await editor.navigate(pageName);
  }
}

export async function insertTemplateText(cmdDef: any) {
  const cursorPos = await editor.getCursor();
  const page = await editor.getCurrentPage();
  let templateText: string = cmdDef.value;
  const carretPos = templateText.indexOf("|^|");
  templateText = templateText.replace("|^|", "");
  templateText = replaceTemplateVars(templateText, page);
  await editor.insertAtCursor(templateText);
  if (carretPos !== -1) {
    await editor.moveCursor(cursorPos + carretPos);
  }
}