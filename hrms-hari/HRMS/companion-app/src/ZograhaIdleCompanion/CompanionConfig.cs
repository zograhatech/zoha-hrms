using System;
using System.IO;

namespace ZograhaIdleCompanion;

public static class CompanionConfig
{
    public const string BackendUrl = "https://zoha-hrms.vercel.app";
    public const string MutexName = @"Global\ZograhaIdleCompanion";
    public const string RunRegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    public const string RunValueName = "ZograhaIdleCompanion";

    public static string AppDataFolder =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ZograhaIdle");

    public static string TokenFilePath =>
        Path.Combine(AppDataFolder, "token.bin");

    public static string LogFilePath =>
        Path.Combine(AppDataFolder, "companion.log");

    public static string StopFlagPath =>
        Path.Combine(AppDataFolder, "stop.flag");
}

