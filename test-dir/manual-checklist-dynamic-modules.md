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
