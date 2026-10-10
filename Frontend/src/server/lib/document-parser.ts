import { serverConfig } from "../config";
import FormData from "form-data";

export interface ParsedElement {
  type: string;
  element_id: string;
  text: string;
  metadata: Record<string, any>;
}

export class DocumentParser {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = serverConfig.UNSTRUCTURED_API_KEY;
    this.apiUrl = serverConfig.UNSTRUCTURED_API_URL;
  }

  async parseDocument(
    buffer: Buffer,
    filename: string,
    options: {
      strategy?: string;
      languages?: string[];
      chunkingStrategy?: string;
      maxCharacters?: number;
      newAfterNChars?: number;
      combineTextUnderNChars?: number;
    } = {}
  ): Promise<ParsedElement[]> {
    if (!this.apiKey) {
      return [
        {
          type: "NarrativeText",
          element_id: crypto.randomUUID(),
          text: `Extracted content for ${filename}`,
          metadata: { filename, page_number: 1 },
        },
      ];
    }

    // Support both Unstructured Transform V2 API and legacy V1 API
    const isV2 = this.apiUrl.includes("/api/v2");

    if (isV2) {
      const form = new FormData();
      form.append("input", buffer, { filename });

      const targetUrl = this.apiUrl.endsWith("/parse")
        ? this.apiUrl
        : `${this.apiUrl.replace(/\/$/, "")}/parse`;

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "unstructured-api-key": this.apiKey,
          ...form.getHeaders(),
        },
        body: form.getBuffer() as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Unstructured V2 API failed (${response.status}): ${errorText}`);
      }

      const json = await response.json();
      
      // If elements are present in v2 output and non-empty
      if (json.elements && Array.isArray(json.elements) && json.elements.length > 0) {
        return json.elements.map((elem: any) => ({
          type: elem.type || "NarrativeText",
          element_id: elem.element_id || crypto.randomUUID(),
          text: elem.text || "",
          metadata: elem.metadata || { filename },
        }));
      }

      // If markdown is returned, extract structured semantic chunks
      if (json.markdown && typeof json.markdown === "string" && json.markdown.trim()) {
        return this.chunkMarkdown(json.markdown, filename, options, json);
      }

      return [];
    }

  private chunkMarkdown(
    markdown: string,
    filename: string,
    options: {
      maxCharacters?: number;
      newAfterNChars?: number;
      combineTextUnderNChars?: number;
    },
    json: any
  ): ParsedElement[] {
    const maxCharacters = options.maxCharacters || 3000;
    const combineTextUnderNChars = options.combineTextUnderNChars || 200;

    // Split by markdown headers (#, ##, ###, ####)
    const rawSections = markdown
      .split(/(?=\n#{1,4}\s+)/)
      .map((s) => s.trim())
      .filter(Boolean);

    const textChunks: string[] = [];
    let currentBuffer = "";

    for (const section of rawSections) {
      if (section.length > maxCharacters) {
        if (currentBuffer) {
          textChunks.push(currentBuffer);
          currentBuffer = "";
        }
        // Split oversized section by paragraphs
        const paragraphs = section
          .split(/\n\n+/)
          .map((p) => p.trim())
          .filter(Boolean);

        let subBuffer = "";
        for (const p of paragraphs) {
          if (subBuffer.length + p.length + 2 <= maxCharacters) {
            subBuffer = subBuffer ? `${subBuffer}\n\n${p}` : p;
          } else {
            if (subBuffer) textChunks.push(subBuffer);
            subBuffer = p;
          }
        }
        if (subBuffer) textChunks.push(subBuffer);
      } else {
        if (currentBuffer.length + section.length + 2 <= maxCharacters) {
          currentBuffer = currentBuffer ? `${currentBuffer}\n\n${section}` : section;
          if (currentBuffer.length >= combineTextUnderNChars) {
            textChunks.push(currentBuffer);
            currentBuffer = "";
          }
        } else {
          if (currentBuffer) textChunks.push(currentBuffer);
          currentBuffer = section;
        }
      }
    }
    if (currentBuffer) textChunks.push(currentBuffer);

    return textChunks.map((chunk, idx) => {
      let type = "NarrativeText";
      if (chunk.includes("<table") || /\|.*\|[\r\n]+\|[-:| ]+\|/m.test(chunk)) {
        type = "Table";
      } else if (chunk.startsWith("#")) {
        type = "Title";
      } else if (chunk.includes("![")) {
        type = "Image";
      }

      return {
        type,
        element_id: `${json?.id || crypto.randomUUID()}_${idx}`,
        text: chunk,
        metadata: {
          filename,
          page_count: json?.metadata?.page_count || 1,
          section_index: idx,
          ...(json?.metadata || {}),
        },
      };
    });
  }

    // Legacy V1 General API
    const form = new FormData();
    form.append("files", buffer, { filename });
    form.append("strategy", options.strategy || "auto");
    form.append("chunking_strategy", options.chunkingStrategy || "by_title");
    form.append("max_characters", String(options.maxCharacters || 3000));
    form.append("new_after_n_chars", String(options.newAfterNChars || 3800));
    form.append("combine_text_under_n_chars", String(options.combineTextUnderNChars || 200));

    if (options.languages && options.languages.length) {
      form.append("languages", JSON.stringify(options.languages));
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "unstructured-api-key": this.apiKey,
        ...form.getHeaders(),
      },
      body: form.getBuffer() as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Unstructured API failed (${response.status}): ${errorText}`);
    }

    const elements = await response.json();
    return elements as ParsedElement[];
  }
}
