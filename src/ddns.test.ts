import { assertEquals } from "jsr:@std/assert";
import {
  type BunnyDnsRecord,
  type BunnyDnsZone,
  type DnsClient,
  DnsRecordType,
  type NewBunnyDnsRecord,
} from "./bunny-dns.ts";
import {
  type DdnsConfig,
  handleUpdate,
  loadConfigFromEnv,
  relativeRecordName,
} from "./ddns.ts";

const config: DdnsConfig = {
  bunnyApiKey: "test-api-key",
  zoneId: "42",
  username: "router",
  password: "secret",
};

class FakeDnsClient implements DnsClient {
  updateCalls: BunnyDnsRecord[] = [];
  addCalls: NewBunnyDnsRecord[] = [];
  nextId = 100;

  constructor(private zone: BunnyDnsZone) {}

  getZone(zoneId: string): Promise<BunnyDnsZone> {
    assertEquals(zoneId, config.zoneId);
    return Promise.resolve(this.zone);
  }

  updateRecord(zoneId: string, record: BunnyDnsRecord): Promise<void> {
    assertEquals(zoneId, config.zoneId);
    this.updateCalls.push(record);
    return Promise.resolve();
  }

  addRecord(
    zoneId: string,
    record: NewBunnyDnsRecord,
  ): Promise<BunnyDnsRecord> {
    assertEquals(zoneId, config.zoneId);
    this.addCalls.push(record);
    const created = { ...record, Id: this.nextId++ };
    this.zone.Records.push(created);
    return Promise.resolve(created);
  }
}

function zoneFixture(records: BunnyDnsRecord[] = []): BunnyDnsZone {
  return { Id: 42, Domain: "example.com", Records: records };
}

Deno.test("relativeRecordName - subdomain within zone", () => {
  assertEquals(relativeRecordName("home.example.com", "example.com"), "home");
});

Deno.test("relativeRecordName - apex record", () => {
  assertEquals(relativeRecordName("example.com", "example.com"), "");
});

Deno.test("relativeRecordName - case insensitive and trailing dot", () => {
  assertEquals(relativeRecordName("Home.Example.com.", "example.com"), "home");
});

Deno.test("relativeRecordName - unrelated domain rejected", () => {
  assertEquals(relativeRecordName("evil.com", "example.com"), null);
});

Deno.test("relativeRecordName - suffix without dot boundary rejected", () => {
  assertEquals(relativeRecordName("notexample.com", "example.com"), null);
});

Deno.test("loadConfigFromEnv - returns null when incomplete", () => {
  const env = new Map([["BUNNY_API_KEY", "key"]]);
  const result = loadConfigFromEnv({ get: (k) => env.get(k) });
  assertEquals(result, null);
});

Deno.test("loadConfigFromEnv - returns config when complete", () => {
  const env = new Map([
    ["BUNNY_API_KEY", "key"],
    ["BUNNY_DNS_ZONE_ID", "42"],
    ["DDNS_USERNAME", "router"],
    ["DDNS_PASSWORD", "secret"],
  ]);
  const result = loadConfigFromEnv({ get: (k) => env.get(k) });
  assertEquals(result, {
    bunnyApiKey: "key",
    zoneId: "42",
    username: "router",
    password: "secret",
  });
});

Deno.test("handleUpdate - missing hostname", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const result = await handleUpdate(
    { hostname: null, ipv4: "203.0.113.5", ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 400, body: "notfqdn\n" });
});

Deno.test("handleUpdate - missing both addresses", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const result = await handleUpdate(
    { hostname: "home.example.com", ipv4: null, ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 400, body: "badagent\n" });
});

Deno.test("handleUpdate - hostname outside configured zone", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const result = await handleUpdate(
    { hostname: "home.evil.com", ipv4: "203.0.113.5", ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 404, body: "nohost\n" });
});

Deno.test("handleUpdate - creates a new A record when none exists", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const result = await handleUpdate(
    { hostname: "home.example.com", ipv4: "203.0.113.5", ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 200, body: "good 203.0.113.5\n" });
  assertEquals(client.addCalls, [
    { Type: DnsRecordType.A, Name: "home", Value: "203.0.113.5", Ttl: 300 },
  ]);
});

Deno.test("handleUpdate - updates an existing A record with a new value", async () => {
  const client = new FakeDnsClient(
    zoneFixture([
      {
        Id: 1,
        Type: DnsRecordType.A,
        Name: "home",
        Value: "203.0.113.1",
        Ttl: 300,
      },
    ]),
  );
  const result = await handleUpdate(
    { hostname: "home.example.com", ipv4: "203.0.113.5", ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 200, body: "good 203.0.113.5\n" });
  assertEquals(client.updateCalls, [
    {
      Id: 1,
      Type: DnsRecordType.A,
      Name: "home",
      Value: "203.0.113.5",
      Ttl: 300,
    },
  ]);
});

Deno.test("handleUpdate - reports no change when value is identical", async () => {
  const client = new FakeDnsClient(
    zoneFixture([
      {
        Id: 1,
        Type: DnsRecordType.A,
        Name: "home",
        Value: "203.0.113.5",
        Ttl: 300,
      },
    ]),
  );
  const result = await handleUpdate(
    { hostname: "home.example.com", ipv4: "203.0.113.5", ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 200, body: "nochg 203.0.113.5\n" });
  assertEquals(client.updateCalls, []);
  assertEquals(client.addCalls, []);
});

Deno.test("handleUpdate - updates A and AAAA independently in one request", async () => {
  const client = new FakeDnsClient(
    zoneFixture([
      {
        Id: 1,
        Type: DnsRecordType.A,
        Name: "home",
        Value: "203.0.113.1",
        Ttl: 300,
      },
    ]),
  );
  const result = await handleUpdate(
    {
      hostname: "home.example.com",
      ipv4: "203.0.113.5",
      ipv6: "2001:db8::1",
    },
    config,
    client,
  );
  assertEquals(result.status, 200);
  assertEquals(result.body, "good 203.0.113.5\ngood 2001:db8::1\n");
  assertEquals(client.updateCalls.length, 1);
  assertEquals(client.addCalls, [
    { Type: DnsRecordType.AAAA, Name: "home", Value: "2001:db8::1", Ttl: 300 },
  ]);
});

Deno.test("handleUpdate - apex hostname maps to empty record name", async () => {
  const client = new FakeDnsClient(zoneFixture());
  const result = await handleUpdate(
    { hostname: "example.com", ipv4: "203.0.113.5", ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 200, body: "good 203.0.113.5\n" });
  assertEquals(client.addCalls, [
    { Type: DnsRecordType.A, Name: "", Value: "203.0.113.5", Ttl: 300 },
  ]);
});

Deno.test("handleUpdate - surfaces zone lookup failures as 911", async () => {
  const client: DnsClient = {
    getZone: () => Promise.reject(new Error("boom")),
    updateRecord: () => Promise.reject(new Error("unused")),
    addRecord: () => Promise.reject(new Error("unused")),
  };
  const result = await handleUpdate(
    { hostname: "home.example.com", ipv4: "203.0.113.5", ipv6: null },
    config,
    client,
  );
  assertEquals(result, { status: 502, body: "911\n" });
});
