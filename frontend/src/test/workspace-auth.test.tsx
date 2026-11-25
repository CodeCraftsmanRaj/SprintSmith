import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Workspace } from "@/screens/workspace";
import * as backendApi from "@/lib/backend-api";

describe("Workspace - Authentication", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders AuthScreen when no access token is stored in localStorage", () => {
    render(<Workspace />);

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Sign in to continue to your project console.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
  });

  it("does not offer public registration", () => {
    render(<Workspace />);

    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
    expect(screen.getByText(/accounts are provisioned by an administrator/i)).toBeInTheDocument();
  });

  it("toggles password visibility without an API call", () => {
    render(<Workspace />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(password.type).toBe("text");
  });

  it("handles successful sign in and stores auth token in localStorage", async () => {
    const apiSpy = vi.spyOn(backendApi, "api");

    apiSpy.mockImplementation((path) => {
      if (path === "/api/v1/auth/login") {
        return Promise.resolve({ access_token: "jwt-token-123" });
      }
      if (path === "/api/v1/auth/me") {
        return Promise.resolve({
          id: "u1",
          email: "dev@barclays.com",
          full_name: "Dev User",
          role: "admin",
        });
      }
      if (path === "/api/v1/projects") {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });

    render(<Workspace />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: "dev@barclays.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(localStorage.getItem("sprintsmith_access_token")).toBe("jwt-token-123");
    });

    // Workspace should now be active
    await waitFor(() => {
      expect(screen.getByText("Dev User")).toBeInTheDocument();
      expect(screen.getByText("admin")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
    });
  });

  it("never calls the registration endpoint during sign in", async () => {
    const apiSpy = vi.spyOn(backendApi, "api");
    apiSpy.mockImplementation((path) => {
      if (path === "/api/v1/auth/login") {
        return Promise.resolve({ access_token: "member-token" });
      }
      if (path === "/api/v1/auth/me") {
        return Promise.resolve({
          id: "u2",
          email: "member@example.com",
          full_name: "New Engineer",
          role: "member",
        });
      }
      return Promise.resolve([]);
    });

    render(<Workspace />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem("sprintsmith_access_token")).toBe("member-token");
      expect(screen.getByText("New Engineer")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
    expect(apiSpy.mock.calls.some(([path]) => String(path).includes("/auth/register"))).toBe(false);
  });

  it("displays error message when login fails", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue(new Error("Invalid credentials"));

    render(<Workspace />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "wrong@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpassword" },
    });

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
    expect(localStorage.getItem("sprintsmith_access_token")).toBeNull();
  });

  it("handles 401 unauthorized on initial load by signing out", async () => {
    localStorage.setItem("sprintsmith_access_token", "expired-token");

    vi.spyOn(backendApi, "api").mockRejectedValue(new Error("401 Unauthorized: Invalid token"));

    render(<Workspace />);

    await waitFor(() => {
      expect(localStorage.getItem("sprintsmith_access_token")).toBeNull();
      expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    });
  });

  it("signs out and clears localStorage when sign out button is clicked", async () => {
    localStorage.setItem("sprintsmith_access_token", "active-token");

    vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") {
        return Promise.resolve({
          id: "u1",
          email: "dev@barclays.com",
          full_name: "Active Dev",
          role: "lead",
        });
      }
      if (path === "/api/v1/projects") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByText("Active Dev")).toBeInTheDocument();
    });

    const signOutBtn = screen.getByTitle("Sign out");
    fireEvent.click(signOutBtn);

    expect(localStorage.getItem("sprintsmith_access_token")).toBeNull();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
