import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../src/store/postgres/client", () => ({
  query: mocks.query,
}));

import { checkRateLimitBucket } from "../../src/store/postgres/rate_limits";

describe("store/postgres/rate_limits", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("throws when bucket key is empty", async () => {
    await expect(
      checkRateLimitBucket({
        bucketKey: "   ",
        limit: 10,
        windowMs: 60_000,
      }),
    ).rejects.toThrow("bucketKey is required");
  });

  it("throws when no row is returned by the upsert query", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    await expect(
      checkRateLimitBucket({
        bucketKey: "bucket-1",
        limit: 1,
        windowMs: 60_000,
        now: 1_000,
      }),
    ).rejects.toThrow("Rate limit update failed");
  });

  it("uses clamped limits and falls back to computed resetAt when db reset_at is invalid", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          count: "2",
          reset_at: "not-a-date",
        },
      ],
      rowCount: 1,
    });

    const output = await checkRateLimitBucket({
      bucketKey: "  bucket-a  ",
      limit: 0,
      windowMs: 500,
      now: 1_000,
    });

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO rate_limits"), ["bucket-a", 2_000]);
    expect(output).toEqual({
      allowed: false,
      count: 2,
      limit: 1,
      remaining: 0,
      resetAt: 2_000,
      retryAfterSeconds: 1,
    });
  });

  it("truncates bucket keys and clamps upper bound inputs", async () => {
    const longBucketKey = "x".repeat(600);
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          count: 1,
          reset_at: "1970-01-02T00:00:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const output = await checkRateLimitBucket({
      bucketKey: longBucketKey,
      limit: 20_000,
      windowMs: 2_000_000_000,
      now: 5_000,
    });

    const values = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect((values[0] as string).length).toBe(512);
    expect(values[1]).toBe(86_405_000);
    expect(output.limit).toBe(10_000);
    expect(output.allowed).toBe(true);
    expect(output.remaining).toBe(9_999);
  });

  it("maps returned reset_at timestamp and computes retry-after seconds", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          count: "3",
          reset_at: "1970-01-01T00:00:16.000Z",
        },
      ],
      rowCount: 1,
    });

    const output = await checkRateLimitBucket({
      bucketKey: "bucket-z",
      limit: 3,
      windowMs: 4_000,
      now: 10_000,
    });

    expect(output).toEqual({
      allowed: true,
      count: 3,
      limit: 3,
      remaining: 0,
      resetAt: 16_000,
      retryAfterSeconds: 6,
    });
  });
});
