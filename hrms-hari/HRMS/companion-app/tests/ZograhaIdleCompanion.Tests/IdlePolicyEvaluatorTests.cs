using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;
using ZograhaIdleCompanion;

namespace ZograhaIdleCompanion.Tests;

public class IdlePolicyEvaluatorTests
{
    [Fact]
    public void IsOfficeHours_WithinOfficeHours_ReturnsTrue()
    {
        // 10:30 IST = 05:00 UTC
        DateTime utc = new DateTime(2026, 10, 16, 5, 0, 0, DateTimeKind.Utc);
        bool result = IdlePolicyEvaluator.IsOfficeHours(utc, "09:00", "18:00");
        Assert.True(result);
    }

    [Fact]
    public void IsOfficeHours_BeforeOfficeHours_ReturnsFalse()
    {
        // 08:30 IST = 03:00 UTC
        DateTime utc = new DateTime(2026, 10, 16, 3, 0, 0, DateTimeKind.Utc);
        bool result = IdlePolicyEvaluator.IsOfficeHours(utc, "09:00", "18:00");
        Assert.False(result);
    }

    [Fact]
    public void IsOfficeHours_AfterOfficeHours_ReturnsFalse()
    {
        // 19:00 IST = 13:30 UTC
        DateTime utc = new DateTime(2026, 10, 16, 13, 30, 0, DateTimeKind.Utc);
        bool result = IdlePolicyEvaluator.IsOfficeHours(utc, "09:00", "18:00");
        Assert.False(result);
    }

    [Fact]
    public void IsOfficeHours_BoundaryStartAndEnd_ReturnsTrue()
    {
        // 09:00 IST = 03:30 UTC
        DateTime utcStart = new DateTime(2026, 10, 16, 3, 30, 0, DateTimeKind.Utc);
        Assert.True(IdlePolicyEvaluator.IsOfficeHours(utcStart, "09:00", "18:00"));

        // 18:00 IST = 12:30 UTC
        DateTime utcEnd = new DateTime(2026, 10, 16, 12, 30, 0, DateTimeKind.Utc);
        Assert.True(IdlePolicyEvaluator.IsOfficeHours(utcEnd, "09:00", "18:00"));
    }

    [Theory]
    [InlineData("", "18:00")]
    [InlineData("09:00", null)]
    [InlineData("invalid", "18:00")]
    public void IsOfficeHours_InvalidTime_ReturnsFalse(string? start, string? end)
    {
        DateTime utc = new DateTime(2026, 10, 16, 5, 0, 0, DateTimeKind.Utc);
        Assert.False(IdlePolicyEvaluator.IsOfficeHours(utc, start, end));
    }

    [Fact]
    public void IsAnyExemptAppRunning_MatchingProcess_ReturnsTrue()
    {
        var running = new List<string> { "chrome", "Code", "explorer", "zoom" };
        var exempt = new List<string> { "code.exe", "teams" };

        bool result = IdlePolicyEvaluator.IsAnyExemptAppRunning(running, exempt);
        Assert.True(result);
    }

    [Fact]
    public void IsAnyExemptAppRunning_CaseInsensitiveWithOrWithoutExe_ReturnsTrue()
    {
        var running = new List<string> { "vlc", "Teams" };
        var exempt = new List<string> { "VLC.EXE" };

        bool result = IdlePolicyEvaluator.IsAnyExemptAppRunning(running, exempt);
        Assert.True(result);

        var running2 = new List<string> { "zoom.exe" };
        var exempt2 = new List<string> { "ZOOM" };
        Assert.True(IdlePolicyEvaluator.IsAnyExemptAppRunning(running2, exempt2));
    }

    [Fact]
    public void IsAnyExemptAppRunning_NoMatch_ReturnsFalse()
    {
        var running = new List<string> { "notepad", "calculator" };
        var exempt = new List<string> { "zoom", "teams", "slack" };

        bool result = IdlePolicyEvaluator.IsAnyExemptAppRunning(running, exempt);
        Assert.False(result);
    }

    [Fact]
    public void IsAnyExemptAppRunning_EmptyOrNullLists_ReturnsFalse()
    {
        var running = new List<string> { "notepad" };
        Assert.False(IdlePolicyEvaluator.IsAnyExemptAppRunning(running, null));
        Assert.False(IdlePolicyEvaluator.IsAnyExemptAppRunning(running, new List<string>()));
    }

    [Theory]
    [InlineData(400, 300)]
    [InlineData(403, 300)]
    [InlineData(200, 0)]
    [InlineData(409, 0)]
    [InlineData(500, 0)]
    public void GetBackoffSeconds_SelectsCorrectBackoff(int statusCode, int expectedSeconds)
    {
        int actual = IdlePolicyEvaluator.GetBackoffSeconds(statusCode);
        Assert.Equal(expectedSeconds, actual);
    }

    [Fact]
    public void AutoClockOutPayload_ContainsOnlyIdleSecondsAndReportedAt()
    {
        var payload = new AutoClockOutPayload
        {
            IdleSeconds = 620,
            ReportedAt = "2026-10-16T10:15:30.0000000Z"
        };

        string json = JsonSerializer.Serialize(payload);
        var jsonNode = JsonNode.Parse(json)?.AsObject();

        Assert.NotNull(jsonNode);
        // Ensure exactly two keys exist
        Assert.Equal(2, jsonNode.Count);
        Assert.True(jsonNode.ContainsKey("idle_seconds"));
        Assert.True(jsonNode.ContainsKey("reported_at"));

        Assert.Equal(620, jsonNode["idle_seconds"]?.GetValue<int>());
        Assert.Equal("2026-10-16T10:15:30.0000000Z", jsonNode["reported_at"]?.GetValue<string>());

        // Privacy check: ensure no keys, titles, urls or clipboard are present
        Assert.False(jsonNode.ContainsKey("keys"));
        Assert.False(jsonNode.ContainsKey("title"));
        Assert.False(jsonNode.ContainsKey("window"));
        Assert.False(jsonNode.ContainsKey("url"));
        Assert.False(jsonNode.ContainsKey("keystrokes"));
    }
}

