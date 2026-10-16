using System;
using System.Runtime.InteropServices;

namespace ZograhaIdleCompanion;

public static class UserInputTracker
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    public static uint GetIdleTimeMs()
    {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);

        if (GetLastInputInfo(ref lii))
        {
            uint tickCount = (uint)Environment.TickCount;
            return tickCount - lii.dwTime;
        }

        return 0;
    }

    public static int GetIdleSeconds()
    {
        uint idleMs = GetIdleTimeMs();
        return (int)(idleMs / 1000);
    }
}

