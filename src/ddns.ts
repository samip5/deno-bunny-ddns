import {
  type BunnyDnsZone,
  type DnsClient,
  DnsRecordType,
} from "./bunny-dns.ts";

export interface DdnsConfig {
  bunnyApiKey: string;
  zoneId: string;
  username: string;
  password: string;
}

export interface EnvReader {
  get(key: string): string | undefined;
}

export function loadConfigFromEnv(env: EnvReader): DdnsConfig | null {
  const bunnyApiKey = env.get("BUNNY_API_KEY");
  const zoneId = env.get("BUNNY_DNS_ZONE_ID");
  const username = env.get("DDNS_USERNAME");
  const password = env.get("DDNS_PASSWORD");
  if (!bunnyApiKey || !zoneId || !username || !password) {
    return null;
  }
  return { bunnyApiKey, zoneId, username, password };
}

/**
 * Maps a fully qualified hostname onto the record name that is relative to
 * the zone's domain (e.g. "home.example.com" + "example.com" -> "home").
 * Returns null when the hostname does not belong to the zone.
 */
export function relativeRecordName(
  hostname: string,
  zoneDomain: string,
): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const zone = zoneDomain.toLowerCase().replace(/\.$/, "");
  if (host === zone) return "";
  if (host.endsWith(`.${zone}`)) return host.slice(0, -(zone.length + 1));
  return null;
}

export interface UpdateRequest {
  hostname: string | null;
  ipv4: string | null;
  ipv6: string | null;
}

export interface UpdateResult {
  status: number;
  body: string;
}

async function applyAddressUpdate(
  client: DnsClient,
  zoneId: string,
  zone: BunnyDnsZone,
  recordName: string,
  type: number,
  value: string,
): Promise<"good" | "nochg"> {
  const existing = zone.Records.find(
    (r) => r.Type === type && r.Name.toLowerCase() === recordName.toLowerCase(),
  );
  if (existing) {
    if (existing.Value.toLowerCase() === value.toLowerCase()) {
      return "nochg";
    }
    await client.updateRecord(zoneId, { ...existing, Value: value });
    return "good";
  }
  await client.addRecord(zoneId, {
    Type: type,
    Name: recordName,
    Value: value,
    Ttl: 300,
  });
  return "good";
}

export async function handleUpdate(
  request: UpdateRequest,
  config: DdnsConfig,
  client: DnsClient,
): Promise<UpdateResult> {
  if (!request.hostname) {
    return { status: 400, body: "notfqdn\n" };
  }
  if (!request.ipv4 && !request.ipv6) {
    return { status: 400, body: "badagent\n" };
  }

  let zone: BunnyDnsZone;
  try {
    zone = await client.getZone(config.zoneId);
  } catch (err) {
    console.error("Failed to fetch DNS zone", err);
    return { status: 502, body: "911\n" };
  }

  const recordName = relativeRecordName(request.hostname, zone.Domain);
  if (recordName === null) {
    return { status: 404, body: "nohost\n" };
  }

  const lines: string[] = [];
  try {
    if (request.ipv4) {
      const result = await applyAddressUpdate(
        client,
        config.zoneId,
        zone,
        recordName,
        DnsRecordType.A,
        request.ipv4,
      );
      lines.push(`${result} ${request.ipv4}`);
    }
    if (request.ipv6) {
      const result = await applyAddressUpdate(
        client,
        config.zoneId,
        zone,
        recordName,
        DnsRecordType.AAAA,
        request.ipv6,
      );
      lines.push(`${result} ${request.ipv6}`);
    }
  } catch (err) {
    console.error("Failed to update DNS record", err);
    return { status: 502, body: "911\n" };
  }

  return { status: 200, body: lines.join("\n") + "\n" };
}
