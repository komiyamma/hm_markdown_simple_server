/// <reference path="types/hm_jsmode.d.ts" />
/*
 * HmMarkdownSimpleServer v1.2.1.8
 *
 * Copyright (c) 2023 Akitsugu Komiyama
 * under the MIT License
 */
// ブラウザペインのターゲット。個別枠。
const target_browser_pane = getVar('$TARGET_BROWSER_PANE');
// 表示するべき一時ファイルのURL
const absolute_path = getVar("$ABSOLUTE_URI");
const absolute_url = new URL(absolute_path).href;
// ポート番号
const port = getVar("#PORT");
// リアルタイムモードの最大文字数
const realtimemode_max_textlength = getVar('#REALTIME_MODE_TEXT_LENGTH_MAX');
// カーソルにブラウザ枠が追従するモード
const cursor_follow_mode = getVar('#CURSOR_FOLLOW_MODE');
// 時間を跨いで共通利用するので、varで
if (typeof (timerHandle) === "undefined") {
    var timerHandle = 0;
}
// 基本、マクロを実行しなおす度にTickは一度クリア
function stopIntervalTick(timerHandle) {
    if (timerHandle) {
        hidemaru.clearInterval(timerHandle);
    }
}
// Tick作成。
function createIntervalTick(func) {
    return hidemaru.setInterval(func, 1000);
}
// sleep 相当。ECMAScript には sleep が無いので。
function sleep_in_tick(ms) {
    return new Promise(resolve => hidemaru.setTimeout(resolve, ms));
}
// Tick。
async function tickMethod() {
    try {
        // (他の)マクロ実行中は安全のため横槍にならないように何もしない。
        if (hidemaru.isMacroExecuting()) {
            return;
        }
        // この操作対象中は、javascriptによる更新しない。何が起こるかわからん
        if (isNotDetectedOperation()) {
            return;
        }
        let current_url = browserpanecommand({
            get: "url",
            target: target_browser_pane
        });
        // uriが想定のものを違っていたら、何もしない
        if (!current_url.includes(absolute_url)) {
            return;
        }
        let [isChange, Length] = getTotalTextChange();
        // テキスト内容が変更になっている時だけ
        if (isChange && Length < realtimemode_max_textlength) {
            browserpanecommand({
                target: target_browser_pane,
                url: `javascript:HmMarkdownSimpleServer_updateFetch(${port})`,
                show: 1
            });
            // コマンド実行したので、complete になるまで待つ
            // 0.6秒くらいまつのが限界。それ以上待つと、次のTickが来かねない。
            for (let i = 0; i < 3; i++) {
                await sleep_in_tick(200);
                let status = browserpanecommand({
                    target: target_browser_pane,
                    get: "readyState"
                });
                if (status == "complete") {
                    break;
                }
            }
        }
        else {
            let isUpdate = isFileLastModifyUpdated();
            if (isUpdate && Length >= realtimemode_max_textlength - 1000) { // -1000しているのはギリギリ被らないようにするのではなく、リアルタイムプレビューとライブプレビューで余裕をもたせる(境界で行ったり来たりしないように)
                browserpanecommand({
                    target: target_browser_pane,
                    show: 1,
                    refresh: 1
                });
                // コマンド実行したので、loadが完了するまで待つ
                // 0.6秒くらいまつのが限界。それ以上待つと、次のTickが来かねない。
                for (let i = 0; i < 6; i++) {
                    await sleep_in_tick(100);
                    let status = browserpanecommand({
                        target: target_browser_pane,
                        get: "load"
                    });
                    if (status == "1") {
                        break;
                    }
                }
            }
        }
        // 時間が経過しているため、同じ判定を行う
        // (他の)マクロ実行中は安全のため横槍にならないように何もしない。
        if (hidemaru.isMacroExecuting()) {
            return;
        }
        // この操作対象中は、javascriptによる更新しない。何が起こるかわからん
        if (isNotDetectedOperation()) {
            return;
        }
        // uriが想定のものを違っていたら、何もしない
        current_url = browserpanecommand({
            get: "url",
            target: target_browser_pane
        });
        // uriが想定のものを違っていたら、何もしない
        // 上にも同じ判定はあるが、最大で0.6秒経過しているため、ここでもしておく
        if (!current_url.includes(absolute_url)) {
            return;
        }
        // 何か変化が起きている？ linenoは変化した？ または、全体の行数が変化した？
        let [isDiff, posY, allLineCount] = getChangeYPos();
        // Zero Division Error回避
        if (allLineCount <= 0) {
            allLineCount = 1;
        }
        // 何か変化が起きていて、かつ、linenoが1以上
        if (isDiff && posY > 0) {
            // 最初の行まであと3行程度なのであれば、最初にいる扱いにする。
            if (posY <= 3) {
                posY = 0;
            }
            // 最後の行まであと3行程度なのであれば、最後の行にいる扱いにする。
            if (allLineCount - posY < 3) {
                posY = allLineCount;
            }
            // perYが0以上1以下になるように正規化する。
            let perY = posY / allLineCount;
            // perYが0以下なら、ブラウザは先頭へ
            if (perY <= 0) {
                browserpanecommand({
                    target: target_browser_pane,
                    url: "javascript:HmMarkdownSimpleServer_scollToPageBgn();"
                });
            }
            // perYが1以上なら、ブラウザは末尾へ
            else if (perY >= 1) {
                browserpanecommand({
                    target: target_browser_pane,
                    url: "javascript:HmMarkdownSimpleServer_scollToPageEnd();"
                });
            }
            // それ以外なら、現在の位置を計算して移動する。
            else if (cursor_follow_mode == 1) {
                browserpanecommand({
                    target: target_browser_pane,
                    url: "javascript:HmMarkdownSimpleServer_scollToPagePos(" + (getCurCursorYPos() - 1) + ");"
                });
            }
        }
    }
    catch (e) {
        // エラーならアウトプット枠に
        let outdll = hidemaru.loadDll("HmOutputPane.dll");
        outdll.dllFuncW.OutputW(hidemaru.getCurrentWindowHandle(), `${e}\r\n`);
    }
}
function isNotDetectedOperation() {
    /*
    ○ 0x00000002 ウィンドウ移動/サイズ変更中
    × 0x00000004 メニュー操作中
    × 0x00000008 システムメニュー操作中
    × 0x00000010 ポップアップメニュー操作中
    ○ 0x00000100 IME入力中
    × 0x00000200 何らかのダイアログ表示中
    × 0x00000400 ウィンドウがDisable状態
    × 0x00000800 非アクティブなタブまたは非表示のウィンドウ
    × 0x00001000 検索ダイアログの疑似モードレス状態
    ○ 0x00002000 なめらかスクロール中
    ○ 0x00004000 中ボタンによるオートスクロール中
    ○ 0x00008000 キーやマウスの操作直後
    ○ 0x00010000 何かマウスのボタンを押している
    × 0x00020000 マウスキャプチャ状態(ドラッグ状態)
    ○ 0x00040000 Hidemaru_CheckQueueStatus相当
    */
    let s = hidemaru.getInputStates();
    if (s & 0x00000004) {
        return true;
    }
    if (s & 0x00000008) {
        return true;
    }
    if (s & 0x00000010) {
        return true;
    }
    if (s & 0x00000200) {
        return true;
    }
    if (s & 0x00000400) {
        return true;
    }
    if (s & 0x00000800) {
        return true;
    }
    if (s & 0x00001000) {
        return true;
    }
    if (s & 0x00020000) {
        return true;
    }
    return false;
}
let lastUpdateCount = 0;
let lastTotalText = "";
function getTotalTextChange() {
    try {
        // updateCountで判定することで、テキスト内容の更新頻度を下げる。
        // getTotalTextを分割したりコネコネするのは、行数が多くなってくるとやや負荷になりやすいので
        // テキスト更新してないなら、前回の結果を返す。
        let updateCount = hidemaru.getUpdateCount();
        // 前回から何も変化していないなら、前回の結果を返す。
        if (lastUpdateCount == updateCount) {
            return [false, lastTotalText.length];
        }
        lastUpdateCount = updateCount;
        let totalText = hidemaru.getTotalText();
        if (lastTotalText == totalText) {
            return [false, lastTotalText.length];
        }
        lastTotalText = totalText;
        return [true, lastTotalText.length];
    }
    catch (e) {
    }
    return [false, 0];
}
// linenoが変化したか、全体の行数が変化したかを判定する。
let lastPosY = 0;
let lastAllLineCount = 0;
function getChangeYPos() {
    let isDiff = false;
    // linenoが変わってるなら、isDiffをtrueにする。
    let posY = getCurCursorYPos();
    if (lastPosY != posY) {
        lastPosY = posY;
        isDiff = true;
    }
    // 行全体が変わってるなら、isDiffをtrueにする。
    let allLineCount = getAllLineCount();
    if (lastAllLineCount != allLineCount) {
        lastAllLineCount = allLineCount;
        isDiff = true;
    }
    return [isDiff, posY, allLineCount];
}
// テキスト全体の行数を取得する。
// 実際には末尾の空行を除いた行数を取得する。
let preUpdateCount = 0;
let lastIndex = 0;
function getAllLineCount() {
    // updateCountで判定することで、テキスト内容の更新頻度を下げる。
    // getTotalTextを分割したりコネコネするのは、行数が多くなってくるとやや負荷になりやすいので
    // テキスト更新してないなら、前回の結果を返す。
    let updateCount = hidemaru.getUpdateCount();
    // 前回から何も変化していないなら、前回の結果を返す。
    if (updateCount == preUpdateCount) {
        return lastIndex + 1; // lineno相当に直す
    }
    else {
        preUpdateCount = updateCount;
        // テキスト全体から
        let lastText = hidemaru.getTotalText();
        // 失敗することがあるらしい...
        if (lastText == undefined) {
            return 1;
        }
        // \r は判定を歪めやすいので先に除去
        lastText = lastText.replace(/\r/g, "");
        // 改行で分割
        let lines = lastText.split("\n");
        let index = lines.length - 1; // 最後の行の中身から探索する
        while (index >= 1) {
            // 空ではない行を見つけたら、有効な行である。
            if (lines[index] != "") {
                break;
            }
            index--;
        }
        // 前回の有効な行として格納
        lastIndex = index;
        return index + 1; // lineno相当に直す
    }
}
// lineno相当
function getCurCursorYPos() {
    let pos = hidemaru.getCursorPos("wcs");
    return pos[0];
}
// ファイルが更新されたかどうかを判定する。
let lastFileModified = 0;
let fso = null;
function isFileLastModifyUpdated() {
    if (fso == null) {
        fso = hidemaru.createObject("Scripting.FileSystemObject");
    }
    let diff = false;
    // 無題になってたらこれやらない。
    let filepath = hidemaru.getFileFullPath();
    if (filepath != "") {
        try {
            // 編集しているファイルではなく、Tempファイルの方のファイルが更新されてるかが重要。
            let f = fso.GetFile(absolute_path);
            let m = f.DateLastModified;
            let s = f.Size;
            if (m != lastFileModified) {
                diff = true;
                lastFileModified = m;
            }
        }
        catch (e) {
            // エラーならアウトプット枠に
            let outdll = hidemaru.loadDll("HmOutputPane.dll");
            outdll.dllFuncW.OutputW(hidemaru.getCurrentWindowHandle(), `${e}\r\n`);
        }
    }
    return diff;
}
// 初期化
function initVariable() {
    lastUpdateCount = 0;
    lastTotalText = "";
    lastPosY = 0;
    lastAllLineCount = 0;
    preUpdateCount = 0;
    lastIndex = 0;
    lastFileModified = 0;
    fso = null;
}
// 初期化
initVariable();
// 前回のが残っているかもしれないので、止める
stopIntervalTick(timerHandle);
async function initAsync() {
    // 表示
    /*
    browserpanecommand({
        target: target_browser_pane,
        url: absolute_url,
        show: 1
    });
    */
    // コマンド実行したので、loadが完了するまで待つ
    // 最大で2.0秒くらいまつ。仮に2.0秒経過してロードが完了しなかったとしても、IntervalTickが働いているので大丈夫
    // この処理はあくまでも、最初の１回目の tickMethod を出来るだけ速いタイミングで当てるというだけのもの。
    for (let i = 0; i < 20; i++) {
        let status = browserpanecommand({
            target: target_browser_pane,
            get: "load"
        });
        if (status == "1") {
            break;
        }
        await sleep_in_tick(100);
    }
    // １回走らせる
    tickMethod();
    // Tick作成 (１秒間隔で実行)
    timerHandle = createIntervalTick(tickMethod);
}
initAsync();
