// UI text in Japanese and English. Findings carry an id and params; the words live only here.

/** @typedef {Record<string, any>} P */
/** @typedef {{ title: (p: P) => string, detail: (p: P) => string }} Message */

/** @type {Record<string, Message>} */
const JA = {
  backend_related: {
    title: (p) => `同じ組織らしい別のシステム: ${p.hosts}`,
    detail: () =>
      "このページのHTML・フォーム・API呼び出し・自社のスクリプトに、同じ組織らしい別ホストのURLがあります。そのURLの形から推定した技術を根拠に並べています。このページ自体のバックエンドとは別で、推定はURLの形とドメイン名だけによるものです。",
  },
  backend_hosting: {
    title: (p) => `このページは ${p.name} から配信されています`,
    detail: (p) =>
      `ページそのものは ${p.name} が配信しています（確度「${confidenceLabel(Number(p.confidence))}」${p.confidence}）。前段にCDNがあったり、商品・会員・注文などのデータを扱うAPIは別のサーバーで動いていたりすることがよくあるため、サイト全体のバックエンドが ${p.name} だとは限りません。`,
  },
  backend_managed: {
    title: (p) => `バックエンドはマネージドサービスと推定: ${p.name}`,
    detail: (p) =>
      `${p.name}（${p.language}）がバックエンドを担っていると推定しています（確度「${confidenceLabel(Number(p.confidence))}」${p.confidence}）。サーバーOSやフレームワークの更新はサービス側の責任です。一方で、データベースのアクセスルールや認証の設定が甘いと情報が漏れるため、設定の安全性はこのページからは判断できません。`,
  },
  wp_core_eol: {
    title: (p) => `セキュリティ更新が終了したWordPress: ${p.version}`,
    detail: (p) =>
      `WordPress 4.7 未満は ${p.date} 以降セキュリティ修正が提供されていません。公式にサポートされるのは最新の ${p.series} 系（${p.latest}）だけです。`,
  },
  wp_core_outdated: {
    title: (p) => `古いWordPress: ${p.version}`,
    detail: (p) => `公式にサポートされるのは最新の ${p.series} 系（${p.latest}）だけで、それより古い系列へのセキュリティ修正は保証されていません。`,
  },
  wp_version_exposed: {
    title: (p) => `WordPressのバージョンを公開しています: ${p.version}`,
    detail: (p) => `${p.source} から読み取れます。古い場合は攻撃対象を探す手がかりになります。`,
  },
  wp_xmlrpc: {
    title: () => "WordPressのXML-RPCが有効です",
    detail: () => "xmlrpc.php はパスワード総当たりやピンバック悪用の入口として狙われやすく、使っていなければ無効化が推奨されます。",
  },
  wp_components: {
    title: (p) => `WordPressのプラグイン ${p.plugins}件・テーマ ${p.themes}件を確認`,
    detail: () =>
      "WordPressの被害の多くはプラグインの脆弱性が原因です。下のリンクで、各プラグインに既知の脆弱性がないか確認できます（?ver= の値はプラグインのバージョンでない場合もあります）。",
  },
  backend_eol: {
    title: (p) => `サポート終了のバックエンドの可能性: ${p.name}`,
    detail: (p) =>
      `${p.name}（${p.language}）は ${p.date} にサポートが終了しています。見つかった痕跡から推定しており、確度は「${confidenceLabel(Number(p.confidence))}」（${p.confidence}）です。放置されたフレームワークは修正されない脆弱性を抱えたままになります。`,
  },
  backend_legacy: {
    title: (p) => `古い世代のバックエンドの可能性: ${p.name}`,
    detail: (p) =>
      `${p.name}（${p.language}）は古い世代の技術で、更新が止まったまま運用されていることが多いものです。見つかった痕跡から推定しており、確度は「${confidenceLabel(Number(p.confidence))}」（${p.confidence}）です。`,
  },
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
  checkout_saas: {
    title: (p) => `ショップはカートサービス上にあります（${p.platforms}）`,
    detail: () =>
      "ショップ機能を提供しているのはカートサービスです。決済画面もそのサービスが用意するのが一般的ですが、カードを入力する画面の方式は決済画面でもう一度確かめてください。",
  },
  dest_session_replay: {
    title: (p) => `画面操作を記録するサービスに送っています（${p.services}）`,
    detail: () =>
      "セッションリプレイ（画面録画）のサービスは、マウスの動き、クリック、入力内容を記録して送ることがあります。多くは入力欄を伏せますが、設定次第です。フォームに個人情報を入れる前に、プライバシーポリシーを確かめてください。",
  },
  dest_monitoring: {
    title: (p) => `エラー・動作ログの監視サービスを使っています（${p.services}）`,
    detail: () =>
      "エラー監視やログ収集のサービスには、閲覧中のURLや操作の記録がエラー情報と一緒に送られることがあります。自社のサーバーで動かしている場合もあります。",
  },
  dest_advertising: {
    title: (p) => `広告サービスを使っています（${p.services}）`,
    detail: () => "広告やリターゲティングのサービスには閲覧情報が送られ、ほかのサイトをまたいで閲覧履歴がつなげられることがあります。",
  },
  dest_analytics: {
    title: (p) => `アクセス解析を使っています（${p.services}）`,
    detail: () => "閲覧したページや操作の統計は、多くの場合、解析サービスに送られます。解析ツールを自社のサーバーで動かしている場合もあります。",
  },
  dest_marketing: {
    title: (p) => `マーケティング・顧客データのサービスを使っています（${p.services}）`,
    detail: () => "メール配信、顧客データ基盤、A/B テストなどのサービスに、閲覧や属性の情報が送られることがあります。",
  },
  auth_services: {
    title: (p) => `ログインに外部の認証サービスを使っています（${p.services}）`,
    detail: () =>
      "パスワードなどのログイン情報は、このサービスが預かっている可能性があります。どのサービスに何が渡るかは、ログイン画面やプライバシーポリシーで確かめてください。",
  },
  checkout_self_hosted: {
    title: (p) => `ショップは自社で設置するECソフトです（${p.platforms}）`,
    detail: () => "ECソフトと追加プラグインの更新は運営者の責任です。古いまま放置されると、決済画面の改ざんなどに使われることがあります。",
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
  csp_any_script_host: {
    title: () => "CSPがスクリプトの読み込み元を制限していません",
    detail: () => "* や https:、data: などにより、任意のサイトや data: URL からスクリプトを読み込めます。",
  },
  no_nosniff: { title: () => "X-Content-Type-Options がありません", detail: () => "ファイル種別の誤判定を防ぐ nosniff が設定されていません。" },
  no_clickjacking: { title: () => "クリックジャッキング対策がありません", detail: () => "X-Frame-Options も CSP の frame-ancestors もありません。" },
  password_other_site: {
    title: (p) => `パスワードが別の組織らしいドメインに送られます（${p.hosts}）`,
    detail: () =>
      "このページのログインフォームは、サイトとは別の組織に見えるドメインにパスワードを送ります。知られたログインサービスは除いています。フィッシングか、フォームの設定の誤りかもしれません。見慣れないドメインなら入力しないでください。",
  },
  card_page_third_party: {
    title: (p) => `カード番号を入力するページで、別のドメインのスクリプトが動いています（${p.count}か所）`,
    detail: () =>
      "カード番号はこのページ自身の入力欄に入力します。そのため、ここで動く別ドメインのスクリプトからも読み取れます。カード情報を盗む攻撃は、タグマネージャーや解析タグのような一般的なスクリプトの改ざんを入口にすることもあるため、ここでは有名なツールも数えています。根拠には種類（不明・広告・解析など）を付けています。自社の配信用ドメインの場合もあります。決済会社の入力画面（iframe）なら、ほかのスクリプトからは読めません。",
  },
  login_page_third_party: {
    title: (p) => `パスワードを入力するページで、別のドメインのスクリプトが動いています（${p.count}か所）`,
    detail: () =>
      "パスワードはこのページ自身の入力欄に入力するので、ここで動く別ドメインのスクリプトからも読み取れます。ロボット対策（reCAPTCHA など）とログインサービスは数えていません。解析・タグマネージャー・エラー監視だけなら「情報」、画面操作の記録（セッションリプレイ）や広告、正体の分からないドメインがあれば「軽微」にしています。自社の配信用ドメインの場合もあります。",
  },
  script_compromised_host: {
    title: (p) => `乗っ取られたことのある配信元のスクリプトを読み込もうとしています（${p.domains}）`,
    detail: () =>
      "この配信元は、利用しているサイトに悪意のあるコードを配ったことが報告されています。すでに止まっている配信元もありますが、読み込まれればページ上の入力内容をすべて読めます。カード番号やパスワードは入力しないでください。サイトの運営者に知らせてください。",
  },
  third_party_scripts: {
    title: (p) => `外部のスクリプトを読み込んでいます（${p.hosts}ドメイン, ${p.count}件）`,
    detail: () => "外部スクリプトはページ上の入力内容をすべて読み取れます。広告・解析タグなど多くは一般的なものです。",
  },
  no_sri: { title: (p) => `改ざん検知（SRI）のない外部スクリプト: ${p.count}件`, detail: () => "配信元が改ざんされた場合に検知できません。" },
};

/** @type {Record<string, Message>} */
const EN = {
  backend_related: {
    title: (p) => `Other systems that look like the same organisation's: ${p.hosts}`,
    detail: () =>
      "The page's HTML, forms, API calls or own scripts name URLs on other hosts that look like the same organisation's. The evidence lists what their URL shapes suggest. These are separate from this page's own backend, and the guess rests on URL shapes and domain names alone.",
  },
  backend_hosting: {
    title: (p) => `This page is served from ${p.name}`,
    detail: (p) =>
      `${p.name} serves the page itself (confidence: ${confidenceLabel(Number(p.confidence))}, ${p.confidence}). A CDN often sits in front, and the APIs holding products, accounts or orders often run elsewhere, so the site's backend as a whole is not necessarily ${p.name}.`,
  },
  backend_managed: {
    title: (p) => `Backend runs on a managed service: ${p.name}`,
    detail: (p) =>
      `${p.name} (${p.language}) appears to run the backend (confidence: ${confidenceLabel(Number(p.confidence))}, ${p.confidence}). Patching servers and frameworks is the provider's job; access rules and auth settings are still the site's, and cannot be judged from this page.`,
  },
  wp_core_eol: {
    title: (p) => `WordPress without security updates: ${p.version}`,
    detail: (p) =>
      `WordPress below 4.7 has received no security fixes since ${p.date}. Only the latest ${p.series} series (${p.latest}) is officially supported.`,
  },
  wp_core_outdated: {
    title: (p) => `Outdated WordPress: ${p.version}`,
    detail: (p) => `Only the latest ${p.series} series (${p.latest}) is officially supported; security fixes for older series are not guaranteed.`,
  },
  wp_version_exposed: {
    title: (p) => `WordPress version exposed: ${p.version}`,
    detail: (p) => `Readable from the ${p.source}. An old version helps attackers pick a target.`,
  },
  wp_xmlrpc: {
    title: () => "WordPress XML-RPC is enabled",
    detail: () => "xmlrpc.php is a common entry point for password brute force and pingback abuse; disable it if unused.",
  },
  wp_components: {
    title: (p) => `WordPress plugins: ${p.plugins}, themes: ${p.themes}`,
    detail: () =>
      "Most WordPress compromises come through plugins. The links below show known vulnerabilities for each (a ?ver= value is not always the plugin's own version).",
  },
  backend_eol: {
    title: (p) => `Backend likely past end of life: ${p.name}`,
    detail: (p) =>
      `${p.name} (${p.language}) reached end of support on ${p.date}. Inferred from the traces below (confidence: ${confidenceLabel(Number(p.confidence))}, ${p.confidence}). An abandoned framework keeps its unpatched vulnerabilities.`,
  },
  backend_legacy: {
    title: (p) => `Backend likely an old generation: ${p.name}`,
    detail: (p) =>
      `${p.name} (${p.language}) is an older technology that is often left running without updates. Inferred from the traces below (confidence: ${confidenceLabel(Number(p.confidence))}, ${p.confidence}).`,
  },
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
  checkout_saas: {
    title: (p) => `The shop is on a hosted cart service (${p.platforms})`,
    detail: () => "A cart service provides the shop, and usually its checkout as well; check how the card is entered on the checkout page itself.",
  },
  dest_session_replay: {
    title: (p) => `Sends what you do on the page to a session-recording service (${p.services})`,
    detail: () =>
      "Session replay services can record mouse movement, clicks and what you type, and send it to the service. Most mask input fields, but that depends on the site's settings; check the privacy policy before entering personal details.",
  },
  dest_monitoring: {
    title: (p) => `Uses error and activity monitoring (${p.services})`,
    detail: () =>
      "Error and log monitoring services can receive the URL you are on and a trail of what you did along with each error. Some sites run the monitoring on their own servers.",
  },
  dest_advertising: {
    title: (p) => `Uses advertising services (${p.services})`,
    detail: () => "Advertising and retargeting services receive browsing data and can link what you view here with what you view on other sites.",
  },
  dest_analytics: {
    title: (p) => `Uses analytics (${p.services})`,
    detail: () => "Statistics about the pages you view and what you do usually go to an analytics service; some sites run the analytics on their own servers.",
  },
  dest_marketing: {
    title: (p) => `Uses marketing and customer-data services (${p.services})`,
    detail: () => "Email marketing, customer data platforms and A/B testing services can receive what you view and who you are.",
  },
  auth_services: {
    title: (p) => `Login uses an external identity service (${p.services})`,
    detail: () =>
      "Your login details, such as a password, may be held by this service rather than the site. Check the login page and the privacy policy for what goes where.",
  },
  checkout_self_hosted: {
    title: (p) => `The shop is software the site runs itself (${p.platforms})`,
    detail: () => "Keeping the software and its plugins up to date is the site's job; neglected installs are a common way checkout pages get tampered with.",
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
  csp_any_script_host: {
    title: () => "CSP does not limit where scripts load from",
    detail: () => "A source such as *, https: or data: lets scripts load from any site or from data: URLs.",
  },
  no_nosniff: { title: () => "No X-Content-Type-Options", detail: () => "nosniff is not set." },
  no_clickjacking: { title: () => "No clickjacking protection", detail: () => "Neither X-Frame-Options nor CSP frame-ancestors is set." },
  password_other_site: {
    title: (p) => `Your password would be sent to another organisation's domain (${p.hosts})`,
    detail: () =>
      "This login form sends the password to a domain that does not look like the site's own. Known sign-in services are left out. It may be phishing or a misconfigured form; if you do not recognise the domain, do not enter your password.",
  },
  card_page_third_party: {
    title: (p) => `Scripts from other domains run where you type your card number (${p.count} hosts)`,
    detail: () =>
      "The card number goes into this page's own fields, so scripts from other domains running here can read it too. Card skimming has come in through ordinary tag managers and analytics tags, so well-known tools count here as well; each host is labelled (other, ads, analytics …). Some may be the site's own asset domains. A payment provider's card frame would keep them all out.",
  },
  login_page_third_party: {
    title: (p) => `Scripts from other domains run where you type your password (${p.count} hosts)`,
    detail: () =>
      "The password goes into this page's own field, so scripts from other domains running here can read it too. Bot checks (reCAPTCHA …) and sign-in services are not counted. Analytics, tag managers and monitoring alone make this information; session replay, ads or unknown hosts make it low. Some may be the site's own asset domains.",
  },
  script_compromised_host: {
    title: (p) => `Tries to load scripts from a CDN that has been taken over (${p.domains})`,
    detail: () =>
      "This CDN has been reported serving malicious code to the sites that use it. Some such domains no longer serve anything, but a script that does load can read everything typed on the page. Do not enter card numbers or passwords, and let the site know.",
  },
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
    destinations: "データの送信先",
    technologies: "使われている技術",
    none: "なし",
    evidence: "根拠",
    unsupported: "このページは調べられません（http/httpsのページで開いてください）。",
    failed: "調査に失敗しました: ",
    footer: "解析はすべてこのブラウザ内で行われ、SafePeekが自分から外部へ送ることはありません。",
    data: "データ",
    backend: "バックエンド（推定）",
    backend_note: "サーバー側の技術は直接は見えません。ページに残った痕跡から推定しています。",
    confidence: "確度",
    conf_high: "高",
    conf_medium: "中",
    conf_low: "低",
    strength: "痕跡の強さ",
    str_strong: "強",
    str_medium: "中",
    str_weak: "弱",
    status_eol: "サポート終了",
    status_legacy: "旧世代",
    status_managed: "マネージド",
    status_hosting: "配信元",
    implied_by: "推定: {name} から",
    copy_report: "推定結果をコピー",
    copied: "コピーしました",
    report_link: "推定の誤りや新しい痕跡を報告",
    report_false: "誤判定を報告",
    report_false_tech: "検出の誤りを報告",
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
    destinations: "Where data goes",
    technologies: "Technologies",
    none: "None",
    evidence: "Evidence",
    unsupported: "This page cannot be inspected (open an http/https page).",
    failed: "Scan failed: ",
    footer: "Everything is analysed inside this browser. SafePeek sends nothing on its own.",
    data: "Data",
    backend: "Backend (inferred)",
    backend_note: "Server-side technology is not directly visible; this is inferred from traces left in the page.",
    confidence: "Confidence",
    conf_high: "high",
    conf_medium: "medium",
    conf_low: "low",
    strength: "Trace strength",
    str_strong: "strong",
    str_medium: "medium",
    str_weak: "weak",
    status_eol: "End of life",
    status_legacy: "Old generation",
    status_managed: "Managed",
    status_hosting: "Hosting",
    implied_by: "implied by {name}",
    copy_report: "Copy the inference",
    copied: "Copied",
    report_link: "Report a wrong guess or a new trace",
    report_false: "Report a false result",
    report_false_tech: "Report a wrong detection",
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
 * @param {number} confidence  0-100
 * @returns {string}
 */
export function confidenceLabel(confidence) {
  if (confidence >= 80) return t("conf_high");
  if (confidence >= 50) return t("conf_medium");
  return t("conf_low");
}

/**
 * @param {number} weight  0-100
 * @returns {string}
 */
export function strengthLabel(weight) {
  if (weight >= 70) return t("str_strong");
  if (weight >= 40) return t("str_medium");
  return t("str_weak");
}

/**
 * @param {import("../src/types.js").BackendSignal} signal
 * @returns {string}
 */
export function signalNote(signal) {
  return language() === "ja" ? signal.noteJa : signal.note;
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
