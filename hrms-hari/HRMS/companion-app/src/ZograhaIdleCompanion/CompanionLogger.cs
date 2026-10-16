using System;
using System.IO;
using System.Text;

namespace ZograhaIdleCompanion;

public static class CompanionLogger
{
    private const long MaxLogSizeBytes = 1024 * 1024; // 1 MB
    private static readonly object LogLock = new();

    public static void Log(string message)
    {
        string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        string line = $"[{timestamp}] {message}";
        Console.WriteLine(line);

        try
        {
            lock (LogLock)
            {
                string dir = Path.GetDirectoryName(CompanionConfig.LogFilePath)!;
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                FileInfo fi = new FileInfo(CompanionConfig.LogFilePath);
                if (fi.Exists && fi.Length > MaxLogSizeBytes)
                {
                    // Rotate log file: keep previous as .old
                    string oldLog = CompanionConfig.LogFilePath + ".old";
                    try
                    {
                        if (File.Exists(oldLog))
                        {
                            File.Delete(oldLog);
                        }
                        File.Move(CompanionConfig.LogFilePath, oldLog);
                    }
                    catch
                    {
                        // Fallback: truncate
                        File.WriteAllText(CompanionConfig.LogFilePath, string.Empty);
                    }
                }

                File.AppendAllText(CompanionConfig.LogFilePath, line + Environment.NewLine, Encoding.UTF8);
            }
        }
        catch
        {
            // Logging should never crash the companion
        }
    }
}

