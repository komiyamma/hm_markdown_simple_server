using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using HmNetCOM;

namespace HmMarkdownSimpleServer;

internal class HmUsedPortChecker
{
    static List<int> portsInUse;
    public static int GetAvailablePort(int beginPort, int endPort)
    {
        try
        {
            var ipGP = IPGlobalProperties.GetIPGlobalProperties();
            var tcpEPs = ipGP.GetActiveTcpListeners();
            var udpEPs = ipGP.GetActiveUdpListeners();
            portsInUse = tcpEPs.Concat(udpEPs).Select(p => p.Port).ToList();

            for (int port = beginPort; port <= endPort; ++port)
            {
                if (!portsInUse.Contains(port))
                {
                    return port;
                }
            }
        } catch(Exception ex)
        {
            Hm.OutputPane.Output(ex.Message + "\r\n");
        }

        return 0; // 空きポートが見つからない場合
    }
}

