import "server-only";

import { ContentRepository } from "@jesus-in-practice/backend/content-repository";

import { database } from "./runtime";
export function contentRepository() {
  return new ContentRepository(database(), {
    rightsEnabled: process.env.CONTENT_RIGHTS_ENABLED === "true",
  });
}
