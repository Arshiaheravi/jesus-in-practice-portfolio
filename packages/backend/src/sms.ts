/** GSM 03.38 default alphabet. Extension-table characters consume two septets. */
const gsmBasic = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);
const gsmExtension = new Set(Array.from("\f^{}\\[~]|€"));

export interface SmsAnalysis {
  encoding: "GSM-7" | "UCS-2";
  units: number;
  segments: number;
  singleSegmentLimit: number;
  multipartSegmentLimit: number;
}

/** Toll-free Canada/US encoding units; requires provider Smart Encoding disabled. */
export function analyzeSms(body: string): SmsAnalysis {
  let septets = 0;
  let gsm = true;
  for (const character of body) {
    if (gsmBasic.has(character)) septets += 1;
    else if (gsmExtension.has(character)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  // JS length counts UTF-16 code units, including two units for surrogate-pair emoji.
  const units = gsm ? septets : body.length;
  const singleSegmentLimit = gsm ? 160 : 70;
  const multipartSegmentLimit = gsm ? 152 : 66;
  let segments = units === 0 ? 0 : 1;
  if (units > singleSegmentLimit) {
    let used = 0;
    // Escape pairs and Unicode graphemes must fit together, rather than splitting
    // a two-unit character at a boundary and underestimating the final segment.
    const characters = gsm
      ? Array.from(body)
      : Array.from(
          new Intl.Segmenter("en", { granularity: "grapheme" }).segment(body),
          (part) => part.segment,
        );
    for (const character of characters) {
      const size = gsm ? (gsmExtension.has(character) ? 2 : 1) : character.length;
      if (size > multipartSegmentLimit) throw new Error("SMS_CHARACTER_SEQUENCE_TOO_LONG");
      if (used + size > multipartSegmentLimit) {
        segments += 1;
        used = 0;
      }
      used += size;
    }
  }
  return {
    encoding: gsm ? "GSM-7" : "UCS-2",
    units,
    segments,
    singleSegmentLimit,
    multipartSegmentLimit,
  };
}

/** Punctuation-only substitutions preserve the words while avoiding accidental Unicode fees. */
export function normalizeSmsPunctuation(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ");
}

export function enforceSmsLimit(body: string, maxSegments: number): SmsAnalysis {
  if (!Number.isInteger(maxSegments) || maxSegments < 1 || maxSegments > 10) {
    throw new Error("SMS segment cap must be an integer from 1 to 10.");
  }
  const result = analyzeSms(body);
  if (
    !result.segments ||
    result.segments > maxSegments ||
    result.units > (result.encoding === "GSM-7" ? 1600 : 700)
  ) {
    throw new Error("SMS_SEGMENT_LIMIT");
  }
  return result;
}
