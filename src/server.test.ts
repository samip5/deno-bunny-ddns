import { assertEquals } from "jsr:@std/assert";
import type {
  BunnyDnsRecord,
  BunnyDnsZone,
  DnsClient,
  NewBunnyDnsRecord,
} from "./bunny-dns.ts";
import { DnsRecordType } from "./bunny-dns.ts";
import type { DdnsConfig } from "./ddns.ts";
import { handleRequest } from "./server.ts";

const config: DdnsConfig = {
  bunnyApiKey: "test-api-key",
  zoneId: "42",
  username: "router",
  password: "secret",
};

class FakeDnsClient implements DnsClient {
  addCalls: NewBunnyDnsRecord[] = [];

  constructor(private zone: BunnyDnsZone) {}

  getZone(): Promise<BunnyDnsZone> {
    return Promise.resolve(this.zone);
  }

  updateRecord(): Promise<void> {
    return Promise.resolve();
  }

  addRecord(
    _zoneId: string,
    record: NewBunnyDnsRecord,
  ): Promise<BunnyDnsRecord> {
    this.addCalls.push(record);
    return Promise.resolve({ ...record, Id: 1 });
  }
}

function zoneFixture(records: BunnyDnsRecord[] = []): BunnyDnsZone {
  return { Id: 42, Domain: "example.com", Records: records };
}

function authHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

Deno.test("handleRequest - health check on root", async () => {
  const req = new Request("https://ddns.example.com/");
  const res = await handleRequest(
    req,
    config,
    new FakeDnsClient(zoneFixture()),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "OK\n");
});

Deno.test("handleRequest - unknown path is 404", async () => {
  const req = new Request("https://ddns.example.com/nope");
  const res = await handleRequest(
    req,
    config,
    new FakeDnsClient(zoneFixture()),
  );
  assertEquals(res.status, 404);
});

Deno.test("handleRequest - missing credentials are rejected", async () => {
  const req = new Request(
    "https://ddns.example.com/update?hostname=home.example.com&myip=203.0.113.5",
  );
  const res = await handleRequest(
    req,
    config,
    new FakeDnsClient(zoneFixture()),
  );
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("WWW-Authenticate"), 'Basic realm="ddns"');
  assertEquals(await res.text(), "badauth\n");
});

Deno.test("handleRequest - wrong password is rejected", async () => {
  const req = new Request(
    "https://ddns.example.com/update?hostname=home.example.com&myip=203.0.113.5",
    { headers: { authorization: authHeader("router", "wrong") } },
  );
  const res = await handleRequest(
    req,
    config,
    new FakeDnsClient(zoneFixture()),
  );
  assertEquals(res.status, 401);
});

Deno.test("handleRequest - explicit myip is used as-is", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const req = new Request(
    "https://ddns.example.com/update?hostname=home.example.com&myip=203.0.113.5",
    { headers: { authorization: authHeader("router", "secret") } },
  );
  const res = await handleRequest(req, config, client);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "good 203.0.113.5\n");
  assertEquals(client.addCalls, [
    { Type: DnsRecordType.A, Name: "home", Value: "203.0.113.5", Ttl: 300 },
  ]);
});

Deno.test("handleRequest - malformed explicit myip is rejected", async () => {
  const req = new Request(
    "https://ddns.example.com/update?hostname=home.example.com&myip=not-an-ip",
    { headers: { authorization: authHeader("router", "secret") } },
  );
  const res = await handleRequest(
    req,
    config,
    new FakeDnsClient(zoneFixture()),
  );
  assertEquals(res.status, 400);
  assertEquals(await res.text(), "badagent\n");
});

Deno.test("handleRequest - falls back to the observed IPv4 when myip is omitted", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const req = new Request(
    "https://ddns.example.com/update?hostname=home.example.com",
    {
      headers: {
        authorization: authHeader("router", "secret"),
        "x-real-ip": "198.51.100.9",
      },
    },
  );
  const res = await handleRequest(req, config, client);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "good 198.51.100.9\n");
});

Deno.test("handleRequest - explicit myip and myipv6 both applied", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const req = new Request(
    "https://ddns.example.com/update?hostname=home.example.com&myip=203.0.113.5&myipv6=2001:db8::1",
    { headers: { authorization: authHeader("router", "secret") } },
  );
  const res = await handleRequest(req, config, client);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "good 203.0.113.5\ngood 2001:db8::1\n");
  assertEquals(client.addCalls.length, 2);
});

Deno.test("handleRequest - no resolvable address is rejected", async () => {
  const req = new Request(
    "https://ddns.example.com/update?hostname=home.example.com",
    { headers: { authorization: authHeader("router", "secret") } },
  );
  const res = await handleRequest(
    req,
    config,
    new FakeDnsClient(zoneFixture()),
  );
  assertEquals(res.status, 400);
  assertEquals(await res.text(), "badagent\n");
});
