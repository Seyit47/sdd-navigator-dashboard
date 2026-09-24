// @req SCD-VAL-001
import { ID_SOURCE } from "./ids.ts";
import type { AnnotationKind, FoundAnnotation } from "./types.ts";

// An id must not run on into more id characters, so "SCD-UI-0010" is not read as "SCD-UI-001".
const ID = `${ID_SOURCE}(?![\\w-])`;
// The tag (not inside a word), whitespace, then one or more comma-separated requirement ids.
const ANNOTATION = new RegExp(`(?<![\\w@])@req\\s+(${ID}(?:\\s*,\\s*${ID})*)`, "g");
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
