using System.Collections.Generic;
using System;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using HmNetCOM;
using Markdig;
using Markdig.Extensions.AutoIdentifiers;
using System.Security.AccessControl;
using System.Security.Policy;

namespace HmMarkdownSimpleServer;

public interface IHmMarkdownListeningServer
{
    int Start();
    int Close();

    void OnReleaseObject(int reason);

}

[Guid("4428D103-BBDE-4794-BCAC-A053529F8BBF")]
public class HmMarkdownListeningServer
{
    static DllAssemblyResolver dasmr;

    CancellationTokenSource cts;
    bool isRunning = false;

    HttpListener listener;

    int port = 0;

    public int Start(int portBGN, int portEND)
    {
        Close();

        try
        {
            dasmr = new DllAssemblyResolver();
        }
        catch (Exception e)
        {
        }

        try
        {
            port = HmUsedPortChecker.GetAvailablePort(portBGN, portEND);
            if (port == 0)
            {
                Hm.OutputPane.Output("${portBGN}～${portEND}の間に、使用可能なポートが見つかりませんでした。\r\n");
                return 0;
            }

            cts = new CancellationTokenSource();
            _ = Task.Run(() => StartTask(cts.Token), cts.Token);
        }
        catch (Exception e)
        {
            // Hm.OutputPane.Output(e.Message + "\r\n");
        }

        return port;
    }

    private string GetTotalText()
    {
        try
        {

            string markdown = Hm.Edit.TotalText ?? "";

            MarkdownPipeline pipeLine = null;
            //if (HmMarkdownSimpleServer.is_use_math_jax > 0) {
            //    pipeLine = new MarkdownPipelineBuilder().UseAutoIdentifiers(AutoIdentifierOptions.GitHub).UseAdvancedExtensions().UseEmojiAndSmiley().UsePragmaLines().UseMathematics().Build();
            //}
            //else
            //{
            pipeLine = new MarkdownPipelineBuilder().UseAutoIdentifiers(AutoIdentifierOptions.GitHub).UseAdvancedExtensions().UseEmojiAndSmiley().UsePragmaLines().Build();
            //}

            string html = Markdig.Markdown.ToHtml(markdown, pipeLine);
            return html;
        }
        catch (Exception e)
        {
        }
        return "";
    }

    // この関数は、HmEditの編集中のテキストをHTMLに変換して、そのHTMLをHTTPで公開するサーバーを起動します。

    private Task StartTask(CancellationToken cts)
    {

        try
        {

            // HTTPリスナー作成
            listener = new HttpListener();

            // リスナー設定
            listener.Prefixes.Clear();
            listener.Prefixes.Add($"http://localhost:{port}/");

            // リスナー開始
            listener.Start();

            isRunning = true;

            while (isRunning)
            {
                try
                {
                    if (cts.IsCancellationRequested)
                    {
                        break;
                    }


                    // リクエスト取得
                    HttpListenerContext context = listener.GetContext();
                    context.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                    HttpListenerRequest request = context.Request;


                    // レスポンス取得
                    HttpListenerResponse response = context.Response;

                    // HTMLを表示する
                    if (request != null)
                    {
                        string requestedPath = request.Url.AbsolutePath;
                        if (requestedPath == "/gettotaltext")
                        {
                            string hmtext = GetTotalText();
                            byte[] text = Encoding.UTF8.GetBytes(hmtext);
                            response.ContentType = "text/html; charset=utf-8";
                            response.ContentEncoding = Encoding.UTF8;
                            response.OutputStream.Write(text, 0, text.Length);
                        }
                        else
                        {
                            // requestedPathの最初の文字をカット
                            // 2文字目以降を取得
                            try
                            {
                                string absolute_uri = request.Url.AbsoluteUri;
                                // absolute_uriの先頭から $"http://localhost:{port}/" を削除
                                absolute_uri = absolute_uri.Substring($"http://localhost:{port}/".Length);
                                string access_url = requestedPath.Substring(1);
                                string decode_url = WebUtility.UrlDecode(absolute_uri);
                                DefaultBrowserLauncher.Launch(decode_url);
                            }
                            catch (Exception e)
                            {
                                Hm.OutputPane.Output(e.Message + "\r\n");
                            }
                        }


                    }
                    else
                    {
                        response.StatusCode = 404;
                    }
                    response.Close();
                }
                catch (HttpListenerException e)
                {
                    if (e.ErrorCode == 995)
                    {
                        // キャンセルされた場合は、例外が発生するので、無視する。
                    }
                    else
                    {
                        Hm.OutputPane.Output(e.Message + "\r\n");
                    }
                }
                catch (OperationCanceledException e)
                {
                    // キャンセルされた場合は、例外が発生するので、無視する。
                }
                catch (ObjectDisposedException e)
                {
                    // キャンセルされた場合は、例外が発生するので、無視する。
                }
                catch (Exception e)
                {
                    Hm.OutputPane.Output(e.Message + "\r\n");
                }
            }

        }
        catch (Exception e)
        {
            Hm.OutputPane.Output(e.Message + "\r\n");
        }

        return Task.CompletedTask;
    }


    public int Close()
    {
        try
        {

            _ = Task.Run(() => CloseTask());
        }
        catch (Exception e)
        {
            // Hm.OutputPane.Output(e.Message + "\r\n");
        }

        try
        {
            dasmr = null;
        }
        catch (Exception)
        {

        }

        return 1;
    }

    public void OnReleaseObject(int reason = 0)
    {
        Close();
    }

    private void CloseTask()
    {
        if (listener != null)
        {
            isRunning = false;
            cts.Cancel();
            listener.Stop();
            listener.Close();
        }
    }
}