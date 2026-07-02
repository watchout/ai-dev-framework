import { describe, expect, it } from "vitest";
import {
  parseMergeAuthorityGraphQlResponse,
  parseRepo,
} from "./github-reviews.js";

describe("github reviews adapter", () => {
  it("parses merge authority pull request data", () => {
    const result = parseMergeAuthorityGraphQlResponse(JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            number: 186,
            headRefOid: "head-sha",
            baseRefName: "main",
            isDraft: false,
            labels: {
              nodes: [{ name: "route:fast-merge" }, { name: "audit-passed" }],
              pageInfo: { hasNextPage: false },
            },
            reviews: {
              nodes: [
                {
                  author: { login: "cto-login" },
                  state: "APPROVED",
                  commit: { oid: "head-sha" },
                  submittedAt: "2026-05-21T00:00:00Z",
                },
                {
                  author: { login: "reviewer" },
                  state: "DISMISSED",
                  commit: { oid: "head-sha" },
                  submittedAt: "2026-05-21T01:00:00Z",
                },
              ],
              pageInfo: { hasPreviousPage: false },
            },
            comments: {
              nodes: [
                {
                  author: { login: "cto-login" },
                  body: [
                    "ordinary note",
                    "```yaml",
                    "schema_version: shirube-owner-decision/v1",
                    "target_pr: 186",
                    "target_head: head-sha",
                    "decision: APPROVED",
                    "```",
                  ].join("\n"),
                  createdAt: "2026-05-21T02:00:00Z",
                  url: "https://github.example/comment/1",
                },
                {
                  author: { login: "someone-else" },
                  body: "ordinary comment",
                  createdAt: "2026-05-21T03:00:00Z",
                  url: "https://github.example/comment/2",
                },
              ],
              pageInfo: { hasPreviousPage: false },
            },
          },
        },
      },
    }));

    expect(result.pullRequest).toEqual({
      number: 186,
      headRefOid: "head-sha",
      baseRefName: "main",
      isDraft: false,
      labels: ["route:fast-merge", "audit-passed"],
    });
    expect(result.reviews).toEqual([
      {
        author: "cto-login",
        state: "APPROVED",
        commitId: "head-sha",
        submittedAt: "2026-05-21T00:00:00Z",
        dismissed: false,
      },
      {
        author: "reviewer",
        state: "DISMISSED",
        commitId: "head-sha",
        submittedAt: "2026-05-21T01:00:00Z",
        dismissed: true,
      },
    ]);
    expect(result.ownerDecisionComments).toEqual([
      {
        author: "cto-login",
        body: [
          "ordinary note",
          "```yaml",
          "schema_version: shirube-owner-decision/v1",
          "target_pr: 186",
          "target_head: head-sha",
          "decision: APPROVED",
          "```",
        ].join("\n"),
        createdAt: "2026-05-21T02:00:00Z",
        url: "https://github.example/comment/1",
      },
    ]);
  });

  it("throws when pull request data is missing", () => {
    expect(() => parseMergeAuthorityGraphQlResponse(JSON.stringify({
      data: { repository: { pullRequest: null } },
    }))).toThrow("GitHub pull request data not found");
  });

  it("fails closed when review data is truncated", () => {
    expect(() => parseMergeAuthorityGraphQlResponse(JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            number: 187,
            headRefOid: "head-sha",
            baseRefName: "main",
            isDraft: false,
            labels: {
              nodes: [{ name: "route:fast-merge" }],
              pageInfo: { hasNextPage: false },
            },
            reviews: {
              nodes: [
                {
                  author: { login: "cto-login" },
                  state: "APPROVED",
                  commit: { oid: "head-sha" },
                  submittedAt: "2026-05-21T00:00:00Z",
                },
              ],
              pageInfo: { hasPreviousPage: true },
            },
          },
        },
      },
    }))).toThrow("GitHub review data is truncated");
  });

  it("fails closed when label data is truncated", () => {
    expect(() => parseMergeAuthorityGraphQlResponse(JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            number: 187,
            headRefOid: "head-sha",
            baseRefName: "main",
            isDraft: false,
            labels: {
              nodes: [{ name: "route:fast-merge" }],
              pageInfo: { hasNextPage: true },
            },
            reviews: {
              nodes: [],
              pageInfo: { hasPreviousPage: false },
            },
          },
        },
      },
    }))).toThrow("GitHub label data is truncated");
  });

  it("continues with the latest available owner_decision comments when older comments are truncated", () => {
    const result = parseMergeAuthorityGraphQlResponse(JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            number: 187,
            headRefOid: "head-sha",
            baseRefName: "main",
            isDraft: false,
            labels: {
              nodes: [{ name: "route:fast-merge" }],
              pageInfo: { hasNextPage: false },
            },
            reviews: {
              nodes: [],
              pageInfo: { hasPreviousPage: false },
            },
            comments: {
              nodes: [
                {
                  author: { login: "cto-login" },
                  body: "<!-- shirube-owner-decision/v1 -->\n```yaml\nschema_version: shirube-owner-decision/v1\ntarget_pr: 187\ntarget_head: head-sha\ndecision: APPROVED\n```",
                  createdAt: "2026-05-21T02:00:00Z",
                  url: "https://github.example/comment/1",
                },
              ],
              pageInfo: { hasPreviousPage: true },
            },
          },
        },
      },
    }));

    expect(result.ownerDecisionComments).toHaveLength(1);
  });

  it("fails closed when a review node is incomplete", () => {
    expect(() => parseMergeAuthorityGraphQlResponse(JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            number: 187,
            headRefOid: "head-sha",
            baseRefName: "main",
            isDraft: false,
            labels: {
              nodes: [{ name: "route:fast-merge" }],
              pageInfo: { hasNextPage: false },
            },
            reviews: {
              nodes: [
                {
                  author: null,
                  state: "APPROVED",
                  commit: { oid: "head-sha" },
                  submittedAt: "2026-05-21T02:00:00Z",
                },
              ],
              pageInfo: { hasPreviousPage: false },
            },
          },
        },
      },
    }))).toThrow("GitHub review data is incomplete");
  });

  it("parses owner/repo slugs", () => {
    expect(parseRepo("watchout/ai-dev-framework")).toEqual({
      owner: "watchout",
      name: "ai-dev-framework",
    });
    expect(() => parseRepo("not-a-slug")).toThrow("Invalid GitHub repository slug");
  });
});
