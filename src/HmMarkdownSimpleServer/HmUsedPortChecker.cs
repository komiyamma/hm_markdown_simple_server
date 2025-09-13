using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.NetworkInformation;
using HmNetCOM;

namespace HmMarkdownSimpleServer;

internal class HmUsedPortChecker
{
    public static int GetAvailablePort(int beginPort, int endPort)
    {
        try
        {
            var ipGP = IPGlobalProperties.GetIPGlobalProperties();
            var tcpEPs = ipGP.GetActiveTcpListeners();
            var udpEPs = ipGP.GetActiveUdpListeners();

            // 重複排除しつつ、高速検索できるよう HashSet を使用（動作は不変）
            var portsInUse = new HashSet<int>(
                tcpEPs.Select(p => p.Port).Concat(udpEPs.Select(p => p.Port))
            );

            for (int port = beginPort; port <= endPort; ++port)
            {
                if (!portsInUse.Contains(port))
                {
                    return port;
                }
            }
        }
        catch (Exception ex)
        {
            Hm.OutputPane.Output(ex.Message + "\r\n");
        }

        return 0; // 空きポートが見つからない場合
    }
}

