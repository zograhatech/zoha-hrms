using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace ZograhaIdleCompanion;

public static class AutoStartManager
{
    public static void RegisterAutoStart()
    {
        try
        {
            string exePath = Process.GetCurrentProcess().MainModule?.FileName ??
                Environment.ProcessPath ??
                Path.Combine(AppContext.BaseDirectory, "ZograhaIdleSetup.exe");

            string command = $"\"{exePath}\" --run";

            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(CompanionConfig.RunRegistryKey, true);
            if (key != null)
            {
                key.SetValue(CompanionConfig.RunValueName, command, RegistryValueKind.String);
                CompanionLogger.Log("Auto-start registered in HKCU Run key successfully.");
            }
            else
            {
                CompanionLogger.Log("Could not open HKCU Run key for writing.");
            }
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Failed to register auto-start: {ex.Message}");
        }
    }

    public static void UnregisterAutoStart()
    {
        try
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(CompanionConfig.RunRegistryKey, true);
            if (key != null)
            {
                if (key.GetValue(CompanionConfig.RunValueName) != null)
                {
                    key.DeleteValue(CompanionConfig.RunValueName, false);
                    CompanionLogger.Log("Auto-start removed from HKCU Run key.");
                }
            }
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Failed to unregister auto-start: {ex.Message}");
        }
    }
}

