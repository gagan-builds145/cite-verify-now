export type CitationStyle = "APA" | "MLA" | "IEEE" | "Chicago" | "BibTeX" | "RIS";

export type CitablePaper = {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
};

function splitName(name: string): { given: string; family: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { given: "", family: parts[0] };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}

function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

function apaAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown author";
  const formatted = authors.slice(0, 20).map((author) => {
    const { given, family } = splitName(author);
    return given ? `${family}, ${initials(given)}` : family;
  });
  if (formatted.length === 1) return formatted[0];
  if (formatted.length <= 2) return formatted.join(", & ");
  return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
}

function mlaAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown author";
  const first = splitName(authors[0]);
  const lead = first.given ? `${first.family}, ${first.given}` : first.family;
  if (authors.length === 1) return lead;
  if (authors.length === 2) return `${lead}, and ${authors[1]}`;
  return `${lead}, et al`;
}

function ieeeAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown author";
  return authors
    .slice(0, 8)
    .map((author) => {
      const { given, family } = splitName(author);
      return given ? `${initials(given)} ${family}` : family;
    })
    .join(", ");
}

function doiLink(paper: CitablePaper): string {
  if (paper.doi) return `https://doi.org/${paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`;
  return paper.url ?? "";
}

export function formatCitation(paper: CitablePaper, style: CitationStyle): string {
  const year = paper.year ? String(paper.year) : "n.d.";
  const venue = paper.venue ?? "";
  const link = doiLink(paper);
  switch (style) {
    case "APA":
      return `${apaAuthors(paper.authors)} (${year}). ${paper.title}.${
        venue ? ` ${venue}.` : ""
      }${link ? ` ${link}` : ""}`;
    case "MLA":
      return `${mlaAuthors(paper.authors)}. “${paper.title}.”${venue ? ` ${venue},` : ""} ${year}.${
        link ? ` ${link}` : ""
      }`;
    case "IEEE":
      return `${ieeeAuthors(paper.authors)}, “${paper.title},”${venue ? ` ${venue},` : ""} ${year}.${
        link ? ` ${link}` : ""
      }`;
    case "Chicago":
      return `${apaAuthors(paper.authors).replace(/, & /, ", and ")}. “${paper.title}.”${
        venue ? ` ${venue}` : ""
      } (${year}).${link ? ` ${link}` : ""}`;
    case "BibTeX": {
      const key = `${splitName(paper.authors[0] ?? "paper").family.toLowerCase().replace(/\W+/g, "")}${year}`;
      return `@article{${key},
  author = {${paper.authors.join(" and ")}},
  title = {${paper.title}},
  year = {${year}},${venue ? `\n  journal = {${venue}},` : ""}${
    paper.doi ? `\n  doi = {${paper.doi}},` : ""
  }
}`;
    }
    case "RIS":
      return [
        "TY  - JOUR",
        ...paper.authors.map((author) => `AU  - ${author}`),
        `TI  - ${paper.title}`,
        venue ? `JO  - ${venue}` : "",
        `PY  - ${year}`,
        paper.doi ? `DO  - ${paper.doi}` : "",
        link ? `UR  - ${link}` : "",
        "ER  - ",
      ]
        .filter(Boolean)
        .join("\n");
    default:
      return paper.title;
  }
}

export function toCitablePaper(paper: {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
}): CitablePaper {
  return {
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    doi: paper.doi,
    url: paper.url,
  };
}
