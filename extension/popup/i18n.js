// UI text in Japanese and English. Findings carry an id and params; the words live only here.

/** @typedef {Record<string, any>} P */
/** @typedef {{ title: (p: P) => string, detail: (p: P) => string }} Message */

/** @type {Record<string, Message>} */
const JA = {
  not_https: { title: () => "HTTPSではありません", detail: () => "通信が暗号化されていません。入力した内容が途中で盗み見・改ざんされる可能性があります。" },
  password_over_http: {
    title: () => "暗号化されていないページにパスワード欄があります",
    detail: () => "パスワードが平文で送られる可能性があります。このページでは入力しないでください。",
  },
  card_on_page: {
    title: () => "カード番号をサイト自身のページで入力させています",
    detail: () =>
      "決済会社の入力画面（iframe）ではなく、このサイトのフォームにカード番号を入力する作りです。カード番号がサイトのサーバーを通る可能性があり、ページが改ざんされると盗まれます。",
  },
  card_tokenized_on_page: {
    title: (p) => `カード番号はページ上でトークン化されています（${p.provider}）`,
    detail: () =>
      "カード番号自体はサイトのサーバーに送られない方式です。ただし入力欄はサイトのページ上にあるため、ページが改ざんされると入力中の番号を盗まれます（国内のカード情報漏えいで多い手口）。",
  },
  card_hosted_iframe: {
    title: (p) => `カード入力は決済会社の画面内です（${p.providers}）`,
    detail: () => "カード番号は決済会社が提供する入力欄（iframe）に入力され、このサイトのページからは読み取れません。",
  },
  payment_redirect: {
    title: (p) => `決済会社のページへ移動して支払う方式です（${p.providers}）`,
    detail: () => "カード番号は決済会社のサイトで入力します。移動先のURLが本物か確認してください。",
  },
  payment_scripts_only: {
    title: (p) => `決済サービスを利用しています（${p.providers}）`,
    detail: () => "このページにはカード入力欄がありません。実際の入力方式は決済画面で改めて確認してください。",
  },
  no_card_form: { title: () => "このページにカード入力欄はありません", detail: () => "決済方式を評価するには、カード番号を入力する画面で開き直してください。" },
  vulnerable_library: {
    title: (p) => `既知の脆弱性があるライブラリ: ${p.component} ${p.version}`,
    detail: (p) => `${p.count}件の既知の脆弱性があります。` + (p.cves ? "（" + p.cves + "）" : ""),
  },
  eol: {
    title: (p) => `サポート終了: ${p.name} ${p.version}`,
    detail: (p) => `${p.label} は ${p.date} にセキュリティサポートが終了しています。OSのベンダーが修正を独自に提供している場合もあります。`,
  },
  eol_soon: {
    title: (p) => `まもなくサポート終了: ${p.name} ${p.version}`,
    detail: (p) => `${p.label} は ${p.date}（あと${p.days}日）にセキュリティサポートが終了します。`,
  },
  server_version_exposed: {
    title: (p) => `サーバーのバージョンを公開しています: ${p.value}`,
    detail: () => "攻撃者が脆弱なバージョンを探す手がかりになります。管理が行き届いていないサインのこともあります。",
  },
  powered_by_exposed: { title: (p) => `使用ソフトウェアを公開しています: ${p.value}`, detail: () => "X-Powered-By ヘッダーからサーバー側の技術が分かります。" },
  framework_header_exposed: { title: (p) => `フレームワーク情報を公開しています: ${p.value}`, detail: () => "不要なヘッダーです。" },
  session_cookie_not_httponly: {
    title: (p) => `セッションCookieをJavaScriptから読めます: ${p.names}`,
    detail: () => "HttpOnly属性がないため、ページに不正なスクリプトが入るとログイン状態を乗っ取られるおそれがあります。",
  },
  mixed_active: {
    title: (p) => `暗号化されていないスクリプト等を読み込んでいます（${p.count}件）`,
    detail: () => "HTTPSのページがHTTPでスクリプトやiframeを読み込もうとしています。ブラウザがブロックしますが、管理が行き届いていないサインです。",
  },
  mixed_passive: { title: (p) => `暗号化されていない画像を読み込んでいます（${p.count}件）`, detail: () => "影響は小さいですが、ページの一部がHTTPです。" },
  form_insecure_action: {
    title: () => "フォームの送信先が暗号化されていません",
    detail: (p) => (p.password ? "パスワードを含むフォームがHTTPで送信されます。" : "入力内容がHTTPで送信されます。"),
  },
  headers_unavailable: { title: () => "レスポンスヘッダーを取得できませんでした", detail: () => "ヘッダーに関するチェックは行っていません。" },
  no_hsts: { title: () => "HSTSが設定されていません", detail: () => "HTTPへ誘導する攻撃を防ぐ Strict-Transport-Security ヘッダーがありません。" },
  no_csp: { title: () => "CSPが設定されていません", detail: () => "Content-Security-Policy がなく、不正なスクリプトの実行を抑える仕組みがありません。" },
  csp_unsafe_inline: {
    title: () => "CSPがインラインスクリプトを許可しています",
    detail: () => "'unsafe-inline' によりCSPのスクリプト対策がほぼ無効になっています。",
  },
  no_nosniff: { title: () => "X-Content-Type-Options がありません", detail: () => "ファイル種別の誤判定を防ぐ nosniff が設定されていません。" },
  no_clickjacking: { title: () => "クリックジャッキング対策がありません", detail: () => "X-Frame-Options も CSP の frame-ancestors もありません。" },
  third_party_scripts: {
    title: (p) => `外部のスクリプトを読み込んでいます（${p.hosts}ドメイン, ${p.count}件）`,
    detail: () => "外部スクリプトはページ上の入力内容をすべて読み取れます。広告・解析タグなど多くは一般的なものです。",
  },
  no_sri: { title: (p) => `改ざん検知（SRI）のない外部スクリプト: ${p.count}件`, detail: () => "配信元が改ざんされた場合に検知できません。" },
};

/** @type {Record<string, Message>} */
const EN = {
  not_https: { title: () => "Not served over HTTPS", detail: () => "Traffic is unencrypted. Anything you enter can be read or altered in transit." },
  password_over_http: { title: () => "Password field on an unencrypted page", detail: () => "Passwords may be sent in clear text. Do not log in here." },
  card_on_page: {
    title: () => "Card number is typed into the site's own page",
    detail: () =>
      "Card fields are part of this site's form, not a payment provider's iframe. The number may pass through the site's server, and anyone who tampers with the page can steal it.",
  },
  card_tokenized_on_page: {
    title: (p) => `Card number is tokenized in the page (${p.provider})`,
    detail: () => "The raw number is not sent to the site's server, but the fields live on the site's page, so a tampered page can still read what you type.",
  },
  card_hosted_iframe: {
    title: (p) => `Card entry is inside the payment provider's frame (${p.providers})`,
    detail: () => "Card fields are served by the provider in an iframe; this site's page cannot read them.",
  },
  payment_redirect: {
    title: (p) => `Pays on the provider's own page (${p.providers})`,
    detail: () => "You enter the card on the provider's site. Check that the address is genuine.",
  },
  payment_scripts_only: {
    title: (p) => `Uses a payment service (${p.providers})`,
    detail: () => "No card fields on this page. Check again on the page where you enter the card.",
  },
  no_card_form: {
    title: () => "No card entry on this page",
    detail: () => "Open SafePeek on the page where you type the card number to assess payment handling.",
  },
  vulnerable_library: {
    title: (p) => `Library with known vulnerabilities: ${p.component} ${p.version}`,
    detail: (p) => `${p.count} known vulnerabilities.` + (p.cves ? " (" + p.cves + ")" : ""),
  },
  eol: {
    title: (p) => `End of life: ${p.name} ${p.version}`,
    detail: (p) => `Security support for ${p.label} ended on ${p.date}. OS vendors sometimes backport fixes.`,
  },
  eol_soon: { title: (p) => `End of life soon: ${p.name} ${p.version}`, detail: (p) => `Security support for ${p.label} ends on ${p.date} (${p.days} days).` },
  server_version_exposed: {
    title: (p) => `Server version exposed: ${p.value}`,
    detail: () => "Helps attackers look for known holes, and often a sign of loose maintenance.",
  },
  powered_by_exposed: { title: (p) => `Server software exposed: ${p.value}`, detail: () => "The X-Powered-By header reveals the backend technology." },
  framework_header_exposed: { title: (p) => `Framework header exposed: ${p.value}`, detail: () => "An unnecessary header." },
  session_cookie_not_httponly: {
    title: (p) => `Session cookie readable by JavaScript: ${p.names}`,
    detail: () => "Without HttpOnly, an injected script can hijack your session.",
  },
  mixed_active: {
    title: (p) => `Loads scripts or frames over HTTP (${p.count})`,
    detail: () => "Browsers block these, but it is a sign the site is not well maintained.",
  },
  mixed_passive: { title: (p) => `Loads images over HTTP (${p.count})`, detail: () => "Low impact, but part of the page is unencrypted." },
  form_insecure_action: {
    title: () => "A form submits over HTTP",
    detail: (p) => (p.password ? "A form with a password field is sent unencrypted." : "Form input is sent unencrypted."),
  },
  headers_unavailable: { title: () => "Could not read response headers", detail: () => "Header checks were skipped." },
  no_hsts: { title: () => "No HSTS", detail: () => "No Strict-Transport-Security header to prevent downgrade to HTTP." },
  no_csp: { title: () => "No Content Security Policy", detail: () => "Nothing limits which scripts may run on the page." },
  csp_unsafe_inline: { title: () => "CSP allows inline scripts", detail: () => "'unsafe-inline' largely disables CSP's protection against injected scripts." },
  no_nosniff: { title: () => "No X-Content-Type-Options", detail: () => "nosniff is not set." },
  no_clickjacking: { title: () => "No clickjacking protection", detail: () => "Neither X-Frame-Options nor CSP frame-ancestors is set." },
  third_party_scripts: {
    title: (p) => `Third-party scripts (${p.hosts} domains, ${p.count} files)`,
    detail: () => "Third-party scripts can read everything typed on the page. Most are ordinary analytics or tags.",
  },
  no_sri: { title: (p) => `Third-party scripts without integrity checks: ${p.count}`, detail: () => "A compromised CDN would go unnoticed." },
};

const UI = {
  ja: {
    scanning: "調べています…",
    level_danger: "重大な懸念があります",
    level_caution: "注意点があります",
    level_ok: "大きな問題は見つかりませんでした",
    level_note: "ページから見える情報だけで推定しています。「問題なし」は安全の保証ではありません。",
    high: "重大",
    medium: "注意",
    low: "軽微",
    info: "情報",
    good: "良好",
    payment: "カード決済",
    findings: "セキュリティ",
    technologies: "使われている技術",
    none: "なし",
    evidence: "根拠",
    unsupported: "このページは調べられません（http/httpsのページで開いてください）。",
    failed: "調査に失敗しました: ",
    footer: "解析はすべてこのブラウザ内で行われ、外部には何も送信しません。",
    data: "データ",
  },
  en: {
    scanning: "Scanning…",
    level_danger: "Serious concerns found",
    level_caution: "Some concerns found",
    level_ok: "No major problems found",
    level_note: "Inferred from what the page exposes. “No problems” is not a guarantee of safety.",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
    good: "Good",
    payment: "Card payment",
    findings: "Security",
    technologies: "Technologies",
    none: "None",
    evidence: "Evidence",
    unsupported: "This page cannot be inspected (open an http/https page).",
    failed: "Scan failed: ",
    footer: "Everything is analysed inside this browser. Nothing is sent anywhere.",
    data: "Data",
  },
};

/** @returns {"ja" | "en"} */
export function language() {
  return (globalThis.navigator?.language ?? "en").toLowerCase().startsWith("ja") ? "ja" : "en";
}

/**
 * @param {keyof typeof UI.en} key
 * @returns {string}
 */
export function t(key) {
  return UI[language()][key];
}

/**
 * @param {import("../src/types.js").Finding} f
 * @returns {{ title: string, detail: string }}
 */
export function describe(f) {
  const message = (language() === "ja" ? JA : EN)[f.id];
  if (!message) return { title: f.id, detail: "" };
  return { title: message.title(f.params), detail: message.detail(f.params) };
}

export const MESSAGE_IDS = { ja: Object.keys(JA), en: Object.keys(EN) };
