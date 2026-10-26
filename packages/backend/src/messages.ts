import type { Practice } from "@jesus-in-practice/content";

import { nonempty, trustedUrl } from "./providers/types.ts";
import { enforceSmsLimit, normalizeSmsPunctuation } from "./sms.ts";

export interface EmailMessageOptions {
  senderName: string;
  mailingAddress: string;
  supportEmail: string;
  unsubscribeUrl: string;
  practiceUrl: string;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function renderPracticeEmail(practice: Practice, options: EmailMessageOptions) {
  const sender = nonempty(options.senderName, "Sender name");
  const address = nonempty(options.mailingAddress, "Mailing address");
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(options.supportEmail))
    throw new Error("Invalid support email.");
  const unsubscribe = trustedUrl(options.unsubscribeUrl).href;
  const practiceUrl = trustedUrl(options.practiceUrl).href;
  const sourceUrl = trustedUrl(practice.sourceUrl, { allowFragment: true }).href;
  const source = practice.source === "bible" ? "Bible · KJV" : "Book of Mormon";
  const subject = `${sender}: ${practice.title}`.replace(/[\r\n]/g, " ");
  const sections = [
    ["In plain language", practice.plainMeaning],
    ["In real life", practice.everydayExample],
    ["Try this today", practice.action],
    ["Think about it", practice.reflection],
    ["About the passage", practice.summary],
  ];
  const original =
    "Our explanation and example, inspired by the linked passage. Not a scripture quotation.";
  const text = [
    sender,
    practice.title,
    `${source} / ${practice.reference}`,
    `Read the passage: ${sourceUrl}`,
    ...sections.map(([label, value]) => `${label}\n${value}`),
    original,
    `Read this practice: ${practiceUrl}`,
    `${sender}\n${address}\nSupport: ${options.supportEmail}`,
    `Unsubscribe from practice emails: ${unsubscribe}`,
  ].join("\n\n");
  const html = `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#faf7f0;color:#292522;font-family:Arial,sans-serif;line-height:1.7"><main style="max-width:640px;margin:0 auto;padding:32px 24px"><p style="color:#6b303d;font-weight:700">${escapeHtml(sender)}</p><h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.3">${escapeHtml(practice.title)}</h1><p>${escapeHtml(source)} / <a style="color:#6b303d" href="${escapeHtml(sourceUrl)}">${escapeHtml(practice.reference)} — read the passage</a></p>${sections.map(([label, value]) => `<section style="margin:24px 0"><h2 style="font-size:18px;line-height:1.4">${escapeHtml(label!)}</h2><p style="font-size:16px">${escapeHtml(value!)}</p></section>`).join("")}<p style="font-size:14px;color:#6a6057">${original}</p><p><a style="color:#6b303d" href="${escapeHtml(practiceUrl)}">Read this practice on the website</a></p><footer style="border-top:1px solid #d8cec1;padding-top:20px;margin-top:28px;font-size:14px;color:#6a6057"><p>${escapeHtml(sender)}<br>${escapeHtml(address)}<br>Support: <a style="color:#6b303d" href="mailto:${escapeHtml(options.supportEmail)}">${escapeHtml(options.supportEmail)}</a></p><p><a style="color:#6b303d" href="${escapeHtml(unsubscribe)}">Unsubscribe from practice emails</a></p></footer></main></body></html>`;
  return {
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export function renderPracticeSms(
  practice: Practice,
  options: { senderName: string; informationUrl: string; maxSegments: number },
) {
  const sender = nonempty(options.senderName, "Sender name");
  const informationUrl = trustedUrl(options.informationUrl).href;
  const source = practice.source === "bible" ? "Bible KJV" : "Book of Mormon";
  const body = normalizeSmsPunctuation(
    `${sender}\n${source} | ${practice.reference}\nMeaning: ${practice.plainMeaning}\nIn real life: ${practice.everydayExample}\nToday: ${practice.action}\nOur reflection, not a quotation.\nSTOP to unsubscribe. Info: ${informationUrl}`,
  );
  return { body, ...enforceSmsLimit(body, options.maxSegments) };
}
