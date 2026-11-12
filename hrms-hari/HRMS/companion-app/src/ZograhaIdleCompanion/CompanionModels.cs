using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ZograhaIdleCompanion;

public class IdlePolicyResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    [JsonPropertyName("idle_auto_clockout_enabled")]
    public bool? IdleAutoClockoutEnabled { get; set; }

    [JsonPropertyName("timeout_minutes")]
    public int? TimeoutMinutes { get; set; }

    [JsonPropertyName("idle_timeout_minutes")]
    public int? IdleTimeoutMinutes { get; set; }

    [JsonPropertyName("exempt")]
    public bool Exempt { get; set; }

    [JsonPropertyName("office_start_time")]
    public string? OfficeStartTime { get; set; }

    [JsonPropertyName("office_end_time")]
    public string? OfficeEndTime { get; set; }

    [JsonPropertyName("poll_seconds")]
    public int? PollSeconds { get; set; }

    [JsonPropertyName("exempt_app_names")]
    public List<string>? ExemptAppNames { get; set; }

    [JsonPropertyName("idle_exempt_app_names")]
    public List<string>? IdleExemptAppNames { get; set; }

    [JsonPropertyName("idle_grace_period_seconds")]
    public int? IdleGracePeriodSeconds { get; set; }

    [JsonPropertyName("auto_clock_back_in")]
    public bool? AutoClockBackIn { get; set; }

    [JsonPropertyName("auto_clock_back_in_window_minutes")]
    public int? AutoClockBackInWindowMinutes { get; set; }

    [JsonPropertyName("max_meeting_media_minutes")]
    public int? MaxMeetingMediaMinutes { get; set; }

    public bool IsFeatureEnabled()
    {
        if (IdleAutoClockoutEnabled.HasValue) return IdleAutoClockoutEnabled.Value;
        if (Enabled.HasValue) return Enabled.Value;
        return true;
    }

    public int GetEffectiveTimeoutMinutes()
    {
        if (IdleTimeoutMinutes.HasValue && IdleTimeoutMinutes.Value > 0) return IdleTimeoutMinutes.Value;
        if (TimeoutMinutes.HasValue && TimeoutMinutes.Value > 0) return TimeoutMinutes.Value;
        return 10;
    }

    public List<string> GetEffectiveExemptApps()
    {
        if (IdleExemptAppNames != null) return IdleExemptAppNames;
        if (ExemptAppNames != null) return ExemptAppNames;
        return new List<string>();
    }

    public string GetEffectiveStartTime()
    {
        return !string.IsNullOrWhiteSpace(OfficeStartTime) ? OfficeStartTime : "09:00";
    }

    public string GetEffectiveEndTime()
    {
        return !string.IsNullOrWhiteSpace(OfficeEndTime) ? OfficeEndTime : "18:00";
    }

    public int GetEffectivePollSeconds()
    {
        return (PollSeconds.HasValue && PollSeconds.Value > 0) ? PollSeconds.Value : 60;
    }

    public int GetEffectiveGracePeriodSeconds()
    {
        return (IdleGracePeriodSeconds.HasValue && IdleGracePeriodSeconds.Value > 0) ? IdleGracePeriodSeconds.Value : 60;
    }

    public int GetEffectiveMaxMeetingMediaMinutes()
    {
        return (MaxMeetingMediaMinutes.HasValue && MaxMeetingMediaMinutes.Value > 0) ? MaxMeetingMediaMinutes.Value : 90;
    }
}

public class HeartbeatPayload
{
    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("hostname")]
    public string Hostname { get; set; } = string.Empty;

    [JsonPropertyName("companion_version")]
    public string CompanionVersion { get; set; } = CompanionConfig.Version;

    [JsonPropertyName("idle_seconds")]
    public int IdleSeconds { get; set; }

    [JsonPropertyName("in_meeting")]
    public bool InMeeting { get; set; }

    [JsonPropertyName("media_active")]
    public bool MediaActive { get; set; }

    [JsonPropertyName("source")]
    public string Source { get; set; } = "companion";
}

public class HeartbeatResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("resumed")]
    public bool Resumed { get; set; }

    [JsonPropertyName("is_open_session")]
    public bool IsOpenSession { get; set; }

    [JsonPropertyName("timestamp")]
    public string? Timestamp { get; set; }
}

public class AutoClockOutPayload
{
    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("hostname")]
    public string Hostname { get; set; } = string.Empty;

    [JsonPropertyName("companion_version")]
    public string CompanionVersion { get; set; } = CompanionConfig.Version;

    [JsonPropertyName("idle_seconds")]
    public int IdleSeconds { get; set; }

    [JsonPropertyName("reported_at")]
    public string ReportedAt { get; set; } = string.Empty;
}

public class AutoClockOutResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("cancelled")]
    public bool Cancelled { get; set; }

    [JsonPropertyName("already_closed")]
    public bool AlreadyClosed { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public class EnrollPayload
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("device_name")]
    public string DeviceName { get; set; } = string.Empty;

    [JsonPropertyName("companion_version")]
    public string CompanionVersion { get; set; } = CompanionConfig.Version;
}

public class EnrollResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("token")]
    public string? Token { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

