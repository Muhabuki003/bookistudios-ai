import { expect, test } from "@playwright/test";

test.describe("Pricing", () => {
  test("is reachable from the landing page navigation", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Pricing" })
      .click();

    await page.waitForURL("**/pricing");
    await expect(
      page.getByRole("heading", { level: 1, name: "Pricing" }),
    ).toBeVisible();
  });

  test("renders every tier and switches billing period", async ({ page }) => {
    await page.goto("/pricing");

    for (const tier of ["Community", "Pro", "Team", "Enterprise"]) {
      await expect(
        page.getByRole("heading", { level: 3, name: tier }),
      ).toBeVisible();
    }

    // Monthly is the default.
    await expect(page.getByText("$20", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^Yearly/ }).click();
    await expect(page.getByText("$16", { exact: true })).toBeVisible();
  });

  test("header Docs link points at the GitHub repository", async ({ page }) => {
    await page.goto("/pricing");

    const docs = page.getByRole("banner").getByRole("link", { name: /Docs/ });
    await expect(docs).toHaveAttribute(
      "href",
      "https://github.com/Muhabuki003/bookistudios-ai",
    );
    await expect(docs).toHaveAttribute("target", "_blank");
  });
});
