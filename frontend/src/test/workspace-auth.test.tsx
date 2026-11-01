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
    expect(
      screen.getByText("Sign in to continue to your project console."),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
  });

  it("switches to registration mode and displays full name input", () => {
    render(<Workspace />);

    const registerTab = screen.getByRole("button", { name: "Create account" });
    fireEvent.click(registerTab);

    expect(screen.getByRole("heading", { name: "Create your workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();

    // Switch back to sign in
    const signInTab = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(signInTab);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
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
    const passwordInput = screen.getByLabelText(/password/i);
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
    });
  });

  it("handles registration flow calling register then login", async () => {
    const apiSpy = vi.spyOn(backendApi, "api");

    apiSpy.mockImplementation((path) => {
      if (path === "/api/v1/auth/register") {
        return Promise.resolve({
          id: "u2",
          email: "new@barclays.com",
          full_name: "New Engineer",
          role: "member",
        });
      }
      if (path === "/api/v1/auth/login") {
        return Promise.resolve({ access_token: "new-user-token" });
      }
      if (path === "/api/v1/auth/me") {
        return Promise.resolve({
          id: "u2",
          email: "new@barclays.com",
          full_name: "New Engineer",
          role: "member",
        });
      }
      if (path === "/api/v1/projects") {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });

    render(<Workspace />);

    // Switch to register
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "New Engineer" },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "new@barclays.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "secret1234" },
    });

    const submitBtn = screen.getByRole("button", { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        "/api/v1/auth/register",
        undefined,
        expect.objectContaining({ method: "POST" }),
      );
      expect(apiSpy).toHaveBeenCalledWith(
        "/api/v1/auth/login",
        undefined,
        expect.objectContaining({ method: "POST" }),
      );
      expect(localStorage.getItem("sprintsmith_access_token")).toBe("new-user-token");
    });
  });

  it("displays error message when login fails", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue(new Error("Invalid credentials"));

    render(<Workspace />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "wrong@test.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
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
