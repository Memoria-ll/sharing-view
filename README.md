# Arknights Shared Viewer

アークナイツのオペレーター育成状況を、共有URLから一覧で確認するためのページです。

手元の管理データを持っていない相手にも、昇進・レベル・潜在・スキル・特化・モジュールの育成状況をひとつのURLで伝えられます。育成状況を見せ合うときや、育成方針を相談するときに、オペレーターごとの情報を同じ画面で見比べられることを目的としています。

## このページでできること

- 共有された育成状況をオペレーター一覧で確認
- 職業・職分・レアリティ・陣営・実装日・所持状況などで絞り込み
- 各列を使った並べ替え
- オペレーター名や項目名を日本語・英語・中国語で表示
- 共有URLのコピーとXへの投稿

共有データは、URLの `?d=<共有ID>` から読み込まれます。

## 外部アプリからAPIを使う

このビューと同じ公開育成データを、自分のアプリやツールから取得できます。
ベースURLは **`https://api.memoria-ll.link`**。JSON（UTF-8）で応答し、Cookieは不要です。
公開データの取得にAPIキーやownerKeyは必要ありません。

- [公開データの取得](#api-read)
- [レスポンスの項目](#api-fields)
- [エンドポイント一覧](#api-endpoints)
- [新規作成・更新と本人用データ](#api-write)
- [制限・エラー](#api-limits)
- [ブラウザから使う場合のCORS](#api-cors)

<a id="api-read"></a>

### 公開データの取得

共有URL `https://sharing-view.memoria-ll.link/?d=<共有ID>` の `d` が共有IDです。
`YOUR_PUBLIC_ID` を実際の共有IDに置き換えて実行してください。例中のIDやデータは説明用です。

```sh
curl --fail-with-body --max-time 15 "https://api.memoria-ll.link/v2/public/YOUR_PUBLIC_ID/operators"
```

Windows PowerShellでは、上の `curl` を `curl.exe` としてください。

JavaScriptの例（Node.js 22以降など、`fetch` と `AbortSignal.timeout` が使える環境）:

```javascript
const publicId = 'YOUR_PUBLIC_ID';
const response = await fetch(
  `https://api.memoria-ll.link/v2/public/${encodeURIComponent(publicId)}/operators`,
  { credentials: 'omit', signal: AbortSignal.timeout(15000) }
);
if (!response.ok) throw new Error(`API error: ${response.status}`);
const { characters } = await response.json();
console.log(characters);
```

別のWebサイト上で実行する場合も利用できます。本人用データの取得・更新には、後述の[ownerKeyによる認証](#api-write)が必要です。

新規の共有IDは大文字・小文字を区別する英数字11文字です。旧形式の6文字・10文字IDも公開取得に使えます。
IDを指定するAPIのみで、共有IDの全件一覧・検索APIはありません。公開データは共有IDを知っている人が取得できます。

成功時（HTTP 200）の例:

```json
{
  "characters": [
    {
      "code": "LM04",
      "potential": 6,
      "elite": 2,
      "level": 90,
      "skill": 7,
      "skill1": 3,
      "skill2": 0,
      "skill3": 0,
      "moduleX": 3
    }
  ]
}
```

`characters` は空配列になることもあります。公開レスポンスには目標・メモ・素材在庫・ownerKey・本人用snapshotを含みません。

<a id="api-fields"></a>

### レスポンスの項目

| 項目 | 型・範囲 | 内容 |
|---|---|---|
| `code` | 文字列 | オペレーターコード。英数字・`_`・`-`、1〜10文字 |
| `potential` | 整数 1〜6 | 潜在 |
| `elite` | 整数 0〜2 | 昇進段階 |
| `level` | 整数 1〜90 | レベル |
| `skill` | 整数 1〜7 | 共通スキルレベル |
| `skill1` / `skill2` / `skill3` | 整数 0〜3 | 各スキルの特化段階 |
| `moduleX` など | 整数 0〜3、省略可 | モジュール段階。キーは `module` + 英大文字・数字1〜4文字 |

表示名・職業・レアリティ・モジュールの所持可否などは、このレスポンスには含まれません。
このビューは[マスターデータのmanifest](https://data.memoria-ll.link/arknights-data/master/manifest.json)から対応するマスターを取得して表示します。
モジュールの項目や種類を固定せず、オペレーターが持つモジュールはマスターを参照してください。共有データにキーがないことと、そのモジュールを持たないことは別です。

<a id="api-endpoints"></a>

### エンドポイント一覧

以下のパスにはベースURLを付けてください。`{publicId}` は共有IDに置き換えます。

| 用途 | メソッド・パス | 認証 | 成功レスポンス |
|---|---|---|---|
| 公開育成データの取得 | `GET /v2/public/{publicId}/operators` | 不要 | 200 `{characters:[...]}` |
| 公開取得の互換入口 | `GET /getCharacterDataHttp?id={publicId}` | 不要 | 上と同じ |
| 新規共有の作成 | `POST /v2/shares` | 不要・作成回数制限あり | 201 `{publicId, revision, ownerKey}` |
| 共有データの更新 | `PUT /v2/shares/{publicId}` | ownerKey | 200 `{publicId, revision}` |
| 本人用データの取得 | `GET /v2/private/{publicId}/snapshot` | ownerKey | 200 `{publicId, revision, snapshot}` |
| 稼働確認 | `GET /health` | 不要 | 200 `{"status":"ok","version":2}` |

旧形式の6文字・10文字IDは公開取得のみ対応します。更新・本人用データ取得は11文字IDが対象です。
互換入口の `id` を除き、APIにクエリパラメーターを付けないでください。

<a id="api-write"></a>

### 新規作成・更新と本人用データ

公開データを読むだけなら、この節の実装は不要です。
作成・更新を行うクライアントは、公開用の `publicData` と本人用の `snapshot` を両方送ります。
サーバーがsnapshotから公開データを自動生成することはありません。

新規作成の最小リクエスト例を `share.json` として保存します。これは公開・本人用データが空の**新規作成用**の例です。

```json
{
  "publicData": { "characters": [] },
  "snapshot": {
    "schemaVersion": 1,
    "operators": { "schemaVersion": 4, "userFields": [], "operators": {} },
    "materials": {
      "schemaVersion": 1,
      "inventory": { "baseOwned": {}, "processingRatios": {} },
      "materialPlans": { "enabled": false, "plans": [] },
      "rewardClaims": {}
    },
    "misc": {
      "schemaVersion": 8,
      "groups": [],
      "settings": { "showChinaInfo": false, "columns": [] },
      "filterPresets": []
    }
  }
}
```

```sh
curl --fail-with-body --max-time 15 -X POST -H "Content-Type: application/json" --data-binary "@share.json" "https://api.memoria-ll.link/v2/shares"
```

作成に成功すると、11文字の `publicId`、`revision: 1`、43文字の `ownerKey` が返ります。
ownerKeyはこの作成応答でのみ発行され、再取得・再発行はできません。安全に保存し、共有URL・クエリ・公開コード・ログには含めないでください。
ownerKeyを失った場合は、手元にあるデータから新しい共有を作成します。

更新と本人用データ取得では、次のHTTPヘッダーを付けます。

```http
Authorization: Bearer {ownerKey}
```

更新は部分更新ではなく、公開データと本人用snapshotの全体置換です。
作成時と同じ構造のbodyに、取得済みの `revision` を `baseRevision` としてトップレベルへ追加して `PUT` します。
既存データの更新に上の空の例を流用しないでください。本人用GETで取得したsnapshotと、保持している公開データを確認・編集して送ります。
publicId・ownerKey・revisionをsnapshotへ混ぜないでください。

- 更新成功時はrevisionが1増え、公開データとsnapshotがまとめて保存されます。
- 他の更新が先に完了すると `409 revision_conflict` になり、そのリクエストでは何も変更しません。
- 409や通信切断で結果が不明な場合は本人用GETで確認し、手元のデータと比較してください。revisionだけを最新に差し替えて自動再送すると、他の変更を上書きします。

snapshotは任意のJSON保管領域ではなく、Operators・Materials・Miscの決まった形式です。
未定義のフィールド、`null`、端末固有設定などは受け付けません。対応フィールドの追加・連携については[Issues](https://github.com/Memoria-ll/sharing-view/issues)へ相談してください。

<a id="api-limits"></a>

### 制限・エラー

現在のAPIの既定上限です。共有サービス全体の利用状況によっても制限されます。

| 対象 | 上限 |
|---|---|
| 全リクエスト | 1分あたり同一IP 120回、サービス全体1,200回 |
| 新規作成 | 上記に加え、1分あたり同一IP 5回、サービス全体60回 |
| ownerKey認証失敗 | 同一IPで1分あたり10回まで。超過は429 |
| リクエストbody | 5 MiB。`Content-Type: application/json` 必須、圧縮body不可 |
| snapshot | JSONのUTF-8表現で4 MiB |
| 公開オペレーター | 最大1,000件、codeの重複不可、モジュールキーは全体で20種類まで |

APIのエラー応答は `{"error":"エラーコード"}` です。

| HTTP | 主なコード | 対応 |
|---|---|---|
| 400 | `invalid_payload` / `invalid_json` / `invalid_id` / `query_not_allowed` | 入力の項目・型・ID・クエリを確認 |
| 401 | `owner_auth_required` | ownerKeyと共有IDの組み合わせを確認 |
| 404 | `not_found` | データがない、または未対応のパス・メソッド・ID形式 |
| 409 | `revision_conflict` | 最新snapshotと手元を比較して更新内容を判断 |
| 413 | `payload_too_large` / `snapshot_too_large` | 送信サイズを削減 |
| 414 | `url_too_long` | URLを短くする |
| 415 | `json_required` / `encoding_not_supported` | JSON形式・Content-Type・圧縮の有無を確認 |
| 429 | `rate_limited` | `Retry-After` 秒待ってから再試行（現在は60秒） |
| 500 | `internal_error` | 書き込みは本人用GETで結果確認。繰り返す場合は報告 |
| 502 | `legacy_unavailable` | 旧形式の共有データ取得に失敗。時間を置いて再試行 |

正常応答も `Cache-Control: no-store` です。共有リンクを開くときや手動更新時など、必要なタイミングで取得してください。
回数制限は認証付きの通信にも適用されます。

<a id="api-cors"></a>

### ブラウザから使う場合のCORS

公開APIは `Access-Control-Allow-Origin: *` を返すため、どのWebサイトからも直接 `fetch` できます。
JSONでの新規作成、ownerKey付きの更新・本人用データ取得に必要なpreflightも受け付けます。
Cookieを使わず、`Access-Control-Allow-Credentials` は返しません。JavaScriptからは `credentials: 'omit'` で呼び出してください。
ownerKeyを持たないサイトが本人用データを読んだり、既存共有を更新したりすることはできません。認証と回数制限は引き続き適用されます。
