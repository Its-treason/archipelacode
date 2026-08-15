/** @format */
import { getUrl } from "../shared";
import { APAxios } from "../utils";

export type RecentSubmission = {
  id: string;
  titleSlug: string;
  /** Unix seconds, as a string. */
  timestamp: string;
  /** "Accepted", "Wrong Answer", "Time Limit Exceeded", ... */
  statusDisplay: string;
  lang: string;
};

const recentSubmissionsQuery = `
    query recentSubmissions($username: String!, $limit: Int) {
        recentSubmissionList(username: $username, limit: $limit) {
            id
            titleSlug
            timestamp
            statusDisplay
            lang
        }
    }
`;

/**
 * Recent submissions for a user, newest first. Unlike interpret_solution this
 * is a plain GraphQL read, so it is not behind the Cloudflare rule that blocks
 * the extension host's TLS fingerprint.
 *
 * Only real submissions appear here - "Run" in the LeetCode editor produces an
 * ephemeral interpret_id and is never recorded.
 */
export const recentSubmissions = async (
  username: string,
  limit: number = 20,
): Promise<RecentSubmission[]> => {
  return APAxios(getUrl("graphql"), {
    method: "POST",
    data: {
      query: recentSubmissionsQuery,
      variables: { username, limit },
    },
  }).then((res) => res.data?.data?.recentSubmissionList ?? []);
};

const submissionDetailsQuery = `
    query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
            code
            lang {
                name
            }
        }
    }
`;

/**
 * The code actually submitted, so the Archipelago item gate can be enforced
 * against what LeetCode judged rather than whatever happens to be in the
 * editor. Returns undefined if the submission is not visible to this account.
 */
export const submissionDetails = async (
  submissionId: string,
): Promise<{ code: string; lang: string } | undefined> => {
  const details = await APAxios(getUrl("graphql"), {
    method: "POST",
    data: {
      query: submissionDetailsQuery,
      variables: { submissionId: Number(submissionId) },
    },
  }).then((res) => res.data?.data?.submissionDetails);

  if (!details?.code) {
    return undefined;
  }
  return { code: details.code, lang: details.lang?.name ?? "" };
};
