import { useAuth } from "../App.jsx";

const API_BASE = "/api";

export async function apiRequest(path, options = {}, token) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

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
  const { token } = useAuth();
  return {
    get: (path) => apiRequest(path, { method: "GET" }, token),
    post: (path, body) =>
      apiRequest(
        path,
        {
          method: "POST",
          body: JSON.stringify(body)
        },
        token
      ),
    delete: (path) => apiRequest(path, { method: "DELETE" }, token)
  };
}
