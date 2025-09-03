# HmMarkdownSimpleServerの潜在的な問題点

このドキュメントは、`HmMarkdownSimpleServer` プロジェクトのコードベースを静的に分析した結果、発見された潜在的な問題点や改善点をまとめたものです。

---

## 1. 重大な脆弱性 (Critical Vulnerability)

### ローカルHTTPサーバーにおける任意のコード実行の脆弱性

リアルタイムプレビュー機能を提供する `HmMarkdownListeningServer.dll` 内のHTTPサーバーに、深刻なセキュリティ脆弱性が存在します。

- **問題点**:
  - サーバーは `http://localhost:{port}/` でリクエストを待ち受けます。
  - `/gettotaltext` 以外のパスへのリクエストは、そのパス文字列をデコードし、ローカルコンピュータ上のファイルやURLとして直接起動しようとします (`DefaultBrowserLauncher.Launch`)。
  - `Access-Control-Allow-Origin: *` ヘッダが設定されているため、悪意のあるWebサイトからこのサーバーに対してリクエストを送信することが可能です。

- **具体的な脅威**:
  攻撃者が用意したWebページをユーザーが閲覧するだけで、ユーザーのPC上で任意のプログラム（例: `C:\Windows\System32\calc.exe` など）を実行させられる可能性があります。これは非常に危険な脆弱性です。

- **該当箇所**:
  - `src/HmMarkdownSimpleServer/HmMarkdownListeningServer.cs`

---

## 2. ライブラリと依存関係 (Libraries and Dependencies)

### 2.1. Markdigライブラリのバージョンが古い

- **問題点**:
  Markdownのパースに使用している `Markdig` ライブラリのバージョンが `0.18.1` (2019年リリース) と非常に古いです。現在の最新版は `0.41.3` (2024年リリース) であり、メジャーバージョンが大きく異なります。
- **影響**:
  - 最新のGFM (GitHub Flavored Markdown) の仕様に追従できていない可能性があります。
  - パフォーマンスの改善、バグ修正、セキュリティ修正の恩恵を受けられません。
  - 新しい拡張機能（ डायアグラム、数式サポートの改善など）が利用できません。
- **該当箇所**:
  - `src/HmMarkdownSimpleServer/packages.config`

### 2.2. MathJaxのURLがハードコードされている

- **問題点**:
  数式表示ライブラリであるMathJaxを、特定のバージョンのCDN URL (`https://cdn.jsdelivr.net/npm/mathjax@3.2.2/...`) でハードコードして読み込んでいます。
- **影響**:
  - ユーザーがオフライン環境の場合、数式が表示されません。
  - CDNサービスで障害が発生した場合や、URLが変更された場合に機能しなくなります。
  - ライブラリをプロジェクトに同梱するか、URLを設定可能にすることが望ましいです。
- **該当箇所**:
  - `src/HmMarkdownSimpleServer/HmMarkdownSimpleServer.cs`

---

## 3. コード品質と設計の問題 (Code Quality and Design Issues)

### 3.1. 不適切なエラーハンドリング

- **問題点**:
  コード全体の多くの場所で `try { ... } catch (Exception) {}` のように、発生した例外を握りつぶす（無視する）実装が見られます。
- **影響**:
  - 問題が発生してもエラーが表面化せず、デバッグが非常に困難になります。
  - 予期せぬ動作の原因となり、アプリケーションが不安定になる可能性があります。
- **該当箇所**:
  - `HmMarkdownSimpleServer.cs`, `HmMarkdownListeningServer.cs` など、プロジェクト全体。

### 3.2. コードの重複

- **問題点**:
  `HmMarkdownSimpleServer.cs`（保存時の処理）と `HmMarkdownListeningServer.cs`（リアルタイムプレビューの処理）の両方で、それぞれ `Markdig` の変換パイプラインを生成するロジックが重複して記述されています。
- **影響**:
  - Markdownの変換設定を変更する際に、複数の箇所を修正する必要があり、修正漏れのリスクがあります。
  - 保守性が低下します。
- **該当箇所**:
  - `CreateTempFile` メソッド (`HmMarkdownSimpleServer.cs`)
  - `GetTotalText` メソッド (`HmMarkdownListeningServer.cs`)

### 3.3. 非効率な非同期処理

- **問題点**:
  `HmMarkdownSimpleServer.cs` 内の `TickMethodAsync` は、約450msごとに秀丸エディタの状態をポーリング（定期監視）しており、CPUリソースを非効率に消費します。
- **影響**:
  - 常駐するコンポーネントとして、パフォーマンスへの影響が懸念されます。
  - `FileSystemWatcher` を利用しているにもかかわらず、ファイル切り替えの検知のためにポーリングループが存在しており、設計が複雑化しています。
- **該当箇所**:
  - `TickMethodAsync` メソッド (`HmMarkdownSimpleServer.cs`)

---

## 4. 保守性の問題 (Maintainability Issues)

### 4.1. マジックストリングの使用

- **問題点**:
  HTMLテンプレートの組み立てに、`$CSS_URI_ABSOLUTE` のような文字列（マジックストリング）を `String.Replace` で置換する手法が使われています。
- **影響**:
  - テンプレートの構造が分かりにくく、変更が容易ではありません。
  - タイプミスなど、単純なミスがバグの原因となりやすいです。
  - より安全なテンプレートエンジンの利用が推奨されます。
- **該当箇所**:
  - `CreateTempFile` メソッド (`HmMarkdownSimpleServer.cs`)

### 4.2. 秀丸エディタとの密結合

- **問題点**:
  コードの多くの部分が `Hm.Macro.Var` や `Hm.Edit.TotalText` といった秀丸エディタのマクロ機能に直接依存しています。
- **影響**:
  - コードの再利用性や、単体テストの作成が非常に困難です。
  - 秀丸エディタの仕様変更に弱い作りになっています。
- **該当箇所**:
  - プロジェクト全体、特に `HmMarkdownSimpleServer.cs`。
