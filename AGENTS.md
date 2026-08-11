# sharing-view

Arknights オペレーター育成状況の共有ビュー（静的サイト）。`?d=<ID>` で共有データを取得し、
マスターデータの全オペレーターを表にする。

## Architecture

- 実行形態: ビルド無しの静的サイト。クラシックスクリプト（`<script src>`）のみで、
  モジュールシステム・バンドラ・`package.json` は無い。
- データ源は2つとも外部: マスターは `https://data.memoria-ll.link/arknights-data/master/manifest.json`
  が指す2ファイル（`operator_master_data` = オペレーター、`game_data_master` = モジュール列定義と
  id→表示名テーブル）、共有データは `sharing-backend` の `getCharacterDataHttp`。
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

- operator マスターの生 JSON は `{version, operators}` で、`operators` は**配列**。code で引くには `parseMasterData` が返す `Map`（`master.operators`）を使う。生 JSON を辞書として添字参照すると例外にならず全行が名前 Unknown になる。
- 綴りが3通りある: manifest の files キーは `operator` / `gamedata`（小文字1語）、ファイル名は `game_data_master_*`、中身のトップレベルは `gameData`。取り違えても例外は表に出ず、`fetchMasterData` の catch が空マスタに落として静かに描画する。
- モジュール列 ID の場所は `gameData.module`（**単数形**）。複数形で読むと空配列になり、モジュール列が0本の9列の表が正常に描画される（例外もエラー行も出ない）。
- クラシックスクリプトで同じ `const` を 2 ファイルに宣言すると `SyntaxError: Identifier ... has already been declared` で `main.js` 全体が実行されず白画面になる。関数/定数を別ファイルへ移すときは移動元の削除を必ず確認する。
- `?d=` が無いとき `displayOperators` は一度も呼ばれず `<tbody>` は空。「マスター全件表示」は共有 URL を開いたときの挙動であって、素の表示ではない。
- 非所持セルの判定を「共有データにキーが無い」で行うと誤る。判定の正はマスターの per-operator `modules`。旧共有データの `RE10` はマスター上 B を所持しているので `-` ではなく `0`。
- `scripts/masterData.js` は DOM を参照しないこと。Node の単体テストが require するため、`document` / `window` に触れた時点でテストから到達できなくなる。
- `renderModuleHeaders` は冪等（`th[data-module-id]` を除去してから追加）にし、`displayOperators` からは呼ばない。言語ラジオ切替で再描画が走るので、呼ぶと切替のたびに列が増える。
- `node --test test-dir/` は Node 24 でディレクトリを require しようとして exit 1 で失敗する。引数なしの `node --test` を使う。

### Invariants / identity keys

- 列順の正は `game_data_master` の `gameData.module`。per-operator の `modules` は所持しているモジュールだけをキーに持つ dict で、列順の情報源ではない（実データではキー順が `gameData.module` の部分列になっているが、依存しない）。
- 所持判定は per-operator `modules[id]` が**配列であること**（`Array.isArray`）。値は3段階の昇級コストで、所持していないモジュールはキーごと存在しない。キー存在だけで判定すると、配信側が非所持を `null`/`false`/`[]` で表し始めたときに静かに所持扱いになる。配列判定なら非所持側に倒れ、`-` が増えるので検知できる。
- 行順の正は operator マスターの `operators` 配列の順序。`parseMasterData` は出現順で `Map` に詰め、`buildDisplayRows` はその順で行を作る。プレーンオブジェクトの辞書に移し替えると整数様の code が先頭へ繰り上がり、行順だけが静かに変わる。
- 保存キー = `module` + `gameData.module` の要素（変換なしで連結）。この規則は backend（別リポジトリ `sharing-backend`）と2箇所に二重に存在し、共有できない。
- `test-dir/fixtures/operator_master_data.json` と `test-dir/fixtures/game_data_master.json` は manifest が指す配信ファイルのスナップショット。テストの期待値はこの2ファイルから導出しているので、更新しても件数系のテストは壊れない。壊れるとしたら「所持0件のオペレーターが1件も無くなった」のように条件を満たす代表が消えたときで、そのときは `findOperator` が明示的に失敗する。
- マスターに存在するが所持 0 個（`modules` が空 dict）と、マスターに存在しないコードは別扱い。前者は全列 `-`、後者は共有データの数値をそのまま出す。
- `DEFAULT_OPERATOR_VALUES` の `potential: 0` と `skill: 1` は、backend の許容範囲（1〜6）/既定値（7）とは別の**表示規約**（共有データに無いオペレーター用。`915d100` の意図）。backend に合わせて直さないこと。
- マスターの内容（オペレーター件数・モジュール種別・所持情報）は**揮発値**。件数・所持数・セル数をテストやドキュメントに固定値で書かないこと。期待値はその場でマスターから導出する（`test-dir/masterData.test.js` と `test-dir/manual-checklist-dynamic-modules.md` がその形になっている）。

### Looks reusable but isn't

- `styles/main.css` の `#operators-table .subheader th` は `index.html` に `subheader` クラスが無く死んでいる。
- `test-dir/fixtures/legacy-master-subset.json` は縮退テスト専用の旧 shareview 形サンプル。現行の形ではないので、期待値の導出元に使わない。

### Environment quirks

- `package.json` は無い。無いままで `node --test` は CommonJS の `require` を使うテストを実行できる。
- `th` / `td` に幅指定と `table-layout: fixed` が無く、`.table-container` が `overflow-x: auto`。列が増えても CSS 変更は不要。
