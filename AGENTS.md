# sharing-view

Arknights オペレーター育成状況の共有ビュー（静的サイト）。`?d=<ID>` で共有データを取得し、
マスターデータの全オペレーターを表にする。

## Architecture

- 実行形態: ビルド無しの静的サイト。クラシックスクリプト（`<script src>`）のみで、
  モジュールシステム・バンドラ・`package.json` は無い。
- データ源は2つとも外部: マスターは `https://data.memoria-ll.link/arknights-data/operator_master_data_shareview.json`、
  共有データは `sharing-backend` の `getCharacterDataHttp`。
- レイヤ境界: `scripts/masterData.js` = DOM を参照しない純粋ロジック、
  `scripts/main.js` = DOM 生成とイベント配線、`scripts/api.js` = fetch。
  ブラウザ/Node 両対応は `masterData.js` 末尾の `typeof module !== 'undefined'` ガードのみで行う。

### テスト seam mapping

| 項目 | 値 |
|---|---|
| ロジック単位（テスト必須） | `scripts/masterData.js` |
| view glue（テスト対象外） | `scripts/main.js` の DOM 生成・イベント配線、`index.html`、`scripts/api.js` |
| テスト置き場 | `test-dir/`（フィクスチャは `test-dir/fixtures/`） |
| ゲート | `frontend/` で `node --test`（引数なし） |

## Ledger

### Traps

- マスター生 JSON を `Object.keys()` すると `["modules","operators"]` を返す。オペレーター辞書は `masterData.operators`。誤るとエラーにならず 423 行が名前 Unknown の 2 行に化ける。
- クラシックスクリプトで同じ `const` を 2 ファイルに宣言すると `SyntaxError: Identifier ... has already been declared` で `main.js` 全体が実行されず白画面になる。関数/定数を別ファイルへ移すときは移動元の削除を必ず確認する。
- `?d=` が無いとき `displayOperators` は一度も呼ばれず `<tbody>` は空。「マスター全件表示」は共有 URL を開いたときの挙動であって、素の表示ではない。
- 非所持セルの判定を「共有データにキーが無い」で行うと誤る。判定の正はマスターの per-operator `modules`。旧共有データの `RE10` はマスター上 B を所持しているので `-` ではなく `0`。
- `scripts/masterData.js` は DOM を参照しないこと。Node の単体テストが require するため、`document` / `window` に触れた時点でテストから到達できなくなる。
- `renderModuleHeaders` は冪等（`th[data-module-id]` を除去してから追加）にし、`displayOperators` からは呼ばない。言語ラジオ切替で再描画が走るので、呼ぶと切替のたびに列が増える。
- `node --test test-dir/` は Node 24 でディレクトリを require しようとして exit 1 で失敗する。引数なしの `node --test` を使う。

### Invariants / identity keys

- 列順の正はマスターの**トップレベル `modules` 配列**。per-operator の `modules` は所持しているものだけを列挙した dict（値は `true` のみ、実測 487 件、`false` は 0 件）であり、**列順の情報源ではない**。実データでは全 423 件の per-operator キー順がトップレベル順の部分列になっている（部分列でないものは 0 件）が、これに依存しないこと。
- 所持判定は `=== true` の厳密比較。`hasOwnProperty` で判定すると将来 `false` が入ったときに所持扱いになる。
- マスターに存在するが所持 0 個（`modules` が空 dict）と、マスターに存在しないコードは別扱い。前者は全列 `-`、後者は共有データの数値をそのまま出す。
- 保存キー = `module` + マスターの `modules` 配列要素（変換なしで連結）。この規則は backend（別リポジトリ `sharing-backend`）と2箇所に二重に存在し、共有できない。
- `DEFAULT_OPERATOR_VALUES` の `potential: 0` と `skill: 1` は、backend の許容範囲（1〜6）/既定値（7）とは別の**表示規約**（共有データに無いオペレーター用。`915d100` の意図）。backend に合わせて直さないこと。
- マスター実測値（2026-07-30 時点、423 オペレーター / モジュール 5 種）: 所持数 X=285 / Y=177 / D=6 / A=18 / B=1、モジュール 0 個のオペレーター 44 件、`-` セル 1628 / 数値セル 487（合計 2115 = 423×5）。

### Looks reusable but isn't

- `styles/main.css` の `#operators-table .subheader th` は `index.html` に `subheader` クラスが無く死んでいる。

### Environment quirks

- `package.json` は無い。無いままで `node --test` は CommonJS の `require` を使うテストを実行できる。
- `th` / `td` に幅指定と `table-layout: fixed` が無く、`.table-container` が `overflow-x: auto`。列が増えても CSS 変更は不要。
