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
      page.getByRole("heading", {
        level: 1,
        name: /Run the harness yourself/,
      }),
    ).toBeVisible();
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

  test("renders every tier and switches billing cycle", async ({ page }) => {
    await page.goto("/pricing");

    for (const tier of ["Self-hosted", "Free", "Pro", "Team", "Enterprise"]) {
      await expect(
        page.getByRole("heading", { level: 2, name: tier, exact: true }),
      ).toBeVisible();
    }

    // Annual is the default cycle.
    await expect(page.getByText("$228 billed yearly")).toBeVisible();

    await page.getByRole("button", { name: "Monthly" }).click();
    await expect(
      page.getByText("Billed monthly", { exact: true }),
    ).toBeVisible();
  });

  test("shows the comparison table and FAQ", async ({ page }) => {
    await page.goto("/pricing");

    await expect(
      page.getByRole("heading", { name: "Compare plans" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Agent runs \/ month/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What counts as an agent run?" }),
    ).toBeVisible();
  });
});

test.describe("Checkout flow", () => {
  test("carries the chosen plan and cycle from the pricing page", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await page.getByRole("link", { name: "Subscribe" }).click();

    await page.waitForURL("**/pricing/checkout**");
    expect(page.url()).toContain("plan=pro");
    expect(page.url()).toContain("cycle=annual");
    await expect(
      page.getByRole("button", { name: /Pay \$228 and subscribe/ }),
    ).toBeVisible();
  });

  test("applies a promo code to the total", async ({ page }) => {
    await page.goto("/pricing/checkout?plan=pro&cycle=annual");

    await page.getByLabel("Promo code").fill("launch20");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText("LAUNCH20 · 20% off applied.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Pay \$182\.40 and subscribe/ }),
    ).toBeVisible();
  });

  test("rejects an unknown promo code", async ({ page }) => {
    await page.goto("/pricing/checkout?plan=pro&cycle=annual");

    await page.getByLabel("Promo code").fill("NOPE");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText("That code isn't valid.")).toBeVisible();
  });

  test("prices Team per seat and updates with the stepper", async ({
    page,
  }) => {
    await page.goto("/pricing/checkout?plan=team&cycle=monthly&seats=3");

    await expect(page.getByText("Team · monthly × 3 seats")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Pay \$177 and subscribe/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add a seat" }).click();
    await expect(page.getByText("Team · monthly × 4 seats")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Pay \$236 and subscribe/ }),
    ).toBeVisible();
  });

  test("does not expose editable card fields before Stripe is mounted", async ({
    page,
  }) => {
    await page.goto("/pricing/checkout?plan=pro&cycle=annual");

    const mount = page.locator("#payment-element");
    await expect(mount).toBeVisible();
    const fields = await mount.locator("input").all();
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      await expect(field).toHaveAttribute("readonly", "");
    }
  });

  test("lands on a receipt that matches the order", async ({ page }) => {
    await page.goto("/pricing/checkout?plan=team&cycle=annual&seats=2");
    await page.getByRole("button", { name: /and subscribe/ }).click();

    await page.waitForURL("**/pricing/success**");
    await expect(
      page.getByRole("heading", { level: 1, name: "You're on Team." }),
    ).toBeVisible();
    await expect(page.getByText("Team · 2 seats")).toBeVisible();
    await expect(page.getByText("$1176")).toBeVisible();
  });

  test("reaches billing from the receipt", async ({ page }) => {
    await page.goto("/pricing/success?plan=pro&cycle=annual");
    await page.getByRole("link", { name: "Manage subscription" }).click();

    await page.waitForURL("**/billing");
    await expect(
      page.getByRole("heading", { level: 1, name: "Billing" }),
    ).toBeVisible();
    await expect(page.getByRole("meter", { name: "Agent runs" })).toBeVisible();
  });
});
