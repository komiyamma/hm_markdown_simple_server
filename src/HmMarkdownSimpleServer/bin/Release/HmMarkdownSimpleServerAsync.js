/// <reference path="types/hm_jsmode.d.ts" />
/*
 * HmMarkdownSimpleServer v1.2.0.1
 *
 * Copyright (c) 2023 Akitsugu Komiyama
 * under the MIT License
 */
// ブラウザペインのターゲット。個別枠。
let target_browser_pane = "_each";
// 表示するべき一時ファイルのURL
let absolute_uri = getVar("$ABSOLUTE_URI");
// ポート番号
let port = getVar("#PORT");
const livemode_max_textlength = 50000;
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
debuginfo(2);
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
        let [isChange, Length] = getTotalTextChange();
        // テキスト内容が変更になっている時だけ
        if (isChange && Length < livemode_max_textlength) {
            browserpanecommand({
                target: "_each",
                url: `javascript:updateFetch(${port})`,
                show: 1
            });
            // コマンド実行したので、interactive か complete になるまで待つ
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
            if (isUpdate && Length >= livemode_max_textlength - 1000) { // -1000しているのはギリギリ被らないようにするのではなく、LiveViewとFileViewで余裕をもたせる(境界で行ったり来たりしないように)
                browserpanecommand({
                    target: "_each",
                    url: "javascript:location.reload()",
                    show: 1
                });
                // コマンド実行したので、interactive か complete になるまで待つ
                // 0.6秒くらいまつのが限界。それ以上待つと、次のTickが来かねない。
                for (let i = 0; i < 3; i++) {
                    await sleep_in_tick(200);
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
        // 何か変化が起きている？ linenoは変化した？ または、全体の行数が変化した？
        let [isDiff, posY, allLineCount] = getChangeYPos();
        // Zero Division Error回避
        if (allLineCount < 0) {
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
                    url: "javascript:window.scrollTo(0, 0);"
                });
            }
            // perYが1以上なら、ブラウザは末尾へ
            if (perY >= 1) {
                browserpanecommand({
                    target: target_browser_pane,
                    url: "javascript:window.scrollTo(0, (document.body.scrollHeight)*(100));" // 微妙に末尾にならなかったりするので、100倍している。
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
    ○ 0x00020000 マウスキャプチャ状態(ドラッグ状態)
    ○ 0x00040000 Hidemaru_CheckQueueStatus相当
    */
    let istatus = hidemaru.getInputStates();
    let during_window_move_resize = istatus & 0x00000002;
    if (during_window_move_resize) {
        // console.log("during_window_move_resize" + "\r\n");
    }
    let during_menu_operation = istatus & 0x00000004;
    if (during_menu_operation) {
        // console.log("during_menu_operation" + "\r\n");
        return true;
    }
    let during_system_menu_operation = istatus & 0x00000008;
    if (during_system_menu_operation) {
        // console.log("during_system_menu_operation" + "\r\n");
        return true;
    }
    let during_popup_menu_operation = istatus & 0x00000010;
    if (during_popup_menu_operation) {
        // console.log("during_popup_menu_operation" + "\r\n");
        return true;
    }
    let during_ime_input = istatus & 0x00000100;
    if (during_ime_input) {
        // console.log("during_ime_input" + "\r\n");
    }
    let during_dialog_display = istatus & 0x00000200;
    if (during_dialog_display) {
        // console.log("during_dialog_display" + "\r\n");
        return true;
    }
    let during_disable_window = istatus & 0x00000400;
    if (during_disable_window) {
        // console.log("during_disable_window" + "\r\n");
        return true;
    }
    let during_non_active_window = istatus & 0x00000800;
    if (during_non_active_window) {
        // console.log("during_non_active_window" + "\r\n");
        return true;
    }
    let during_smooth_scroll = istatus & 0x00002000;
    if (during_smooth_scroll) {
        // console.log("during_smooth_scroll" + "\r\n");
    }
    let during_middle_button_scroll = istatus & 0x00004000;
    if (during_middle_button_scroll) {
        // console.log("during_middle_button_scroll" + "\r\n");
    }
    let during_key_mouse_operation = istatus & 0x00008000;
    if (during_key_mouse_operation) {
        // console.log("during_key_mouse_operation" + "\r\n");
    }
    let during_mouse_button_press = istatus & 0x00010000;
    if (during_mouse_button_press) {
        // console.log("during_mouse_button_press" + "\r\n");
    }
    let during_mouse_drag = istatus & 0x00020000;
    if (during_mouse_drag) {
        // console.log("during_mouse_drag" + "\r\n");
        return true;
    }
    let during_hidemaru_queue = istatus & 0x00040000;
    if (during_hidemaru_queue) {
        // console.log("during_hidemaru_queue" + "\r\n");
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
            let f = fso.GetFile(absolute_uri);
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
// 表示
browserpanecommand({
    target: target_browser_pane,
    url: absolute_uri,
    show: 1
});
// 初期化
initVariable();
// 前回のが残っているかもしれないので、止める
stopIntervalTick(timerHandle);
// １回走らせる
tickMethod();
// Tick実行
timerHandle = createIntervalTick(tickMethod);
