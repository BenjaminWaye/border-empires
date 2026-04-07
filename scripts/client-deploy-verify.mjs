export function parseBundleAssetPath(html) {
  const match = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/i);
  return match?.[1] ?? null;
}

export function parseDeploymentUrl(output) {
  const jsonUrl = output.match(/"url"\s*:\s*"([^"]+)"/);
  if (jsonUrl?.[1]) return jsonUrl[1];
  const productionLine = output.match(/Production:\s+(https:\/\/\S+)/);
  if (productionLine?.[1]) return productionLine[1];
  return null;
}

export function aliasServesExpectedBundle(aliasHtml, expectedBundlePath) {
  if (!expectedBundlePath) return false;
  return parseBundleAssetPath(aliasHtml) === expectedBundlePath;
}
