﻿/*
 * Copyright (c) 2023 Akitsugu Komiyama
 * under the MIT License
 */

using HmNetCOM;
using Markdig;
using Markdig.Extensions.AutoIdentifiers;
using Markdig.Renderers.Html;
using Markdig.Renderers;
using Markdig.Syntax;
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Text.RegularExpressions;


namespace HmMarkdownSimpleServer;





[Guid("613BF59D-753E-4EEF-BFDE-BC621FDFDA60")]
public class HmMarkdownSimpleServer
{
    static DllAssemblyResolver dasmr;

    Task<bool> task;
    CancellationTokenSource cts;

    System.IO.FileSystemWatcher watcher;

    Dictionary<string, TemporaryFile> dic = new Dictionary<string, TemporaryFile>();

    string strPathCSSWin = "";

    string strPathMermaidWin = "";

    int darkmode = 0;

    string html_template = "";

    int is_use_math_jax = 0;

    int is_use_external_link_target_blank = 0;

    string fontname = "";

    int port = 0;

    // Markdon処理のスタート
    public string Launch(string htmlTemplate)
    {
        try
        {
            Destroy();

            dasmr = new DllAssemblyResolver();

            this.html_template = htmlTemplate;

            currMacroFilePath = (String)Hm.Macro.Var["currentmacrofilename"];
            darkmode = (int)(dynamic)Hm.Macro.Var["darkmode"];
            is_use_math_jax = (int)(dynamic)Hm.Macro.Var["#IS_USE_MATHJAX"];
            is_use_external_link_target_blank = (int)(dynamic)Hm.Macro.Var["#IS_USE_EXTERNAL_LINK_TARGET_BLANK"];
            port = (int)(dynamic)Hm.Macro.Var["#PORT"];
            fontname = (string)Hm.Macro.Var["fontname"];

            string tempFileFullPath = GetTemporaryFileName();
            prevFileFullPath = Hm.Edit.FilePath ?? "";

            isMustReflesh = true;
            string currFileFullPath = Hm.Edit.FilePath;
            if (!String.IsNullOrEmpty(currFileFullPath))
            {
                CreateTempFile(currFileFullPath);
            }
            isMustReflesh = false;


            CreateFileWatcher();

            CreateTaskMonitoringFilePath();

            return tempFileFullPath; // new Uri(tempFileFullPath).AbsoluteUri;
        }
        catch (Exception e)
        {
            Hm.OutputPane.Output(e.ToString() + "\r\n");
        }

        return "";
    }

    private void CreateFileWatcher()
    {
        string filepath = Hm.Edit.FilePath;
        if (!String.IsNullOrEmpty(filepath))
        {
            var directory = Path.GetDirectoryName(filepath);
            var filename = Path.GetFileName(filepath);
            watcher = new System.IO.FileSystemWatcher(directory, filename);

            //監視するフィールドの設定
            watcher.NotifyFilter = (NotifyFilters.LastWrite | NotifyFilters.Size);

            //サブディレクトリは監視しない
            watcher.IncludeSubdirectories = false;

            //監視を開始する
            watcher.EnableRaisingEvents = true;
            watcher.Changed += new System.IO.FileSystemEventHandler(watcher_Changed);
        }
    }

    private void DestroyFileWatcher()
    {
        if (watcher != null)
        {
            watcher.Dispose();
        }
    }

    bool isMustReflesh = false;

    private void watcher_Changed(object sender, FileSystemEventArgs e)
    {
        if (!Hm.Macro.IsExecuting)
        {
            isMustReflesh = true;
            // Hm.OutputPane.Output("watcher_Changed");
        }
    }


    // 秀丸で編集中ファイル名をモニターするためのタスク生成
    private void CreateTaskMonitoringFilePath()
    {
        cts = new CancellationTokenSource();
        CancellationToken ct = cts.Token;
        task = Task.Run(() =>
        {
            return TickMethodAsync(ct);
        }, ct);
    }

    // マークダウンファイル直接だと表示しにくいのでテンポラリファイルをtemp内に作成する。
    private String GetTemporaryFileName()
    {
        try
        {
            TemporaryFile temp;
            string filepath = Hm.Edit.FilePath;
            if (String.IsNullOrEmpty(filepath))
            {
                return "";
            }

            if (dic.ContainsKey(filepath))
            {
                temp = dic[filepath];
            }
            else
            {
                temp = new TemporaryFile();
                dic[filepath] = temp;
            }

            return temp.FullName;
        }
        catch (Exception)
        {
        }
        return "";
    }


    private bool isNotAllowInputStates()
    {
        /*
            ○ 0x00000002 ウィンドウ移動/サイズ変更中
            ○ 0x00000004 メニュー操作中
            ○ 0x00000008 システムメニュー操作中
            ○ 0x00000010 ポップアップメニュー操作中
            ○ 0x00000100 IME入力中
            × 0x00000200 何らかのダイアログ表示中
            × 0x00000400 ウィンドウがDisable状態
            × 0x00000800 非アクティブなタブまたは非表示のウィンドウ
            × 0x00001000 検索ダイアログの疑似モードレス状態
            ○ 0x00002000 なめらかスクロール中
            ○ 0x00004000 中ボタンによるオートスクロール中
            ○ 0x00008000 キーやマウスの操作直後
            ○ 0x00010000 何かマウスのボタンを押している
            ◯ 0x00020000 マウスキャプチャ状態(ドラッグ状態)
            ◯ 0x00040000 Hidemaru_CheckQueueStatus相当
            × 0x00080000 デスクトップ復元中（V9.46以降）
            × 0x00200000 操作していない秀丸ウィンドウ
        */

        int states = Hm.Edit.InputStates;

        const int notAllowedMask =
              0x00000200 | 0x00000400 | 0x00000800 | 0x00001000 | 0x00080000 | 0x00200000;

        return (states & notAllowedMask) != 0;
    }

    string prevFileFullPath = null;
    string currMacroFilePath = "";

    // ファイル名が変化したことを検知したら、HmMarkdownSimpleServer.mac(自分の呼び出し元)を改めて実行する。
    // これによりマクロにより、このクラスのインスタンスがクリアされるとともに、新たなファイル名を使って、Markdownを新たなファイルに紐づけで表示されることになる。
    private async Task<bool> TickMethodAsync(CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                for (int i = 0; i < 3; i++)
                {
                    if (ct.IsCancellationRequested)
                    {
                        return true;
                    }
                    await DelayMethod(ct);
                }

                string currFileFullPath = Hm.Edit.FilePath;

                if (String.IsNullOrEmpty(currFileFullPath))
                {
                    isMustReflesh = false;

                    Destroy();

                    return true;
                }

                // 更新するべきではない条歌いであれば、何もしない
                if (isNotAllowInputStates())
                {
                    continue;
                }

                // ファイル名が変化したら、改めて自分自身のマクロを実行する。
                if (prevFileFullPath != currFileFullPath)
                {
                    prevFileFullPath = currFileFullPath;

                    // 同期マクロ実行中ではない
                    if (!Hm.Macro.IsExecuting && !String.IsNullOrEmpty(currFileFullPath))
                    {
                        isMustReflesh = false;

                        // 自分自身を実行
                        Hm.Macro.Exec.File(currMacroFilePath);

                        return true;
                    }
                }

                if (isMustReflesh)
                {
                    // 同期マクロ実行中ではない
                    if (!String.IsNullOrEmpty(currFileFullPath))
                    {
                        CreateTempFile(currFileFullPath);

                        isMustReflesh = false;
                    }
                }
            }
        }
        catch (Exception e)
        {
        }
        return true;

    }

    private void CreateTempFile(string currFileFullPath)
    {
        try
        {
            string markdowntext = File.ReadAllText(currFileFullPath);

            MarkdownPipeline pipeLine = null;
            //if (is_use_math_jax > 0)
            //{
            //pipeLine = new MarkdownPipelineBuilder().UseAutoIdentifiers(AutoIdentifierOptions.GitHub).UseAdvancedExtensions().UseEmojiAndSmiley().UsePragmaLines().Build();
            //}
            //else
            //{
            pipeLine = new MarkdownPipelineBuilder().UseAutoIdentifiers(AutoIdentifierOptions.GitHub).UseAdvancedExtensions().UseEmojiAndSmiley().UsePragmaLines().Build();
            //}

            string markdown_html = Markdig.Markdown.ToHtml(markdowntext, pipeLine);
            string tempFileFullPath = GetTemporaryFileName();
            string baseDirWin = Path.GetDirectoryName(currFileFullPath);
            string baseHref = new Uri(baseDirWin).AbsoluteUri;
            string cssHref = "";
            if (String.IsNullOrEmpty(strPathCSSWin))
            {
                string thisDllDirWin = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                if (darkmode > 0)
                {
                    strPathCSSWin = thisDllDirWin + "\\HmMarkdownSimpleServerDark.css";
                }
                else
                {
                    strPathCSSWin = thisDllDirWin + "\\HmMarkdownSimpleServerLight.css";
                }

            }
            cssHref = new Uri(strPathCSSWin).AbsoluteUri;

            string mermaidSrc = "";
            if (String.IsNullOrEmpty(strPathMermaidWin))
            {
                string thisDllDirWin = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                strPathMermaidWin = thisDllDirWin + "\\HmMarkdownSimpleServerMermaid.js";

            }
            mermaidSrc = new Uri(strPathMermaidWin).AbsoluteUri;


            var html = html_template;
            html = html.Replace("$CSS_URI_ABSOLUTE", cssHref);
            html = html.Replace("$MERMAID_URI_ABSOLUTE", mermaidSrc);
            html = html.Replace("$BASE_HREF", baseHref + "/"); // この「/」を末尾に付けるのは絶対必須
            html = html.Replace("$HTML", markdown_html);
            html = html.Replace("$IS_USE_EXTERNAL_LINK_TARGET_BLANK", is_use_external_link_target_blank.ToString());
            html = html.Replace("$PORT", port.ToString());
            html = html.Replace("$FONTNAME", fontname);

            if (is_use_math_jax > 0)
            {
                html = html.Replace("$MATHJAX_URL", """<script src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js"></script>""");
                html = html.Replace("$MATHJAX_CONFIG", """<script type="text/x-mathjax-config">MathJax.Hub.Config({ messageStyle: 'none' });</script>""");
                html = html.Replace("$IS_USE_MATHJAX", "1");
            }
            else
            {
                html = html.Replace("$MATHJAX_URL", "");
                html = html.Replace("$MATHJAX_CONFIG", "");
                html = html.Replace("$IS_USE_MATHJAX", "0");
            }
            File.WriteAllText(tempFileFullPath, html);
        }
        catch (Exception) { }
    }

    private static async Task<CancellationToken> DelayMethod(CancellationToken ct)
    {
        await Task.Delay(150, ct);

        if (ct.IsCancellationRequested)
        {
            // Clean up here, then...
            ct.ThrowIfCancellationRequested();
        }

        return ct;
    }


    public void OnReleaseObject(int reason = 0)
    {
        Destroy();
    }

    private long Destroy()
    {
        try
        {
            DestroyFileWatcher();
        }
        catch (Exception)
        {

        }
        try
        {
            if (cts != null)
            {
                cts.Cancel();
            }
        }
        catch (Exception)
        {

        }
        try
        {
            if (task != null)
            {
                task.Dispose();
            }
        }
        catch (Exception)
        {

        }
        try
        {
            foreach (var item in dic)
            {
                try
                {
                    item.Value.Dispose();
                }
                catch { }
            }
            dic.Clear();
        }
        catch (Exception)
        {

        }
        try
        {
            dasmr = null;
        }
        catch (Exception)
        {

        }

        return 0;
    }
}
