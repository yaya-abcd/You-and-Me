const GITHUB_OWNER = "yaya-abcd";
const GITHUB_REPOSITORY = "You-and-Me";
const PAGES_BRANCH = "main";
const DATA_BRANCH = "space-data";
const STATE_PATH = "state.secure";
const ALLOWED_ORIGIN = "https://yaya-abcd.github.io";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = origin || ALLOWED_ORIGIN;

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "origin not allowed" }, 403, corsOrigin);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }

    try {
      await verifyPasscode(request, env);
      const url = new URL(request.url);

      if (url.pathname === "/unlock" && request.method === "POST") {
        await ensureDataBranch(env);
        return json({ ok: true }, 200, corsOrigin);
      }

      if (url.pathname === "/state" && request.method === "GET") {
        await ensureDataBranch(env);
        return json(await readState(env), 200, corsOrigin);
      }

      if (url.pathname === "/state" && request.method === "PUT") {
        await ensureDataBranch(env);
        const payload = await request.json();
        validateStatePayload(payload);
        return json(await writeState(env, payload), 200, corsOrigin);
      }

      return json({ error: "not found" }, 404, corsOrigin);
    } catch (error) {
      const status = clientStatus(error);
      return json({ error: status >= 500 ? "sync service unavailable" : error.message }, status, corsOrigin);
    }
  },
};

async function verifyPasscode(request, env) {
  if (!env.SPACE_PASSCODE_HASH || !env.GITHUB_TOKEN) {
    throw new HttpError(500, "worker secrets are not configured");
  }

  const passcode = request.headers.get("X-Space-Passcode") || "";
  const suppliedHash = await sha256Hex(passcode);
  if (!constantTimeEqual(suppliedHash, env.SPACE_PASSCODE_HASH)) {
    throw new HttpError(401, "invalid passcode");
  }
}

async function ensureDataBranch(env) {
  try {
    await githubRequest(env, `/git/ref/heads/${encodeURIComponent(DATA_BRANCH)}`);
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const baseRef = await githubRequest(env, `/git/ref/heads/${encodeURIComponent(PAGES_BRANCH)}`);
  try {
    await githubRequest(env, "/git/refs", {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${DATA_BRANCH}`,
        sha: baseRef.object.sha,
      }),
    });
  } catch (error) {
    if (error.status !== 422) throw error;
  }
}

async function readState(env) {
  let metadata;
  try {
    metadata = await githubRequest(
      env,
      `/contents/${encodeURIComponent(STATE_PATH)}?ref=${encodeURIComponent(DATA_BRANCH)}`,
    );
  } catch (error) {
    if (error.status === 404) return { exists: false };
    throw error;
  }

  let content = metadata.content?.replace(/\s/g, "") || "";
  if (!content && metadata.sha) {
    const blob = await githubRequest(env, `/git/blobs/${encodeURIComponent(metadata.sha)}`);
    content = blob.content?.replace(/\s/g, "") || "";
  }
  if (!content) throw new HttpError(502, "state content unavailable");

  return { exists: true, sha: metadata.sha, content };
}

async function writeState(env, payload) {
  const body = {
    message: String(payload.message || "Update private space").slice(0, 120),
    content: payload.content,
    branch: DATA_BRANCH,
  };
  if (payload.sha) body.sha = payload.sha;

  const result = await githubRequest(env, `/contents/${encodeURIComponent(STATE_PATH)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return { ok: true, sha: result.content.sha };
}

function validateStatePayload(payload) {
  if (!payload || typeof payload.content !== "string" || payload.content.length === 0) {
    throw new HttpError(400, "state content is required");
  }
  if (payload.content.length > 125 * 1024 * 1024) {
    throw new HttpError(413, "state content is too large");
  }
  if (payload.sha && typeof payload.sha !== "string") {
    throw new HttpError(400, "state sha is invalid");
  }
}

async function githubRequest(env, path, options = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "you-and-me-sync-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // GitHub occasionally returns an empty response body.
  }

  if (!response.ok) {
    throw new GithubError(response.status, data?.message || "GitHub request failed");
  }
  return data;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function clientStatus(error) {
  if (error instanceof GithubError) {
    return error.status === 409 || error.status === 422 ? 409 : 502;
  }
  if (!(error instanceof HttpError)) return 500;
  if (error.status === 409 || error.status === 422) return 409;
  if ([400, 401, 403, 404, 413].includes(error.status)) return error.status;
  return 502;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Space-Passcode",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class GithubError extends HttpError {}
