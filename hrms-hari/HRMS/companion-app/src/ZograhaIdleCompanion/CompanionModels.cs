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
}

public class AutoClockOutPayload
{
    [JsonPropertyName("idle_seconds")]
    public int IdleSeconds { get; set; }

    [JsonPropertyName("reported_at")]
    public string ReportedAt { get; set; } = string.Empty;
}

public class EnrollPayload
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("device_name")]
    public string DeviceName { get; set; } = string.Empty;
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

