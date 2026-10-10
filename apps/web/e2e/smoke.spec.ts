import { expect, test } from "@playwright/test";

// These tests need only the Next.js app. They cover routes that render without
// a signed-in session, so a broken build, layout or auth guard fails fast.

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Whiparc/);
});

test("login page shows the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("login page switches to sign-up mode", async ({ page }) => {
  await page.goto("/login?mode=signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("dashboard redirects signed-out visitors to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("docs page renders", async ({ page }) => {
  await page.goto("/docs");
  await expect(page).toHaveTitle(/Whiparc/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});
