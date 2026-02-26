const API_BASE = "/api";

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = await response.json();
      if (body && body.error) {
        message = body.error;
      }
    } catch {
      message = response.statusText;
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export function useApi() {
  return {
    get: (path) => apiRequest(path, { method: "GET" }),
    post: (path, body) =>
      apiRequest(path, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    put: (path, body) =>
      apiRequest(path, {
        method: "PUT",
        body: JSON.stringify(body)
      }),
    delete: (path) => apiRequest(path, { method: "DELETE" })
  };
}
