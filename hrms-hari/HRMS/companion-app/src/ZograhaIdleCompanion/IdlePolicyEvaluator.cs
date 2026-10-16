using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace ZograhaIdleCompanion;

public static class IdlePolicyEvaluator
{
    public static readonly TimeSpan IstOffset = TimeSpan.FromHours(5.5); // UTC + 5:30

    /// <summary>
    /// Checks whether the given UTC time falls within the configured IST office hours.
    /// </summary>
    public static bool IsOfficeHours(DateTime utcNow, string? startTimeStr, string? endTimeStr)
    {
        if (string.IsNullOrWhiteSpace(startTimeStr) || string.IsNullOrWhiteSpace(endTimeStr))
        {
            return false;
        }

        DateTime istTime = utcNow + IstOffset;
        int currentMinutes = (istTime.Hour * 60) + istTime.Minute;

        if (!TryParseTimeToMinutes(startTimeStr, out int startMinutes) ||
            !TryParseTimeToMinutes(endTimeStr, out int endMinutes))
        {
            return false;
        }

        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    private static bool TryParseTimeToMinutes(string timeStr, out int totalMinutes)
    {
        totalMinutes = 0;
        string[] parts = timeStr.Trim().Split(':');
        if (parts.Length < 2) return false;

        if (int.TryParse(parts[0], out int h) && int.TryParse(parts[1], out int m))
        {
            totalMinutes = (h * 60) + m;
            return true;
        }

        return false;
    }

    /// <summary>
    /// Checks if any running process matches the exempt applications list (case-insensitive, ignoring optional .exe suffix).
    /// </summary>
    public static bool IsAnyExemptAppRunning(IEnumerable<string> runningProcessNames, IEnumerable<string>? exemptAppNames)
    {
        if (exemptAppNames == null) return false;

        var runningSet = new HashSet<string>(
            runningProcessNames.Select(NormalizeAppName),
            StringComparer.OrdinalIgnoreCase
        );

        foreach (var exempt in exemptAppNames)
        {
            if (string.IsNullOrWhiteSpace(exempt)) continue;
            string normalizedExempt = NormalizeAppName(exempt);
            if (runningSet.Contains(normalizedExempt))
            {
                return true;
            }
        }

        return false;
    }

    public static string NormalizeAppName(string name)
    {
        string trimmed = name.Trim();
        if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed.Substring(0, trimmed.Length - 4);
        }
        return trimmed;
    }

    /// <summary>
    /// Returns the backoff duration in seconds depending on HTTP status code.
    /// 400 or 403 on clock-out: wait 5 minutes (300 s).
    /// 200 or 409: 0 seconds (enter standby).
    /// Other: 0 s.
    /// </summary>
    public static int GetBackoffSeconds(int httpStatusCode)
    {
        if (httpStatusCode == 400 || httpStatusCode == 403)
        {
            return 300; // 5 minutes
        }
        return 0;
    }
}

