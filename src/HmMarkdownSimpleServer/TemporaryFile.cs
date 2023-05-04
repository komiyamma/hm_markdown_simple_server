using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace HmMarkdownSimpleServer;

class TemporaryFile : IDisposable
{
    private string fullName = "";
    private bool disposedValue = false;

    public TemporaryFile()
    {
        string extension = ".html"; // 拡張子を指定
        string tempFile = Path.GetTempFileName(); // ランダムなTempファイル名を取得する
        string newTempFile = Path.ChangeExtension(tempFile, extension); // 拡張子を指定したTempファイル名を取得する
        File.Move(tempFile, newTempFile); // Tempファイルをリネームする

        fullName = newTempFile;
    }

    public string FullName
    {
        get => fullName;
    }

    public void Dispose()
    {
        //GC前にプログラム的にリソースを破棄するので
        //管理,非管理リソース両方が破棄されるようにする
        Dispose(true);
        GC.SuppressFinalize(this);//破棄処理は完了しているのでGC不要の合図
    }

    protected virtual void Dispose(bool disposing)
    {
        if (disposedValue)
        {
            return;
        }

        if (disposing)
        {
            //管理リソースの破棄処理
        }

        //非管理リソースの破棄処理
        try
        {
            File.Delete(this.fullName);
        }
        catch
        {
            throw;
        }

        disposedValue = true;
    }

    ~TemporaryFile()
    {
        //GC時に実行されるデストラクタでは非管理リソースの削除のみ
        Dispose(false);
    }
}
