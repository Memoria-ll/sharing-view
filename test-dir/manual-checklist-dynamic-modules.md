# 手動確認チェックリスト（動的モジュール列 / frontend）

自動テスト（`node --test`）で担保できない、実ブラウザでの表示挙動の確認項目。

期待値はマスターの内容（オペレーター件数・モジュール種別・所持情報）に依存し、マスターは随時
更新される。**固定値を書かず、確認時点で配信中のマスターから計算して照合する。**

## 手順が単純なもの

| # | 手順 | 期待結果 |
|---|---|---|
| V2 | `?d=` なしで開き、`#operators-body tr` の数を数える | 0（`?d=` が無いと `displayOperators` は呼ばれない。全件表示は共有URLを開いたときの挙動） |
| V9 | 取得失敗時（`?d=` に存在しないIDを指定）のエラー行の `colSpan` | `#operators-head-row` の `<th>` 数と一致 |
| V10 | 言語ラジオを3回切り替えたあとの `<th>` 数 | 切り替え前と同じ（増えない） |

## マスターから期待値を計算して照合する（V1・V3〜V8）

`?d=<既存の共有ドキュメントID>` を開いた状態で、DevTools コンソールに貼る:

```js
const manifestUrl = 'https://data.memoria-ll.link/arknights-data/master/manifest.json';
const manifest = await (await fetch(manifestUrl)).json();
const [operator, gameData] = await Promise.all([
  fetch(manifest.files.operator.path).then(response => response.json()),
  fetch(manifest.files.gamedata.path).then(response => response.json()),
]);
const ids = gameData.gameData.module;
const ops = Object.fromEntries(operator.operators.map(o => [o.code, o]));
const STATIC = 9;  // 非モジュール列（Code〜S3 Mastery）

const head = [...document.querySelectorAll('#operators-head-row th')].map(th => th.textContent);
const rows = [...document.querySelectorAll('#operators-body tr')];
const codeOf = tr => tr.children[0].textContent;
const moduleCells = tr => [...tr.children].slice(STATIC).map(td => td.textContent);
const ownedOf = code => ids.filter(id => Array.isArray(ops[code].modules[id]));

const check = (name, actual, expected) =>
  console.log(`${actual === expected ? 'PASS' : 'FAIL'}  ${name}: ${actual}  期待 ${expected}`);

// V1: 列数とモジュール列ラベル
check('列数', head.length, STATIC + ids.length);
check('モジュール列ラベル', head.slice(STATIC).join(','), ids.map(id => 'Module ' + id).join(','));

// V3: 行数（マスター全件 + 共有データにしか無いコード）
const masterRows = rows.filter(tr => Object.hasOwn(ops, codeOf(tr)));
console.log(`行数 ${rows.length}（マスター由来 ${masterRows.length} / マスター外 ${rows.length - masterRows.length}）`);
check('マスター由来の行数', masterRows.length, Object.keys(ops).length);

// V4/V5: 非所持セルと数値セルの総数（マスター由来の行のみ）
const cells = masterRows.flatMap(moduleCells);
const dash = cells.filter(c => c === '-').length;
const owned = Object.keys(ops).reduce((n, c) => n + ownedOf(c).length, 0);
check('非所持セル数', dash, masterRows.length * ids.length - owned);
check('数値セル数', cells.length - dash, owned);

// V6/V7/V8: 代表オペレーターを所持状況から選んで目視
const pick = pred => Object.keys(ops).find(pred);
[
  ['所持0件', pick(c => ownedOf(c).length === 0)],
  ['一部だけ所持', pick(c => ownedOf(c).length > 0 && ownedOf(c).length < ids.length)],
  ['2つ以上所持', pick(c => ownedOf(c).length >= 2)]
].forEach(([label, code]) => {
  const tr = rows.find(t => codeOf(t) === code);
  console.log(`${label} ${code} ${ops[code].name.ja}  所持=[${ownedOf(code)}]  表示=`,
    ids.map((id, i) => `${id}:${moduleCells(tr)[i]}`).join(' '));
});
```

読み方:

- 全 `check` が PASS であること。
- 「所持0件」の行はモジュール列がすべて `-`。
- 「一部だけ所持」の行は、所持しているIDだけが数値で、残りが `-`。
- 「2つ以上所持」の行で、**共有データに保存されていない新しいモジュールの列は `-` ではなく `0`**
  （罠4。共有データのキー有無ではなくマスターの所持情報で判定していることの確認）。
  古い共有ドキュメントほどこの差が出る。
- 「マスター外」の行があれば、その行のモジュール列は `-` にならず数値になる。

## フィルターダイアログ（Issue 2）

PC の現行 Chrome / Edge / Firefox / Safari で、既存の共有 URL と `?d=` なし URL をそれぞれ開く。mobile、JavaScript 無効、旧 browser、keyboard-only 専用の確認は対象にしない。

| # | 手順 | 期待結果 |
|---|---|---|
| F1 | `?d=` なし URL を開く | filter toolbar は hidden、`tbody` は 0 行のまま。 |
| F2 | 共有 URL を開く | filter toolbar が表示され、page の `一致 / 全件` と DOM 行数が一致する。 |
| F3 | Filter を開き、各 facet を一つずつ操作する | native modal が開く。preview/card だけ更新し、Apply 前の table、toolbar chip、page count は不変。同 facet の2値は OR、別 facet の追加は AND。 |
| F4 | 条件を作って Apply | dialog が閉じ、preview と table 行数/順序、toolbar chips、page count が一致する。 |
| F5 | 同じ開始条件から draft を変更し、Cancel、header close、Escape を個別に行う | いずれも table、toolbar、適用条件、page count は不変。再 open しても破棄した draft は復元されない。 |
| F6 | open 直後と全 close 経路後の focus を確認する | open 直後は active category、close 後は Filter button。標準 control の Tab/Shift+Tab、Space/Enter、Escape を妨げない。 |
| F7 | 職業全体を選択後、同職業の職分を選択する | 職業全体が解除され、職分限定の card/preview になる。 |
| F8 | faction を選び hidden/subfaction flag を操作し、最後の faction ID を外す | master から選んだ hidden / parent-child の代表で preview と Apply 後の包含が flag ごとに反転する。最後の ID を外すと flags は unchecked / disabled。 |
| F9 | China の同日 `since=to`、Global 欠損代表、China→Global の順に操作する | 同日境界を含む。Global 欠損は除外される。region 切替後も bounds は保持され、preview/Apply は選択 region の集合になる。 |
| F10 | 所持=true と potential=0 を同時に選ぶ | preview は 0。Apply 後の tbody は疑似 row なしの 0 行で、page count は 0。全 clear→Apply で初期 code 順に戻る。 |
| F11 | dialog を閉じて ja→en→ch を切り替え、再 open する | toolbar/operator 名と option/card 表示が追従し、適用 identity は不変。dialog open 中の programmatic language change でも draft identity は変わらない。 |
| F12 | dialog の open/Apply/Cancel と言語3切替の前後で header を比較する | `th` 数と module 列の順序は初期 snapshot から変わらない。dialog は PC viewport 内に収まり、header/footer は見え、必要なら中央 body のみ scroll する。 |
