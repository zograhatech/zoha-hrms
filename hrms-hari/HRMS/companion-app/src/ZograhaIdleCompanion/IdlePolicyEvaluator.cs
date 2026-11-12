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

    /// <summary>
    /// Determines whether the idle threshold is reached to initiate the grace period warning.
    /// </summary>
    public static bool ShouldStartGracePeriod(int idleSeconds, int timeoutMinutes, bool inMeeting, bool mediaActive)
    {
        int thresholdSeconds = timeoutMinutes * 60;
        return idleSeconds >= thresholdSeconds && !inMeeting && !mediaActive;
    }

    /// <summary>
    /// Checks whether user activity or active meeting/media cancels an active grace period.
    /// </summary>
    public static bool IsGracePeriodCancelled(int currentIdleSeconds, bool inMeeting, bool mediaActive)
    {
        return currentIdleSeconds < 5 || inMeeting || mediaActive;
    }

    /// <summary>
    /// Evaluates if meeting/media is active, subject to the configurable inactivity cap (default 90 min).
    /// If keyboard/mouse input has been inactive for longer than the cap, meeting/media is no longer counted.
    /// </summary>
    public static bool IsMeetingMediaActive(bool inMeeting, bool mediaActive, int rawIdleSeconds, int maxMeetingMediaMinutes = 90)
    {
        int maxSeconds = maxMeetingMediaMinutes * 60;
        if (rawIdleSeconds > maxSeconds)
        {
            return false;
        }
        return inMeeting || mediaActive;
    }

    /// <summary>
    /// Checks if a sudden jump in time occurred (indicating system sleep/suspend) requiring
    /// grace period evaluation before any clock-out action.
    /// </summary>
    public static bool IsSleepWakeJump(DateTime previousCheckUtc, DateTime currentUtc, int expectedIntervalSeconds = 15)
    {
        double elapsedSeconds = (currentUtc - previousCheckUtc).TotalSeconds;
        // If elapsed time is more than 3x the expected polling interval, system slept
        return elapsedSeconds > (expectedIntervalSeconds * 3);
    }
}

