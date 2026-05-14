export type ParsedSkillMarkdown = {
  frontmatter: string;
  body: string;
};

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const content = markdown.trimStart();
  if (!content.startsWith("---\n")) {
    return { frontmatter: "", body: markdown };
  }

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: "", body: markdown };
  }

  const frontmatter = content.slice(4, end).trim();
  const body = content.slice(end + 5).trimStart();
  return { frontmatter, body };
}
