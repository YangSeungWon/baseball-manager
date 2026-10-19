// Legacy game tests use the same visible navigation as a player.
export async function enterLegacy(page, selector) {
  const menu = page.locator('.legacy-games');
  if (!await menu.evaluate(el => el.open)) await menu.locator(':scope > summary').click();
  await page.locator(selector).click();
}
