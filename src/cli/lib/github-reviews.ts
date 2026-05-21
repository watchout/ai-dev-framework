import { execGh } from "./github-engine.js";
import {
  type MergeAuthorityPullRequest,
  type MergeAuthorityReview,
} from "./merge-authority.js";

export interface GitHubMergeAuthorityData {
  pullRequest: MergeAuthorityPullRequest;
  reviews: MergeAuthorityReview[];
}

interface GraphQlResponse {
  data?: {
    repository?: {
      pullRequest?: {
        number: number;
        headRefOid: string;
        baseRefName: string;
        isDraft: boolean;
        labels?: {
          nodes?: { name?: string | null }[];
          pageInfo?: {
            hasNextPage?: boolean | null;
          } | null;
        } | null;
        reviews?: {
          nodes?: {
            author?: { login?: string | null } | null;
            state?: string | null;
            commit?: { oid?: string | null } | null;
            submittedAt?: string | null;
          }[];
          pageInfo?: {
            hasPreviousPage?: boolean | null;
          } | null;
        } | null;
      } | null;
    } | null;
  };
}

const PR_QUERY = `
query MergeAuthorityPullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      headRefOid
      baseRefName
      isDraft
      labels(first: 100) {
        nodes {
          name
        }
        pageInfo {
          hasNextPage
        }
      }
      reviews(last: 100) {
        nodes {
          author {
            login
          }
          state
          commit {
            oid
          }
          submittedAt
        }
        pageInfo {
          hasPreviousPage
        }
      }
    }
  }
}`;

export async function fetchMergeAuthorityData(
  repo: string,
  prNumber: number,
): Promise<GitHubMergeAuthorityData> {
  const { owner, name } = parseRepo(repo);
  const raw = await execGh([
    "api",
    "graphql",
    "-f",
    `query=${PR_QUERY}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `name=${name}`,
    "-F",
    `number=${prNumber}`,
  ]);

  return parseMergeAuthorityGraphQlResponse(raw);
}

export function parseMergeAuthorityGraphQlResponse(
  raw: string,
): GitHubMergeAuthorityData {
  const parsed = JSON.parse(raw) as GraphQlResponse;
  const pr = parsed.data?.repository?.pullRequest;
  if (!pr) {
    throw new Error("GitHub pull request data not found");
  }

  if (pr.labels?.pageInfo?.hasNextPage) {
    throw new Error("GitHub label data is truncated; merge authority must fail closed");
  }
  if (pr.reviews?.pageInfo?.hasPreviousPage) {
    throw new Error("GitHub review data is truncated; merge authority must fail closed");
  }

  const labels = (pr.labels?.nodes ?? [])
    .map((node) => node.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  const reviews = (pr.reviews?.nodes ?? []).map((node) => {
    const author = node.author?.login;
    const state = normalizeReviewState(node.state);
    const commitId = node.commit?.oid;
    const submittedAt = node.submittedAt;
    if (!author || !state || !commitId || !submittedAt) {
      throw new Error("GitHub review data is incomplete; merge authority must fail closed");
    }
    return {
      author,
      state,
      commitId,
      submittedAt,
      dismissed: state === "DISMISSED",
    };
  });

  return {
    pullRequest: {
      number: pr.number,
      headRefOid: pr.headRefOid,
      baseRefName: pr.baseRefName,
      isDraft: pr.isDraft,
      labels,
    },
    reviews,
  };
}

export function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name || repo.split("/").length !== 2) {
    throw new Error(`Invalid GitHub repository slug: ${repo}`);
  }
  return { owner, name };
}

function normalizeReviewState(value: string | null | undefined): MergeAuthorityReview["state"] | null {
  if (
    value === "APPROVED" ||
    value === "CHANGES_REQUESTED" ||
    value === "COMMENTED" ||
    value === "DISMISSED"
  ) {
    return value;
  }
  return null;
}
