# HmMarkdownSimpleServerの潜在的な問題点 (2024-09-13更新)

このドキュメントは、`HmMarkdownSimpleServer` プロジェクトのコードベースを静的に分析した結果、発見された潜在的な問題点や改善点をまとめたものです。

---

## 1. 依存関係の問題 (Libraries and Dependencies)

### 1.1. Markdigライブラリのバージョンが古い

- **問題点**:
  Markdownのパースに使用している `Markdig` ライブラリのバージョンが `0.18.1` (2019年リリース) と非常に古いです。最新版は常に更新されており、メジャーバージョンも大きく異なります。
- **影響**:
  - 最新のGFM (GitHub Flavored Markdown) の仕様に追従できていない可能性があります。
  - パフォーマンスの改善、バグ修正、セキュリティ修正の恩恵を受けられません。
  - 新しい拡張機能（ डायアグラム、数式サポートの改善など）が利用できません。
- **該当箇所**:
  - `src/HmMarkdownSimpleServer/packages.config`

---

## 2. コード品質と設計の問題 (Code Quality and Design Issues)

### 2.1. 不適切なエラーハンドリング

- **問題点**:
  コード全体の多くの場所で `try { ... } catch (Exception) {}` のように、発生した例外を握りつぶす（無視する）実装が見られます。
- **影響**:
  - 問題が発生してもエラーが表面化せず、デバッグが非常に困難になります。
  - 予期せぬ動作の原因となり、アプリケーションが不安定になる可能性があります。
- **該当箇所**:
  - `HmMarkdownSimpleServer.cs`, `HmMarkdownListeningServer.cs` など、プロジェクト全体。

### 2.2. 非効率な非同期処理

- **問題点**:
  `HmMarkdownSimpleServer.cs` 内の `TickMethodAsync` は、約450msごとに秀丸エディタの状態をポーリング（定期監視）しており、CPUリソースを非効率に消費します。
- **影響**:
  - 常駐するコンポーネントとして、パフォーマンスへの影響が懸念されます。
  - `FileSystemWatcher` を利用しているにもかかわらず、ファイル切り替えの検知のためにポーリングループが存在しており、設計が複雑化しています。
- **該当箇所**:
  - `TickMethodAsync` メソッド (`HmMarkdownSimpleServer.cs`)

### 2.3. コードの重複（改善されたが、依然として残存）

- **問題点**:
  `Markdig` の変換パイプラインを生成するロジックは `MarkdownPipelineProvider.cs` に一元化され、以前の重複状態は改善されました。しかし、依然として `HmMarkdownSimpleServer.cs` と `HmMarkdownListeningServer.cs` の両方で、それぞれプロバイダを呼び出すコードが存在しています。
- **影響**:
  - Markdown変換の責務が複数のクラスに分散しており、完全には分離されていません。
  - 今後、変換処理に更なる修正（例えば、前処理や後処理の追加）が必要になった場合、両方のクラスを修正する必要が生じる可能性があります。
- **該当箇所**:
  - `CreateTempFile` メソッド (`HmMarkdownSimpleServer.cs`)
  - `GetTotalText` メソッド (`HmMarkdownListeningServer.cs`)


