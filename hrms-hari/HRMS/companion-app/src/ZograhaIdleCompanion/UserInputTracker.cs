using System;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace ZograhaIdleCompanion;

public static class UserInputTracker
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private static DateTime _lastSampleTime = DateTime.UtcNow;
    private static uint _lastSampleTick = (uint)Environment.TickCount;
    private static DateTime _wakeResetUntil = DateTime.MinValue;

    public static uint GetIdleTimeMs()
    {
        DateTime nowUtc = DateTime.UtcNow;
        uint tickCount = (uint)Environment.TickCount;

        // Detect sleep/wake jump: if wall-clock elapsed exceeds loop delay by > 20s
        double wallClockDelta = (nowUtc - _lastSampleTime).TotalSeconds;
        _lastSampleTime = nowUtc;
        _lastSampleTick = tickCount;

        if (wallClockDelta > 35) // Loop is 15s; >35s indicates laptop slept or modern standby
        {
            CompanionLogger.Log($"System sleep/wake event detected (delta: {wallClockDelta:F1}s). Suppressing idle for 60s.");
            _wakeResetUntil = nowUtc.AddSeconds(60);
            return 0;
        }

        if (nowUtc < _wakeResetUntil)
        {
            return 0;
        }

        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);

        if (GetLastInputInfo(ref lii))
        {
            return tickCount - lii.dwTime;
        }

        return 0;
    }

    public static int GetIdleSeconds()
    {
        uint idleMs = GetIdleTimeMs();
        return (int)(idleMs / 1000);
    }

    /// <summary>
    /// Checks whether the user is active in a call/meeting (microphone or webcam currently recording).
    /// Uses Windows CapabilityAccessManager ConsentStore registry keys.
    /// </summary>
    public static bool IsMicrophoneOrCameraActive()
    {
        try
        {
            string[] capabilities = new[] { "microphone", "webcam" };
            foreach (var cap in capabilities)
            {
                string keyPath = $@"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\{cap}";
                using var baseKey = Registry.CurrentUser.OpenSubKey(keyPath);
                if (baseKey == null) continue;

                if (CheckSubKeysForActiveUsage(baseKey)) return true;

                using var nonPackagedKey = baseKey.OpenSubKey("NonPackaged");
                if (nonPackagedKey != null && CheckSubKeysForActiveUsage(nonPackagedKey)) return true;
            }
        }
        catch { }

        return false;
    }

    private static bool CheckSubKeysForActiveUsage(RegistryKey parentKey)
    {
        try
        {
            foreach (var subKeyName in parentKey.GetSubKeyNames())
            {
                using var subKey = parentKey.OpenSubKey(subKeyName);
                if (subKey == null) continue;

                var stopTime = subKey.GetValue("LastUsedTimeStop");
                var startTime = subKey.GetValue("LastUsedTimeStart");

                // When an app is actively capturing audio/video, LastUsedTimeStop is 0 and Start > 0
                if (stopTime is long stopLong && stopLong == 0 && startTime is long startLong && startLong > 0)
                {
                    return true;
                }
            }
        }
        catch { }

        return false;
    }

    /// <summary>
    /// Checks whether a full-screen window (presentation, video player) is the foreground window.
    /// </summary>
    public static bool IsFullScreenOrMediaActive()
    {
        try
        {
            IntPtr fg = GetForegroundWindow();
            if (fg == IntPtr.Zero) return false;

            if (GetWindowRect(fg, out RECT rect))
            {
                int width = rect.Right - rect.Left;
                int height = rect.Bottom - rect.Top;
                int screenW = GetSystemMetrics(0); // SM_CXSCREEN
                int screenH = GetSystemMetrics(1); // SM_CYSCREEN

                if (screenW > 0 && screenH > 0 && width >= screenW && height >= screenH && rect.Left <= 0 && rect.Top <= 0)
                {
                    return true;
                }
            }
        }
        catch { }

        return false;
    }
}

