# SafePeek

**そのサイトが何でできていて、カード情報をどう扱っているかをのぞき見る拡張機能**

[English](README.md)

見ているページでアイコンを押すと、次のことが分かります。

1. **使われている技術**：CMS、フレームワーク、Webサーバー、言語ランタイム（見える場合はバージョンも）
2. **古い・脆弱なソフトウェア**：既知の脆弱性（CVE）があるJavaScriptライブラリと、サポートが終了したサーバー／フロントエンドのソフトウェア（PHP 7、Apache 2.2、AngularJS、Vue 2、jQuery 1.x など）
3. **カード決済の方式**：カード番号を入力する場所が次のどれかを判定します
   - 決済会社の画面（iframe）の中（Stripe、PayPal、Adyen など）
   - サイト自身のページで、ブラウザ内でトークン化する方式（GMO-PG、PAY.JP v1 など）
   - サイト自身のフォームにそのまま入力する方式
4. **基本的なセキュリティ**：HTTPS、HSTS、CSP、クリックジャッキング対策、サーバーバージョンの露出、JavaScriptから読めるセッションCookie、混在コンテンツ、外部スクリプト

すべての指摘に根拠（どのヘッダー・スクリプト・入力欄から判断したか）を表示するので、自分で確かめられます。

## 安全性についての方針

他のサイトの安全性を調べる道具なので、SafePeek自身が信頼できることを最優先にしています。

- **外部には何も送信しません。** 解析はすべてブラウザ内で行います。拡張機能のページは `connect-src 'self'` で通信先を自分自身に限定しています。
- **権限は `activeTab` と `scripting` の2つだけ**です。アイコンを押したときに、そのタブだけを読みます。詳しくは [docs/permissions.md](docs/permissions.md) を参照してください。
- **リモートコードなし、evalなし、ビルド工程なし。** `extension/` にあるファイルがそのままブラウザで動きます。
- **配布はGitHubのリリースのみ**（zipとSHA-256）です。ストアを使わないので、知らないうちに自動更新されることはありません。
- これらの約束はCIのテスト（[`test/policy.test.js`](test/policy.test.js)）で強制しています。

通信が発生するのは次の2つだけです。どちらも、そのページ自身が使っているサーバーへのアクセスです。
- レスポンスヘッダーを読むために、表示中のページを再リクエストする
- ライブラリのバージョンを読むために、ページが読み込み済みのスクリプトを再取得する（可能な限りブラウザのキャッシュから）

## インストール（Chrome / Edge / Brave）

1. [Releases](https://github.com/isamu/SafePeek/releases) から `safepeek-vX.Y.Z.zip` をダウンロードし、SHA-256を確認します（またはこのリポジトリをclone）。
2. 解凍して `chrome://extensions` を開き、**デベロッパーモード**をオンにします。
3. **パッケージ化されていない拡張機能を読み込む** から、解凍したフォルダ（cloneした場合は `extension/`）を選びます。

更新は手動です。新しいリリースをダウンロードして読み込み直してください。Firefox対応は予定しています。

## 限界

ブラウザから見える情報だけで推定しています。そのため次のような限界があります。
- きちんと運用されているサイトほどサーバー情報を隠しています。
- OSベンダーが古いバージョン番号のまま修正を取り込んでいることがあります。
- 決済画面は今見ているページとは別のことがあります。

「大きな問題は見つかりませんでした」は安全の保証ではありません。

## データの出典

| データ | 出典 | ライセンス |
| --- | --- | --- |
| 技術の検出ルール | [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) | GPL-3.0 |
| 脆弱なJSライブラリ | [RetireJS/retire.js](https://github.com/RetireJS/retire.js) | Apache-2.0 |
| サポート終了日、決済会社の一覧 | このリポジトリで管理 | GPL-3.0 |

取り込んだ上流のコミットは [`extension/data/sources.json`](extension/data/sources.json) に記録しています。週に1回、自動でプルリクエストを作って更新します。

## 開発

```
yarn install
yarn format:check   # prettier
yarn lint           # eslint
yarn typecheck      # tsc --checkJs（JSDocで型チェック）
yarn test           # 単体テスト・ポリシーテスト
yarn test:e2e       # 実際のChromiumで収集処理を確認（先に yarn playwright install chromium）
yarn update-data    # extension/data を上流から更新
```

設計とルールは [docs/SPEC.md](docs/SPEC.md) にまとめています。

## ライセンス

GPL-3.0-or-later（[LICENSE](LICENSE)）
