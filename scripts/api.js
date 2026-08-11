// マスターデータ manifest の入口。配信ファイル名はハッシュ付きで更新のたび変わるため、
// 実ファイルパスは manifest の files.operator.path / files.gamedata.path から都度引く
const MASTER_MANIFEST_URL = 'https://data.memoria-ll.link/arknights-data/master/manifest.json';

// !response.ok を throw に変換して呼び出し元へ伝える共通ヘルパー
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// マスターデータ（operator + gamedata）を manifest 経由で取得する。
// manifest / 個別ファイルのどれが失敗しても { operator: {}, gameData: {} } の空マスタに縮退する
// （マスタ取得失敗を画面に見せない現行挙動を維持するため。旧マスタへのフォールバックはしない）
async function fetchMasterData() {
    try {
        const manifest = await fetchJson(MASTER_MANIFEST_URL);
        const [operator, gameData] = await Promise.all([
            fetchJson(manifest.files.operator.path),
            fetchJson(manifest.files.gamedata.path)
        ]);
        return { operator: operator, gameData: gameData };
    } catch (error) {
        console.error('マスターデータの読み込みに失敗しました:', error);
        return { operator: {}, gameData: {} };
    }
}

// HTTP APIを使用してデータを取得する関数
async function fetchOperatorData(dataId) {
    try {
        const response = await fetch(`https://us-central1-arknights-sharing-view.cloudfunctions.net/getCharacterDataHttp?id=${dataId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.characters) {
            return data.characters;
        } else {
            throw new Error('データが見つかりませんでした');
        }
    } catch (error) {
        console.error('データ取得エラー:', error);
        throw error;
    }
}
