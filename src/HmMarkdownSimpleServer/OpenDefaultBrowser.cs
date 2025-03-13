using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Diagnostics;
using HmNetCOM;

namespace HmMarkdownSimpleServer;


internal static class DefaultBrowserLauncher
{
    public static void Launch(string url)
    {
        try
        {
            // ProcessStartInfoを作成し、UseShellExecuteをtrueに設定
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true // デフォルトブラウザを起動するために必要
            };

            // プロセスを開始
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            // エラー処理（必要に応じて）
            Hm.OutputPane.Output($"エラーが発生しました: {ex.Message}\r\n");
        }
    }
}
