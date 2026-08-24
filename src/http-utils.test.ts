import { assertEquals } from "jsr:@std/assert";
import {
  clientIp,
  isIPv4,
  isIPv6,
  parseBasicAuth,
  timingSafeEqual,
} from "./http-utils.ts";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://ddns.example.com/update", { headers });
}

Deno.test("parseBasicAuth - decodes a valid header", () => {
  const header = `Basic ${btoa("router:s3cret")}`;
  const result = parseBasicAuth(requestWithHeaders({ authorization: header }));
  assertEquals(result, { username: "router", password: "s3cret" });
});

Deno.test("parseBasicAuth - password may contain colons", () => {
  const header = `Basic ${btoa("router:pass:with:colons")}`;
  const result = parseBasicAuth(requestWithHeaders({ authorization: header }));
  assertEquals(result, { username: "router", password: "pass:with:colons" });
});

Deno.test("parseBasicAuth - missing header returns null", () => {
  assertEquals(parseBasicAuth(requestWithHeaders({})), null);
});

Deno.test("parseBasicAuth - non-basic scheme returns null", () => {
  const result = parseBasicAuth(
    requestWithHeaders({ authorization: "Bearer abc123" }),
  );
  assertEquals(result, null);
});

Deno.test("parseBasicAuth - malformed base64 returns null", () => {
  const result = parseBasicAuth(
    requestWithHeaders({ authorization: "Basic not-valid-base64!" }),
  );
  assertEquals(result, null);
});

Deno.test("parseBasicAuth - missing colon separator returns null", () => {
  const header = `Basic ${btoa("no-colon-here")}`;
  const result = parseBasicAuth(requestWithHeaders({ authorization: header }));
  assertEquals(result, null);
});

Deno.test("clientIp - prefers x-real-ip", () => {
  const req = requestWithHeaders({
    "x-real-ip": "203.0.113.5",
    "x-forwarded-for": "198.51.100.1, 203.0.113.5",
  });
  assertEquals(clientIp(req), "203.0.113.5");
});

Deno.test("clientIp - falls back to first x-forwarded-for entry", () => {
  const req = requestWithHeaders({
    "x-forwarded-for": "198.51.100.1, 203.0.113.5",
  });
  assertEquals(clientIp(req), "198.51.100.1");
});

Deno.test("clientIp - returns null when absent", () => {
  assertEquals(clientIp(requestWithHeaders({})), null);
});

Deno.test("isIPv4 - accepts dotted quad", () => {
  assertEquals(isIPv4("203.0.113.5"), true);
});

Deno.test("isIPv4 - rejects out-of-range octets", () => {
  assertEquals(isIPv4("999.0.113.5"), false);
});

Deno.test("isIPv4 - rejects IPv6", () => {
  assertEquals(isIPv4("2001:db8::1"), false);
});

Deno.test("isIPv6 - accepts colon-separated address", () => {
  assertEquals(isIPv6("2001:db8::1"), true);
});

Deno.test("isIPv6 - rejects IPv4", () => {
  assertEquals(isIPv6("203.0.113.5"), false);
});

Deno.test("timingSafeEqual - equal strings", async () => {
  assertEquals(await timingSafeEqual("router:secret", "router:secret"), true);
});

Deno.test("timingSafeEqual - different strings", async () => {
  assertEquals(await timingSafeEqual("router:secret", "router:wrong"), false);
});

Deno.test("timingSafeEqual - different lengths", async () => {
  assertEquals(await timingSafeEqual("short", "a-much-longer-value"), false);
});
