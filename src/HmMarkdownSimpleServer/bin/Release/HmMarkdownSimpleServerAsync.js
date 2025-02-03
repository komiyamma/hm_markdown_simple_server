/// <reference path="../types/hm_jsmode.d.ts" />
/*
 * HmMarkdownSimpleServer v1.2.5.1
 *
 * Copyright (c) 2023-2024 Akitsugu Komiyama
 * under the MIT License
 */
// 前回のが残っていれば、クリア
if (typeof (objHmMarkdownSimpleServer) != "undefined") {
    objHmMarkdownSimpleServer._destructor();
}
class HmMarkdownSimpleServer {
    // ブラウザペインのターゲット。個別枠。
    static target_browser_pane = getVar('$TARGET_BROWSER_PANE');
    // 表示するべき一時ファイルのURL
    static absolute_path = getVar("$ABSOLUTE_URI");
    static absolute_url = new URL(HmMarkdownSimpleServer.absolute_path).href;
    // ポート番号
    static port = getVar("#PORT");
    // リアルタイムモードの最大文字数
    static realtimemode_max_textlength = getVar('#REALTIME_MODE_TEXT_LENGTH_MAX');
    // カーソルにブラウザ枠が追従するモード
    static cursor_follow_mode = getVar('#CURSOR_FOLLOW_MODE');
    // 監視インターバル
    static tick_interval = 1000;
    // 最後のチック
    static last_ticktime = -9999;
    constructor() {
        // 初期化
        HmMarkdownSimpleServer.initVariable();
        HmMarkdownSimpleServer.initAsync();
    }
    _destructor() {
        // 前回のが残っているかもしれないので、止める
        HmMarkdownSimpleServer.stopIntervalTick(HmMarkdownSimpleServer.timerHandle);
    }
    // 初期化
    static initVariable() {
        HmMarkdownSimpleServer.lastUpdateCount = 0;
        HmMarkdownSimpleServer.lastTotalText = "";
        HmMarkdownSimpleServer.lastPosY = 0;
        HmMarkdownSimpleServer.lastAllLineCount = 0;
        HmMarkdownSimpleServer.preUpdateCount = 0;
        HmMarkdownSimpleServer.lastIndex = 0;
        HmMarkdownSimpleServer.lastFileModified = 0;
        HmMarkdownSimpleServer.fso = null;
    }
    static timerHandle = 0;
    // 基本、マクロを実行しなおす度にTickは一度クリア
    static stopIntervalTick(timerHandle) {
        if (timerHandle) {
            hidemaru.clearInterval(timerHandle);
        }
    }
    // Tick作成。
    static createIntervalTick(func) {
        return hidemaru.setInterval(func, HmMarkdownSimpleServer.tick_interval);
    }
    // sleep 相当。ECMAScript には sleep が無いので。
    static sleep_in_tick(ms) {
        return new Promise(resolve => hidemaru.setTimeout(resolve, ms));
    }
    static async initAsync() {
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
                target: HmMarkdownSimpleServer.target_browser_pane,
                get: "load"
            });
            if (status == "1") {
                break;
            }
            await HmMarkdownSimpleServer.sleep_in_tick(100);
        }
        // １回走らせる
        HmMarkdownSimpleServer.tickMethod();
        // Tick作成 (１秒間隔で実行)
        HmMarkdownSimpleServer.timerHandle = HmMarkdownSimpleServer.createIntervalTick(HmMarkdownSimpleServer.tickMethod);
    }
    // Tick。
    static async tickMethod() {
        try {
            // 本当にタイム差分が経過していることを担保
            // する。これは setInterval系は、他関数がブロック的な処理だと、setInterval指定の関数の実行をキューでどんどん積んでいくことがあるため。
            // そしてブロックが解放されたとたん、あわてて全部一気にキューが連続で実行されるようなことを避ける。
            const tick_count = tickcount();
            const diff_time = tick_count - HmMarkdownSimpleServer.last_ticktime;
            if (diff_time < HmMarkdownSimpleServer.tick_interval) {
                return;
            }
            HmMarkdownSimpleServer.last_ticktime = tick_count;
            // (他の)マクロ実行中は安全のため横槍にならないように何もしない。
            if (hidemaru.isMacroExecuting()) {
                return;
            }
            // この操作対象中は、javascriptによる更新しない。何が起こるかわからん
            if (HmMarkdownSimpleServer.isNotDetectedOperation()) {
                return;
            }
            let current_url = browserpanecommand({
                get: "url",
                target: HmMarkdownSimpleServer.target_browser_pane
            });
            // uriが想定のものを違っていたら、何もしない
            if (!current_url.includes(HmMarkdownSimpleServer.absolute_url)) {
                return;
            }
            let [isChange, Length] = HmMarkdownSimpleServer.getTotalTextChange();
            // テキスト内容が変更になっている時だけ
            if (isChange && Length < HmMarkdownSimpleServer.realtimemode_max_textlength) {
                browserpanecommand({
                    target: HmMarkdownSimpleServer.target_browser_pane,
                    url: `javascript:HmMarkdownSimpleServer_updateFetch(${HmMarkdownSimpleServer.port})`,
                    show: 1
                });
                // コマンド実行したので、complete になるまで待つ
                // 0.6秒くらいまつのが限界。それ以上待つと、次のTickが来かねない。
                for (let i = 0; i < 3; i++) {
                    await HmMarkdownSimpleServer.sleep_in_tick(200);
                    let status = browserpanecommand({
                        target: HmMarkdownSimpleServer.target_browser_pane,
                        get: "readyState"
                    });
                    if (status == "complete") {
                        break;
                    }
                }
            }
            else {
                let isUpdate = HmMarkdownSimpleServer.isFileLastModifyUpdated();
                if (isUpdate && Length >= HmMarkdownSimpleServer.realtimemode_max_textlength - 1000) { // -1000しているのはギリギリ被らないようにするのではなく、リアルタイムプレビューとライブプレビューで余裕をもたせる(境界で行ったり来たりしないように)
                    browserpanecommand({
                        target: HmMarkdownSimpleServer.target_browser_pane,
                        show: 1,
                        refresh: 1
                    });
                    // コマンド実行したので、loadが完了するまで待つ
                    // 0.6秒くらいまつのが限界。それ以上待つと、次のTickが来かねない。
                    for (let i = 0; i < 6; i++) {
                        await HmMarkdownSimpleServer.sleep_in_tick(100);
                        let status = browserpanecommand({
                            target: HmMarkdownSimpleServer.target_browser_pane,
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
            if (HmMarkdownSimpleServer.isNotDetectedOperation()) {
                return;
            }
            // uriが想定のものを違っていたら、何もしない
            current_url = browserpanecommand({
                get: "url",
                target: HmMarkdownSimpleServer.target_browser_pane
            });
            // uriが想定のものを違っていたら、何もしない
            // 上にも同じ判定はあるが、最大で0.6秒経過しているため、ここでもしておく
            if (!current_url.includes(HmMarkdownSimpleServer.absolute_url)) {
                return;
            }
            // 何か変化が起きている？ linenoは変化した？ または、全体の行数が変化した？
            let [isDiff, posY, allLineCount] = HmMarkdownSimpleServer.getChangeYPos();
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
                        target: HmMarkdownSimpleServer.target_browser_pane,
                        url: "javascript:HmMarkdownSimpleServer_scollToPageBgn();"
                    });
                }
                // perYが1以上なら、ブラウザは末尾へ
                else if (perY >= 1) {
                    browserpanecommand({
                        target: HmMarkdownSimpleServer.target_browser_pane,
                        url: "javascript:HmMarkdownSimpleServer_scollToPageEnd();"
                    });
                }
                // それ以外なら、現在の位置を計算して移動する。
                else if (HmMarkdownSimpleServer.cursor_follow_mode == 1) {
                    browserpanecommand({
                        target: HmMarkdownSimpleServer.target_browser_pane,
                        url: "javascript:HmMarkdownSimpleServer_scollToPagePos(" + (HmMarkdownSimpleServer.getCurCursorYPos() - 1) + ");"
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
    static isNotDetectedOperation() {
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
        const notAllowedMask = 0x00000004 | 0x00000008 | 0x00000010 |
            0x00000200 | 0x00000400 | 0x00000800 |
            0x00001000 | 0x00020000;
        return (s & notAllowedMask) != 0;
    }
    static lastUpdateCount = 0;
    static lastTotalText = "";
    static getTotalTextChange() {
        try {
            // updateCountで判定することで、テキスト内容の更新頻度を下げる。
            // getTotalTextを分割したりコネコネするのは、行数が多くなってくるとやや負荷になりやすいので
            // テキスト更新してないなら、前回の結果を返す。
            let updateCount = hidemaru.getUpdateCount();
            // 前回から何も変化していないなら、前回の結果を返す。
            if (HmMarkdownSimpleServer.lastUpdateCount == updateCount) {
                return [false, HmMarkdownSimpleServer.lastTotalText.length];
            }
            HmMarkdownSimpleServer.lastUpdateCount = updateCount;
            let totalText = hidemaru.getTotalText();
            if (HmMarkdownSimpleServer.lastTotalText == totalText) {
                return [false, HmMarkdownSimpleServer.lastTotalText.length];
            }
            HmMarkdownSimpleServer.lastTotalText = totalText;
            return [true, HmMarkdownSimpleServer.lastTotalText.length];
        }
        catch (e) {
        }
        return [false, 0];
    }
    // linenoが変化したか、全体の行数が変化したかを判定する。
    static lastPosY = 0;
    static lastAllLineCount = 0;
    static getChangeYPos() {
        let isDiff = false;
        // linenoが変わってるなら、isDiffをtrueにする。
        let posY = HmMarkdownSimpleServer.getCurCursorYPos();
        if (HmMarkdownSimpleServer.lastPosY != posY) {
            HmMarkdownSimpleServer.lastPosY = posY;
            isDiff = true;
        }
        // 行全体が変わってるなら、isDiffをtrueにする。
        let allLineCount = HmMarkdownSimpleServer.getAllLineCount();
        if (HmMarkdownSimpleServer.lastAllLineCount != allLineCount) {
            HmMarkdownSimpleServer.lastAllLineCount = allLineCount;
            isDiff = true;
        }
        return [isDiff, posY, allLineCount];
    }
    // テキスト全体の行数を取得する。
    // 実際には末尾の空行を除いた行数を取得する。
    static preUpdateCount = 0;
    static lastIndex = 0;
    static getAllLineCount() {
        // updateCountで判定することで、テキスト内容の更新頻度を下げる。
        // getTotalTextを分割したりコネコネするのは、行数が多くなってくるとやや負荷になりやすいので
        // テキスト更新してないなら、前回の結果を返す。
        let updateCount = hidemaru.getUpdateCount();
        // 前回から何も変化していないなら、前回の結果を返す。
        if (updateCount == HmMarkdownSimpleServer.preUpdateCount) {
            return HmMarkdownSimpleServer.lastIndex + 1; // lineno相当に直す
        }
        else {
            HmMarkdownSimpleServer.preUpdateCount = updateCount;
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
            HmMarkdownSimpleServer.lastIndex = index;
            return index + 1; // lineno相当に直す
        }
    }
    // lineno相当
    static getCurCursorYPos() {
        let pos = hidemaru.getCursorPos("wcs");
        return pos[0];
    }
    // ファイルが更新されたかどうかを判定する。
    static lastFileModified = 0;
    static fso = null;
    static isFileLastModifyUpdated() {
        if (HmMarkdownSimpleServer.fso == null) {
            HmMarkdownSimpleServer.fso = hidemaru.createObject("Scripting.FileSystemObject");
        }
        let diff = false;
        // 無題になってたらこれやらない。
        let filepath = hidemaru.getFileFullPath();
        if (filepath != "") {
            try {
                // 編集しているファイルではなく、Tempファイルの方のファイルが更新されてるかが重要。
                let f = HmMarkdownSimpleServer.fso.GetFile(HmMarkdownSimpleServer.absolute_path);
                let m = f.DateLastModified;
                let s = f.Size;
                if (m != HmMarkdownSimpleServer.lastFileModified) {
                    diff = true;
                    HmMarkdownSimpleServer.lastFileModified = m;
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
}
try {
    var objHmMarkdownSimpleServer = new HmMarkdownSimpleServer();
}
catch (err) {
    // エラーならアウトプット枠に
    let outdll = hidemaru.loadDll("HmOutputPane.dll");
    outdll.dllFuncW.OutputW(hidemaru.getCurrentWindowHandle(), `${err}\r\n`);
    // タイマー残骸が残らないように
    if (typeof (objHmMarkdownSimpleServer) != "undefined") {
        objHmMarkdownSimpleServer._destructor();
    }
}
