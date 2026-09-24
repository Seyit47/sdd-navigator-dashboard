// @req SCD-VAL-001
import type { AnnotationKind, FoundAnnotation } from "./types.ts";

const ID = "[A-Z]+-[A-Z0-9]+-\\d{3}";
// The tag, whitespace, then one or more comma-separated requirement ids.
const ANNOTATION = new RegExp(`@req\\s+(${ID}(?:\\s*,\\s*${ID})*)`, "g");
const TEST_FILE = /\.(?:test|contract)\.[cm]?[jt]sx?$/;

export function classifyFile(path: string): AnnotationKind {
  return TEST_FILE.test(path) ? "test" : "impl";
}

export function extractAnnotations(path: string, text: string): FoundAnnotation[] {
  const kind = classifyFile(path);
  const found: FoundAnnotation[] = [];
  text.split(/\r?\n/).forEach((lineText, index) => {
    for (const match of lineText.matchAll(ANNOTATION)) {
      for (const reqId of match[1].split(",")) {
        found.push({ file: path, line: index + 1, reqId: reqId.trim(), kind });
      }
    }
  });
  return found;
}
