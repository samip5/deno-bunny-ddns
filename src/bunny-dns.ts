const BUNNY_API_BASE = "https://api.bunny.net";

export const DnsRecordType = {
  A: 0,
  AAAA: 1,
} as const;

export interface BunnyDnsRecord {
  Id: number;
  Type: number;
  Name: string;
  Value: string;
  Ttl: number;
}

export interface BunnyDnsZone {
  Id: number;
  Domain: string;
  Records: BunnyDnsRecord[];
}

export interface NewBunnyDnsRecord {
  Type: number;
  Name: string;
  Value: string;
  Ttl: number;
}

export interface DnsClient {
  getZone(zoneId: string): Promise<BunnyDnsZone>;
  updateRecord(zoneId: string, record: BunnyDnsRecord): Promise<void>;
  addRecord(zoneId: string, record: NewBunnyDnsRecord): Promise<BunnyDnsRecord>;
}

export class BunnyDnsClient implements DnsClient {
  constructor(private readonly apiKey: string) {}

  async getZone(zoneId: string): Promise<BunnyDnsZone> {
    const res = await fetch(`${BUNNY_API_BASE}/dnszone/${zoneId}`, {
      headers: { AccessKey: this.apiKey },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch DNS zone ${zoneId}: ${res.status} ${await res.text()}`,
      );
    }
    return await res.json();
  }

  async updateRecord(zoneId: string, record: BunnyDnsRecord): Promise<void> {
    const res = await fetch(
      `${BUNNY_API_BASE}/dnszone/${zoneId}/records/${record.Id}`,
      {
        method: "POST",
        headers: {
          AccessKey: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(record),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Failed to update DNS record ${record.Id}: ${res.status} ${await res
          .text()}`,
      );
    }
  }

  async addRecord(
    zoneId: string,
    record: NewBunnyDnsRecord,
  ): Promise<BunnyDnsRecord> {
    const res = await fetch(`${BUNNY_API_BASE}/dnszone/${zoneId}/records`, {
      method: "PUT",
      headers: {
        AccessKey: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to add DNS record: ${res.status} ${await res.text()}`,
      );
    }
    return await res.json();
  }
}
