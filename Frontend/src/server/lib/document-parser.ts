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
      
      // If elements are present in v2 output
      if (json.elements && Array.isArray(json.elements)) {
        return json.elements.map((elem: any) => ({
          type: elem.type || "NarrativeText",
          element_id: elem.element_id || crypto.randomUUID(),
          text: elem.text || "",
          metadata: elem.metadata || { filename },
        }));
      }

      // If markdown is returned, extract chunks
      if (json.markdown) {
        const paragraphs = json.markdown.split(/\n\n+/).filter(Boolean);
        return paragraphs.map((para: string, idx: number) => ({
          type: "NarrativeText",
          element_id: `${json.id || crypto.randomUUID()}_${idx}`,
          text: para.trim(),
          metadata: { filename, ...json.metadata },
        }));
      }

      return [];
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
